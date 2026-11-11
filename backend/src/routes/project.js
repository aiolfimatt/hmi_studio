/**
 * Project / runtime management.
 *
 * The HMI has a SINGLE runtime configuration — the live data/*.json store that
 * the runtime screens serve. A mirror of it is kept on the server as one file,
 *   data/projects/runtime.hmiproj
 * so "the runtime version" always resides on the server as a portable bundle.
 * The client saves it (download) and loads it (upload) as a .hmiproj file.
 *
 * A project/runtime bundles EVERYTHING a designer edits:
 *   - pages (+ widgets), alarm definitions, recipes, app/sidebar settings, and
 *     an asset MANIFEST (names only).
 * It deliberately excludes user accounts and runtime/historical data (batches,
 * active alarms, PLC trace).
 *
 * Assets (images/STL) are NOT inlined. The real files live on the server in
 * data/assets/ (the source of truth); a bundle lists only their names, keeping
 * a .hmiproj tiny (~KB instead of tens of MB of base64). Consequence: a bundle
 * is not self-contained — loading one on a machine that lacks those asset files
 * leaves the references dangling (reported as warnings). Legacy bundles that
 * still carry inlined `data` are accepted on load and materialised to disk.
 *
 *   GET  /api/project/info      admin      → { exists, savedAt, counts } of the runtime
 *   POST /api/project/save      admin      → write the live config to runtime.hmiproj
 *   GET  /api/project/download  admin      → download the runtime as a .hmiproj
 *   POST /api/project/load      admin, L3  → REPLACE the runtime from an uploaded .hmiproj
 *   POST /api/project/new       admin, L3  → blank the runtime
 *
 * Load / New replace or clear the live config, hence level-3; the frontend also
 * confirms before calling them.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const store = require('../store');
const pkg = require('../../package.json');
const { authMiddleware, requireAdmin, requireLevel } = require('../auth');
const scanner = require('../scanner');
const groupsService = require('../services/groups');

const router = express.Router();

const ASSETS_DIR = path.join(__dirname, '../../../data/assets');
const PROJECTS_DIR = path.join(__dirname, '../../../data/projects');
const RUNTIME_FILE = path.join(PROJECTS_DIR, 'runtime.hmiproj');
// Free-text program version tag shown at runtime. Stored in app settings so it
// travels inside the project bundle (settings are part of a .hmiproj).
const PROGRAM_VERSION_KEY = 'programVersion';
const PROJECT_FORMAT = 'hmi-studio-project';
// v2 adds the `groups` collection (named groups + inheritance DAG) and object
// `editGroup` tags. v1 bundles (numeric levels) are still accepted and remapped.
const PROJECT_VERSION = 2;
const EXT = '.hmiproj';
const ASSET_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.stl']);

if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });

// Keep a client-supplied download name filename-safe.
function sanitize(name) {
  const base = path.basename(String(name || '')).replace(new RegExp(`\\${EXT}$`, 'i'), '');
  return base.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^[_.]+|[_.]+$/g, '');
}

function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function parseDef(def) {
  if (def == null) return { widgets: [] };
  return typeof def === 'string' ? JSON.parse(def) : def;
}
function exportPage(r) {
  return {
    name: r.name, title: r.title, page_type: r.page_type,
    definition: parseDef(r.definition), nav_order: r.nav_order,
    required_level: r.required_level, editGroup: r.editGroup ?? null, is_home: r.is_home,
  };
}
// Asset MANIFEST — names only. The bytes stay in data/assets/ (source of truth)
// and are deliberately NOT inlined, so bundles stay small. See the file header.
function listAssets() {
  if (!fs.existsSync(ASSETS_DIR)) return [];
  return fs.readdirSync(ASSETS_DIR)
    .filter((n) => ASSET_EXTS.has(path.extname(n).toLowerCase()))
    .map((name) => ({ name }));
}

function liveCounts() {
  return {
    pages: store.pages.count(),
    alarms: store.alarmDefinitions.count(),
    recipes: store.recipes.count(),
    assets: fs.existsSync(ASSETS_DIR)
      ? fs.readdirSync(ASSETS_DIR).filter((n) => ASSET_EXTS.has(path.extname(n).toLowerCase())).length
      : 0,
  };
}

// Snapshot the live working set into a portable bundle.
function buildBundle(name) {
  const pages = store.pages.all().map(exportPage);
  const assets = listAssets();
  const alarmDefinitions = store.alarmDefinitions.all().map((r) => ({ ...r }));
  const alarmLists = store.alarmLists.all().map((r) => ({ ...r, entries: (r.entries || []).map((e) => ({ ...e })) }));
  const widgetLibrary = store.widgetLibrary.all().map((r) => ({ ...r, widgets: (r.widgets || []).map((w) => ({ ...w })) }));
  const recipes = store.recipes.all().map((r) => ({ ...r }));
  const groups = store.groups.all().map((r) => ({ ...r, includes: [...(r.includes || [])] }));
  const settings = { ...store.settings.all() };
  // Machine / PLC config travels with the project (the machine is what the HMI
  // connects to). Deployment infra (conf.json: secrets, ports, features) does NOT.
  const machines = store.machines.all().map((m) => ({ ...m }));
  return {
    format: PROJECT_FORMAT, version: PROJECT_VERSION, appVersion: pkg.version,
    exportedAt: new Date().toISOString(), source: 'hmi-studio', name: name || 'hmi-runtime',
    counts: { pages: pages.length, assets: assets.length, alarms: alarmDefinitions.length, recipes: recipes.length, groups: groups.length },
    pages, assets, alarmDefinitions, alarmLists, widgetLibrary, recipes, groups, settings, machines,
  };
}

// Remap a v1 (numeric-level) page to the group model: widget widgetLevel →
// editGroup (0/absent = unprotected) and page required_level → editGroup.
function remapLegacyPage(p) {
  const L = groupsService.LEGACY_LEVEL_TO_GROUP;
  const def = (p.definition && typeof p.definition === 'object') ? p.definition : { widgets: [] };
  const widgets = (def.widgets || []).map((w) => {
    if (!w || !w.props || !('widgetLevel' in w.props)) return w;
    const { widgetLevel, ...props } = w.props;
    const lvl = Number(widgetLevel) || 0;
    if (lvl > 0) props.editGroup = L[lvl] || 3;
    return { ...w, props };
  });
  const editGroup = (Number(p.required_level) || 0) > 0 ? (L[Number(p.required_level)] || 3) : null;
  return { ...p, definition: { ...def, widgets }, editGroup };
}

// ── Program version tag — a single free-text string the designer sets ─────────
// What the runtime shows next to the app version: a string, or null if unset.
function getProgramVersion() {
  const v = store.settings.get(PROGRAM_VERSION_KEY);
  return (typeof v === 'string' && v.trim()) ? v.trim() : null;
}

// Persist the current live config to the server's runtime.hmiproj mirror.
function writeRuntime(name) {
  const bundle = buildBundle(name);
  writeAtomic(RUNTIME_FILE, JSON.stringify(bundle, null, 2));
  return bundle;
}

// Replace the whole live working set from a bundle. Returns counts + warnings.
function applyBundle(bundle, userId) {
  const result = { pages: 0, assets: 0, alarms: 0, recipes: 0, groups: 0, warnings: [] };
  const oldPageNames = store.pages.all().map((p) => p.name);

  // Groups first (pages reference group ids). A v2 bundle carries them; a v1
  // bundle (no groups) gets the default set seeded, and its pages are remapped
  // from numeric levels to editGroup.
  const legacy = !Array.isArray(bundle.groups);
  if (legacy) {
    store.groups.replaceAll([]);
    groupsService.seedDefaults(store.groups);
    result.warnings.push('Legacy project (no groups): default groups created and numeric levels remapped');
  } else {
    store.groups.replaceAll(bundle.groups.map((g) => ({ ...g, includes: [...(g.includes || [])] })));
  }
  result.groups = store.groups.all().length;

  const pageRows = (bundle.pages || []).filter((p) => p && p.name)
    .map((p) => (legacy ? remapLegacyPage(p) : p))
    .map((p) => ({
      name: p.name, title: p.title || p.name,
      page_type: p.page_type || 'standard', definition: p.definition || { widgets: [] },
      nav_order: p.nav_order || 0,
      required_level: p.required_level || 0, editGroup: p.editGroup ?? null, is_home: p.is_home ? 1 : 0,
      created_by: userId, created_at: store.now(), updated_at: store.now(),
    }));
  store.pages.replaceAll(pageRows);
  result.pages = pageRows.length;

  // Assets are referenced by name (bytes live in data/assets/). A reference-only
  // bundle just verifies the file is present; a legacy bundle that still carries
  // inlined `data` is materialised to disk for backward compatibility.
  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });
  for (const a of (bundle.assets || [])) {
    const safe = path.basename(a?.name || '');
    if (!safe) { result.warnings.push('Skipped asset with empty name'); continue; }
    const dest = path.join(ASSETS_DIR, safe);
    if (a.data != null) {
      fs.writeFileSync(dest, Buffer.from(a.data, 'base64'));   // legacy inlined bundle
      result.assets++;
    } else if (fs.existsSync(dest)) {
      result.assets++;                                          // referenced file already on disk
    } else {
      result.warnings.push(`Missing asset (referenced, not on this server): ${safe}`);
    }
  }

  const alarmRows = (bundle.alarmDefinitions || []).map((r) => ({ ...r }));
  store.alarmDefinitions.replaceAll(alarmRows);
  result.alarms = alarmRows.length;

  // Alarm text lists are optional (older bundles predate composite alarms).
  const alarmListRows = (bundle.alarmLists || []).map((r) => ({ ...r, entries: (r.entries || []).map((e) => ({ ...e })) }));
  store.alarmLists.replaceAll(alarmListRows);

  // Widget library is optional (older bundles predate it).
  const widgetLibraryRows = (bundle.widgetLibrary || []).map((r) => ({ ...r, widgets: (r.widgets || []).map((w) => ({ ...w })) }));
  store.widgetLibrary.replaceAll(widgetLibraryRows);

  const recipeRows = (bundle.recipes || []).map((r) => ({ ...r }));
  store.recipes.replaceAll(recipeRows);
  result.recipes = recipeRows.length;

  store.settings.replaceAll(bundle.settings || {});

  // Machine / PLC config: replace only when the bundle actually carries it, so an
  // older bundle (pre-split, no `machines`) never wipes the live machine. Trimmed
  // to a single entry (single-machine deployment). Takes effect on the next
  // backend restart (conf/driver connections are established at startup).
  if (Array.isArray(bundle.machines) && bundle.machines.length) {
    store.machines.replaceAll(bundle.machines.slice(0, 1).map((m) => ({ ...m })));
    result.machineRestartRequired = true;
  }

  for (const nm of new Set([...oldPageNames, ...pageRows.map((p) => p.name)])) scanner.invalidatePage(nm);
  return result;
}

router.use(authMiddleware);

// ── Info about the current runtime (counts live; savedAt from the mirror) ────
router.get('/info', requireAdmin, (req, res) => {
  try {
    let savedAt = null;
    if (fs.existsSync(RUNTIME_FILE)) savedAt = new Date(fs.statSync(RUNTIME_FILE).mtimeMs).toISOString();
    res.json({ exists: !!savedAt, savedAt, counts: liveCounts(), programVersion: getProgramVersion() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Save — write the live config to the server runtime mirror ────────────────
router.post('/save', requireAdmin, (req, res) => {
  try {
    const bundle = writeRuntime(req.body?.name);
    res.json({ ok: true, savedAt: bundle.exportedAt, counts: bundle.counts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Download — the runtime as a .hmiproj file (client "Save to file") ────────
router.get('/download', requireAdmin, (req, res) => {
  try {
    writeRuntime(req.query?.name);         // refresh the mirror so the download is current
    const fname = `${sanitize(req.query?.name) || 'hmi-runtime'}${EXT}`;
    res.download(RUNTIME_FILE, fname);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Load — REPLACE the runtime from an uploaded .hmiproj (client "Load") ─────
router.post('/load', requireLevel(3), (req, res) => {
  const bundle = req.body?.bundle;
  if (!bundle || bundle.format !== PROJECT_FORMAT) {
    return res.status(400).json({ error: 'Not a valid HMI Studio project (.hmiproj) file' });
  }
  if (bundle.version > PROJECT_VERSION) {
    return res.status(400).json({ error: `Project version ${bundle.version} is newer than supported (${PROJECT_VERSION})` });
  }
  try {
    const result = applyBundle(bundle, req.user.id);
    writeRuntime(bundle.name);             // mirror the new runtime on the server
    res.json({ ok: true, ...result });
  } catch (e) { res.status(500).json({ error: e.message, ...(e.result || {}) }); }
});

// ── New — blank the runtime ──────────────────────────────────────────────────
router.post('/new', requireLevel(3), (req, res) => {
  try {
    const oldPageNames = store.pages.all().map((p) => p.name);
    store.pages.replaceAll([]);
    store.alarmDefinitions.replaceAll([]);
    store.alarmLists.replaceAll([]);
    store.widgetLibrary.replaceAll([]);
    store.recipes.replaceAll([]);
    store.settings.replaceAll({});
    // A blank project keeps a usable default group set so existing (global)
    // users aren't all orphaned the moment the project is cleared.
    store.groups.replaceAll([]);
    groupsService.seedDefaults(store.groups);
    // Machine config is part of the project, so a blank project gets a default
    // mock machine (app still runs with no PLC). Effective on next restart.
    store.machines.replaceAll([{ id: 1, name: 'Machine 1', protocol: 'mock', is_active: true }]);
    for (const nm of oldPageNames) scanner.invalidatePage(nm);
    writeRuntime('hmi-runtime');           // mirror the (now empty) runtime
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Program version — set the free-text version tag shown at runtime ─────────
router.post('/version', requireAdmin, (req, res) => {
  try {
    const value = String(req.body?.version ?? '').trim();
    store.settings.set(PROGRAM_VERSION_KEY, value);  // '' clears the tag
    writeRuntime('hmi-runtime');                      // keep the server mirror in sync
    res.json({ ok: true, programVersion: getProgramVersion() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.PROJECT_VERSION = PROJECT_VERSION;
module.exports.getProgramVersion = getProgramVersion;
