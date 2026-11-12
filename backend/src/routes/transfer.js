const express = require('express');
const path = require('path');
const fs = require('fs');
const store = require('../store');
const { authMiddleware, requireAdmin } = require('../auth');
const scanner = require('../scanner');
const groupsService = require('../services/groups');

const router = express.Router();

const ASSETS_DIR = path.join(__dirname, '../../../data/assets');
const BUNDLE_FORMAT = 'hmi-studio-bundle';
// v2 carries the `groups` collection + object `editGroup` tags. v1 bundles
// (numeric widgetLevel / required_level) are still accepted and remapped.
const BUNDLE_VERSION = 2;

// Merge bundle groups into the local store by NAME. Returns a Map<srcId, localId>
// so imported pages can have their editGroup ids remapped to local ids. Existing
// local groups (same name) are reused as-is; missing ones are created (with their
// includes re-wired through the id map in a second pass).
function mergeGroups(bundleGroups, result) {
  const localByName = new Map(store.groups.all().map((g) => [g.name, g]));
  const idMap = new Map();
  const created = [];
  for (const sg of bundleGroups || []) {
    const existing = localByName.get(sg.name);
    if (existing) { idMap.set(Number(sg.id), Number(existing.id)); continue; }
    const row = store.groups.insert({
      name: sg.name, includes: [], manageUsers: !!sg.manageUsers, editMode: !!sg.editMode, viewAudit: !!sg.viewAudit, builtin: false,
    });
    idMap.set(Number(sg.id), Number(row.id));
    created.push({ src: sg, localId: row.id });
    if (result) result.warnings.push(`Group '${sg.name}' created on import`);
  }
  for (const { src, localId } of created) {
    const includes = (src.includes || []).map((id) => idMap.get(Number(id))).filter((v) => v != null);
    store.groups.update((g) => g.id === localId, { includes });
  }
  return idMap;
}

// Resolve an imported page's group tags to LOCAL ids. v2: remap widget/page
// editGroup through idMap. v1 (idMap null): remap numeric widgetLevel/required_level.
function normalizeImportedPage(p, idMap) {
  const L = groupsService.LEGACY_LEVEL_TO_GROUP;
  const def = (p.definition && typeof p.definition === 'object') ? p.definition : parseDef(p.definition);
  const mapId = (gid) => (gid == null ? null : (idMap ? (idMap.get(Number(gid)) ?? null) : null));
  const widgets = (def.widgets || []).map((w) => {
    if (!w || !w.props) return w;
    const props = { ...w.props };
    if ('editGroup' in props) {
      // A widget's editGroup may be a single id or an array of ids; remap each.
      props.editGroup = Array.isArray(props.editGroup)
        ? props.editGroup.map(mapId).filter((g) => g != null)
        : mapId(props.editGroup);
    } else if ('widgetLevel' in props) {
      const lvl = Number(props.widgetLevel) || 0;
      delete props.widgetLevel;
      if (lvl > 0) props.editGroup = L[lvl] || 3;
    }
    return { ...w, props };
  });
  let editGroup = p.editGroup ?? null;
  if (idMap) editGroup = mapId(editGroup);
  else if (editGroup == null && (Number(p.required_level) || 0) > 0) editGroup = L[Number(p.required_level)] || 3;
  // Page visibility groups: remap through the merged group ids. A legacy (v1)
  // bundle predates the setting → public.
  const viewGroups = (idMap && Array.isArray(p.viewGroups))
    ? p.viewGroups.map(mapId).filter((g) => g != null) : [];
  return { definition: { ...def, widgets }, editGroup, viewGroups };
}

