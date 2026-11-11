/**
 * library — reusable widget library. An admin saves a configured widget (e.g. a
 * "back" button) or a multi-widget selection (e.g. a header bar) as a named item;
 * placing an item onto a page inserts an independent COPY (detached — later edits
 * to the library item do not touch widgets already placed). See store.widgetLibrary.
 *
 * Stored widget positions are normalised to the group's bounding-box origin (0,0)
 * so the editor can drop the whole group at the cursor; the editor assigns fresh
 * widget ids on insert. `kind` is derived from the widget count (single | group).
 *
 * All routes are edit-mode only (admin). Writes require level ≥ 2 (same bar as a
 * page edit); deleting requires level ≥ 3 — matching recipes/alarms.
 */
const express = require('express');
const store = require('../store');
const { authMiddleware, requireLevel, requireAdmin } = require('../auth');

const router = express.Router();
router.use(authMiddleware, requireAdmin);

// Uniqueness: library item name.
function duplicate(name, exceptId) {
  return store.widgetLibrary.find((r) => r.name === name && r.id !== exceptId);
}

// Keep only the fields that define a widget, and strip volatile editor state.
// Positions are normalised so the group's top-left sits at (0,0); on insert the
// editor adds the drop coordinates back. Returns { widgets, kind } or throws.
function normalizeWidgets(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('widgets must be a non-empty array');
  }
  const raw = input.map((w) => {
    if (!w || typeof w !== 'object' || !w.type) throw new Error('each widget needs a type');
    return {
      type: String(w.type),
      x: Number(w.x) || 0,
      y: Number(w.y) || 0,
      width: Number(w.width) || 100,
      height: Number(w.height) || 40,
      zIndex: Number(w.zIndex) || 1,
      props: (w.props && typeof w.props === 'object') ? w.props : {},
    };
  });
  // Normalise positions to the bounding-box origin so the saved layout is
  // position-independent (the editor re-anchors it at the drop point).
  const minX = Math.min(...raw.map((w) => w.x));
  const minY = Math.min(...raw.map((w) => w.y));
  const widgets = raw.map((w) => ({ ...w, x: w.x - minX, y: w.y - minY }));
  return { widgets, kind: widgets.length > 1 ? 'group' : 'single' };
}

// GET /api/library — full items (payload is small; the editor needs the widgets
// to insert, so there is no separate detail endpoint).
router.get('/', (req, res) => {
  try {
    const rows = store.widgetLibrary.all().slice()
      .sort((a, b) =>
        String(a.category || '').localeCompare(String(b.category || '')) ||
        String(a.name).localeCompare(String(b.name)));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/library — save a new item from the current selection.
router.post('/', requireLevel(2), (req, res) => {
  const { name, category, widgets } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
  try {
    if (duplicate(String(name).trim())) {
      return res.status(409).json({ error: 'A library item with that name already exists' });
    }
    const { widgets: norm, kind } = normalizeWidgets(widgets);
    const row = store.widgetLibrary.insert({
      name: String(name).trim(),
      category: (category && String(category).trim()) || 'General',
      kind,
      widgets: norm,
      created_by: req.user.id,
      created_at: store.now(),
      updated_at: store.now(),
    });
    res.json(row);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// PUT /api/library/:id — rename / recategorise (and optionally overwrite widgets).
router.put('/:id', requireLevel(2), (req, res) => {
  const { name, category, widgets } = req.body;
  try {
    const existing = store.widgetLibrary.find((r) => String(r.id) === String(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Library item not found' });
    const patch = { updated_at: store.now() };
    if (name != null) {
      const trimmed = String(name).trim();
      if (!trimmed) return res.status(400).json({ error: 'name cannot be empty' });
      if (duplicate(trimmed, existing.id)) {
        return res.status(409).json({ error: 'A library item with that name already exists' });
      }
      patch.name = trimmed;
    }
    if (category != null) patch.category = String(category).trim() || 'General';
    if (widgets != null) {
      const { widgets: norm, kind } = normalizeWidgets(widgets);
      patch.widgets = norm;
      patch.kind = kind;
    }
    store.widgetLibrary.update((r) => r.id === existing.id, patch);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/library/:id
router.delete('/:id', requireLevel(3), (req, res) => {
  try {
    store.widgetLibrary.remove((r) => String(r.id) === String(req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
