const express = require('express');
const store = require('../store');
const { authMiddleware, requireAdmin } = require('../auth');
const scanner = require('../scanner');

const router = express.Router();

// Page ordering: nav_order, then name.
function navCmp(a, b) {
  if ((a.nav_order || 0) !== (b.nav_order || 0)) return (a.nav_order || 0) - (b.nav_order || 0);
  return String(a.name).localeCompare(String(b.name));
}

// ── Public runtime reads (no auth) ────────────────────────────────────────────
// The operator panel renders pages without a session. Widget-level password
// prompts are the runtime security boundary, so page-level required_level is
// not enforced here.

// Home page name: explicit is_home flag, else first by nav_order.
router.get('/meta/home', (req, res) => {
  try {
    const ordered = store.pages.all().slice().sort(
      (a, b) => (b.is_home ? 1 : 0) - (a.is_home ? 1 : 0) || navCmp(a, b)
    );
    res.json({ name: ordered.length ? ordered[0].name : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get full page (with definition) — public for runtime rendering.
router.get('/:name', (req, res) => {
  try {
    const page = store.pages.find((p) => p.name === req.params.name);
    if (!page) return res.status(404).json({ error: 'Page not found' });
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
      required_level: p.required_level, is_home: p.is_home, updated_at: p.updated_at,
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
  const { name, title, page_type, definition, nav_order, required_level, is_home } = req.body;
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
      required_level: required_level || 0, is_home: is_home ? 1 : 0,
      created_by: req.user.id, created_at: store.now(), updated_at: store.now(),
    });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update page definition
router.put('/:name', requireAdmin, (req, res) => {
  const { title, page_type, definition, nav_order, required_level, is_home } = req.body;
  try {
    if (is_home) clearOtherHome(req.params.name);
    const n = store.pages.update((p) => p.name === req.params.name, {
      title, page_type: page_type || 'standard',
      definition: definition || { widgets: [] },
      nav_order: nav_order || 0, required_level: required_level || 0,
      is_home: is_home ? 1 : 0, updated_at: store.now(),
    });
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