// Pull every /api/assets/file/<name> reference out of a page definition so we
// know which image/stl files must travel with the pages.
function extractAssetNames(defStr) {
  const names = new Set();
  const re = /\/api\/assets\/file\/([^"'\\\s)]+)/g;
  let m;
  while ((m = re.exec(defStr)) !== null) {
    try { names.add(decodeURIComponent(m[1])); } catch { names.add(m[1]); }
  }
  return names;
}

function parseDef(def) {
  if (def == null) return { widgets: [] };
  return typeof def === 'string' ? JSON.parse(def) : def;
}

router.use(authMiddleware);

// ── Export selected (or all) pages + the assets they reference ───────────────
// POST /api/transfer/export  body: { names?: string[] }   (omit/empty = all)
router.post('/export', requireAdmin, async (req, res) => {
  try {
    const wanted = Array.isArray(req.body?.names) ? req.body.names : null;
    const rows = store.pages.all();
    const selected = (wanted && wanted.length)
      ? rows.filter(r => wanted.includes(r.name))
      : rows;

    const assetNames = new Set();
    const pages = selected.map(r => {
      const defStr = typeof r.definition === 'string' ? r.definition : JSON.stringify(r.definition ?? { widgets: [] });
      extractAssetNames(defStr).forEach(n => assetNames.add(n));
      return {
        name: r.name, title: r.title, page_type: r.page_type,
        definition: parseDef(r.definition), nav_order: r.nav_order,
        required_level: r.required_level, editGroup: r.editGroup ?? null,
        viewGroups: Array.isArray(r.viewGroups) ? r.viewGroups : [], is_home: r.is_home,
      };
    });

    const assets = [];
    const missingAssets = [];
    for (const name of assetNames) {
      const safe = path.basename(name);
      const file = path.join(ASSETS_DIR, safe);
      if (fs.existsSync(file)) {
        assets.push({ name: safe, data: fs.readFileSync(file).toString('base64') });
      } else {
        missingAssets.push(safe);
      }
    }

    // Carry the whole group set so the importer can recreate referenced groups
    // (and their hierarchy) and remap editGroup ids by name.
    const groups = store.groups.all().map((g) => ({ ...g, includes: [...(g.includes || [])] }));

    res.json({
      format: BUNDLE_FORMAT, version: BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      source: 'hmi-studio', pageCount: pages.length, assetCount: assets.length, groupCount: groups.length,
      missingAssets, pages, assets, groups,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Import a bundle: write assets, upsert pages ──────────────────────────────
// POST /api/transfer/import  body: { bundle, overwriteAssets?: bool, overwritePages?: bool }
router.post('/import', requireAdmin, async (req, res) => {
  const { bundle, overwriteAssets = false, overwritePages = true } = req.body || {};
  if (!bundle || bundle.format !== BUNDLE_FORMAT) {
    return res.status(400).json({ error: 'Not a valid HMI Studio bundle' });
  }
  if (bundle.version > BUNDLE_VERSION) {
    return res.status(400).json({ error: `Bundle version ${bundle.version} is newer than supported (${BUNDLE_VERSION})` });
  }
  const result = { assetsWritten: 0, assetsSkipped: 0, pagesImported: 0, pagesSkipped: 0, groupsCreated: 0, warnings: [] };
  try {
    if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

    // 0) groups — merge by name (v2 bundles only). idMap remaps editGroup ids;
    //    v1 bundles have no groups → idMap stays null and numeric levels remap.
    const beforeGroups = store.groups.all().length;
    const idMap = Array.isArray(bundle.groups) ? mergeGroups(bundle.groups, result) : null;
    result.groupsCreated = store.groups.all().length - beforeGroups;

    // 1) assets
    for (const a of (bundle.assets || [])) {
      const safe = path.basename(a.name || '');
      if (!safe) { result.warnings.push('Skipped asset with empty name'); continue; }
      const dest = path.join(ASSETS_DIR, safe);
      if (fs.existsSync(dest) && !overwriteAssets) { result.assetsSkipped++; continue; }
      fs.writeFileSync(dest, Buffer.from(a.data, 'base64'));
      result.assetsWritten++;
    }

    // 2) pages (upsert by name), with group tags resolved to local ids
    for (const p of (bundle.pages || [])) {
      if (!p.name) { result.warnings.push('Skipped page with no name'); continue; }
      const { definition, editGroup, viewGroups } = normalizeImportedPage(p, idMap);
      const existing = store.pages.find((x) => x.name === p.name);
      if (existing) {
        if (!overwritePages) { result.pagesSkipped++; result.warnings.push(`Page '${p.name}' already exists — skipped`); continue; }
        store.pages.update((x) => x.name === p.name, {
          title: p.title || p.name,
          page_type: p.page_type || 'standard', definition,
          nav_order: p.nav_order || 0,
          required_level: p.required_level || 0, editGroup, viewGroups, is_home: p.is_home ? 1 : 0,
          updated_at: store.now(),
        });
        scanner.invalidatePage(p.name);
      } else {
        store.pages.insert({
          name: p.name, title: p.title || p.name,
          page_type: p.page_type || 'standard', definition,
          nav_order: p.nav_order || 0,
          required_level: p.required_level || 0, editGroup, viewGroups, is_home: p.is_home ? 1 : 0,
          created_by: req.user.id, created_at: store.now(), updated_at: store.now(),
        });
      }
      result.pagesImported++;
    }

    res.json({ ok: true, ...result });
  } catch (e) { res.status(500).json({ error: e.message, ...result }); }
});

module.exports = router;
