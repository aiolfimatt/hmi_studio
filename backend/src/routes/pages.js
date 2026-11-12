const express = require('express');
const store = require('../store');
const { authMiddleware, optionalAuth, requireAdmin } = require('../auth');
const { canViewPage, pageViewGroups } = require('../services/access');
const scanner = require('../scanner');

const router = express.Router();

// Page ordering: nav_order, then name.
function navCmp(a, b) {
  if ((a.nav_order || 0) !== (b.nav_order || 0)) return (a.nav_order || 0) - (b.nav_order || 0);
  return String(a.name).localeCompare(String(b.name));
}

// ── Public runtime reads (no auth) ────────────────────────────────────────────
// The operator panel renders pages without a session. Widget-level password
// prompts guard writes; a page's `viewGroups` (if any) guards VIEWING it: the
// definition is only served to a caller whose group may see the page. The
// legacy required_level / page editGroup are designer metadata, not enforced.

// Keep viewGroups well-formed: unique numeric ids of existing groups.
function sanitizeViewGroups(raw) {
  const existing = new Set(store.groups.all().map((g) => Number(g.id)));
  const out = [];
  for (const v of Array.isArray(raw) ? raw : []) {
    const id = Number(v);
    if (Number.isFinite(id) && existing.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

// Home page name: explicit is_home flag, else first by nav_order.
router.get('/meta/home', (req, res) => {
  try {
    const ordered = store.pages.all().slice().sort(
      (a, b) => (b.is_home ? 1 : 0) - (a.is_home ? 1 : 0) || navCmp(a, b)
    );
    res.json({ name: ordered.length ? ordered[0].name : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get full page (with definition) — public for runtime rendering unless the page
// is restricted to some groups. A refused caller gets 403 with just enough to
// draw the "restricted" screen (title + required group ids), never the definition.
router.get('/:name', optionalAuth, (req, res) => {
  try {
    const page = store.pages.find((p) => p.name === req.params.name);
    if (!page) return res.status(404).json({ error: 'Page not found' });
    if (!canViewPage(req.user, page)) {
      return res.status(403).json({
        error: 'Page restricted', restricted: true, loggedIn: !!req.user,
        name: page.name, title: page.title, viewGroups: pageViewGroups(page),
      });
    }
    res.json(page);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Authenticated / admin-only routes ─────────────────────────────────────────
router.use(authMiddleware);

// List all pages (summary, no full definition) — editor page-picker + widget target dropdown
router.get('/', (req, res) => {
  try {
    const rows = store.pages.all().slice().sort(navCmp).map((p) => ({
      id: p.id, name: p.name, title: p.title,
      page_type: p.page_type, nav_order: p.nav_order,
      required_level: p.required_level, viewGroups: pageViewGroups(p), is_home: p.is_home, updated_at: p.updated_at,
    }));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ensure only one page keeps is_home = 1.
function clearOtherHome(exceptName) {
  store.pages.update((p) => p.name !== (exceptName || '') && p.is_home, { is_home: 0 });
}

// Create page
router.post('/', requireAdmin, (req, res) => {
  const { name, title, page_type, definition, nav_order, required_level, is_home, viewGroups } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    if (store.pages.find((p) => p.name === name)) {
      return res.status(409).json({ error: 'Page name already exists' });
    }
    if (is_home) clearOtherHome(name);
    const row = store.pages.insert({
      name, title: title || name,
      page_type: page_type || 'standard', definition: definition || { widgets: [] },
      nav_order: nav_order || 0,
      required_level: required_level || 0, viewGroups: sanitizeViewGroups(viewGroups), is_home: is_home ? 1 : 0,
      created_by: req.user.id, created_at: store.now(), updated_at: store.now(),
    });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update page definition
router.put('/:name', requireAdmin, (req, res) => {
  const { title, page_type, definition, nav_order, required_level, is_home, viewGroups } = req.body;
  try {
    if (is_home) clearOtherHome(req.params.name);
    const patch = {
      title, page_type: page_type || 'standard',
      definition: definition || { widgets: [] },
      nav_order: nav_order || 0, required_level: required_level || 0,
      is_home: is_home ? 1 : 0, updated_at: store.now(),
    };
    // Only touch the access list when the caller sends it, so a save that
    // predates the setting can never silently make a restricted page public.
    if (viewGroups !== undefined) patch.viewGroups = sanitizeViewGroups(viewGroups);
    const n = store.pages.update((p) => p.name === req.params.name, patch);
    if (!n) return res.status(404).json({ error: 'Page not found' });
    scanner.invalidatePage(req.params.name);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Rename page
router.patch('/:name/rename', requireAdmin, (req, res) => {
  const { new_name } = req.body;
  if (!new_name) return res.status(400).json({ error: 'new_name required' });
  try {
    if (store.pages.find((p) => p.name === new_name)) {
      return res.status(409).json({ error: 'Name already taken' });
    }
    const n = store.pages.update((p) => p.name === req.params.name, { name: new_name, updated_at: store.now() });
    if (!n) return res.status(404).json({ error: 'Page not found' });
    scanner.invalidatePage(req.params.name);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete page
router.delete('/:name', requireAdmin, (req, res) => {
  try {
    store.pages.remove((p) => p.name === req.params.name);
    scanner.invalidatePage(req.params.name);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
