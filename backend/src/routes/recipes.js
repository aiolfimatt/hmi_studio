const express = require('express');
const store = require('../store');
const { authMiddleware, requireLevel, requireAdmin } = require('../auth');

const router = express.Router();
// Recipe management is edit-mode only → admins only.
router.use(authMiddleware, requireAdmin);

// Uniqueness: recipe name.
function duplicate(name, exceptId) {
  return store.recipes.find((r) => r.name === name && r.id !== exceptId);
}

// GET /api/recipes
router.get('/', (req, res) => {
  try {
    const rows = store.recipes.all().slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map((r) => ({ id: r.id, name: r.name, created_by: r.created_by, created_at: r.created_at, updated_at: r.updated_at }));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/recipes/:id
router.get('/:id', (req, res) => {
  try {
    const row = store.recipes.find((r) => String(r.id) === String(req.params.id));
    if (!row) return res.status(404).json({ error: 'Recipe not found' });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/recipes
router.post('/', requireLevel(2), (req, res) => {
  const { name, parameters } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    if (duplicate(name)) {
      return res.status(409).json({ error: 'Recipe name already exists' });
    }
    const row = store.recipes.insert({
      name, parameters: parameters || {},
      created_by: req.user.id, created_at: store.now(), updated_at: store.now(),
    });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/recipes/:id
router.put('/:id', requireLevel(2), (req, res) => {
  const { name, parameters } = req.body;
  try {
    const existing = store.recipes.find((r) => String(r.id) === String(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Recipe not found' });
    if (name && duplicate(name, existing.id)) {
      return res.status(409).json({ error: 'Recipe name already exists' });
    }
    store.recipes.update((r) => r.id === existing.id, {
      name, parameters: parameters || {}, updated_at: store.now(),
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/recipes/:id
router.delete('/:id', requireLevel(3), (req, res) => {
  try {
    store.recipes.remove((r) => String(r.id) === String(req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
