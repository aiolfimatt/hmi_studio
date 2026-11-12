/**
 * Group management (designer / edit-mode only).
 *
 * Groups define the access model: named groups, an inheritance DAG (`includes`)
 * and capabilities (`editMode`, `manageUsers`, `viewAudit`). They are part of the project
 * and travel in the .hmiproj bundle. See services/groups.js for the semantics.
 *
 *   GET    /api/groups        list all groups
 *   POST   /api/groups        create a group (cycle-checked)
 *   PUT    /api/groups/:id     update name/includes/capabilities (cycle-checked)
 *   DELETE /api/groups/:id     delete — blocked while referenced by a user or
 *                              by another group's `includes`.
 */
const express = require('express');
const store = require('../store');
const { authMiddleware, requireCapability, requireAnyCapability } = require('../auth');
const { wouldCycle } = require('../services/groups');

const router = express.Router();

function clean(g) {
  return {
    id: g.id, name: g.name, includes: g.includes || [],
    manageUsers: !!g.manageUsers, editMode: !!g.editMode, viewAudit: !!g.viewAudit, builtin: !!g.builtin,
  };
}

// Public, read-only id→name map so the ANONYMOUS runtime can show which group a
// protected object requires in its credential prompt. Exposes names only — never
// capabilities or hierarchy. Defined before the edit-mode gate below.
router.get('/names', (req, res) => {
  try { res.json(store.groups.all().map((g) => ({ id: g.id, name: g.name }))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Group LIST — the designer (editMode) uses it to manage groups, and a user
// admin (manageUsers) needs it to pick a group when creating/editing a user. So
// allow EITHER capability here; the mutations below stay editMode-only.
router.get('/', authMiddleware, requireAnyCapability('editMode', 'manageUsers'), (req, res) => {
  try { res.json(store.groups.all().map(clean)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Everything below requires the editMode capability (designer/management).
router.use(authMiddleware, requireCapability('editMode'));

// Keep includes well-formed: unique numeric ids that refer to existing groups
// and never the group itself.
function sanitizeIncludes(includes, selfId) {
  const existing = new Set(store.groups.all().map((g) => Number(g.id)));
  const out = [];
  for (const raw of Array.isArray(includes) ? includes : []) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id === Number(selfId)) continue;
    if (!existing.has(id)) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

router.post('/', (req, res) => {
  const { name, includes, manageUsers, editMode, viewAudit } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
  try {
    if (store.groups.find((g) => g.name === name)) {
      return res.status(409).json({ error: 'A group with this name already exists' });
    }
    const inc = sanitizeIncludes(includes);
    // New id is assigned by the store; cycle check uses a provisional row.
    const provisionalId = store.groups.all().reduce((m, g) => Math.max(m, Number(g.id)), 0) + 1;
    const rows = [...store.groups.all(), { id: provisionalId, includes: inc }];
    if (wouldCycle(rows, provisionalId, inc)) {
      return res.status(400).json({ error: 'That hierarchy would create a cycle' });
    }
    const row = store.groups.insert({
      name: String(name).trim(), includes: inc,
      manageUsers: !!manageUsers, editMode: !!editMode, viewAudit: !!viewAudit, builtin: false,
    });
    res.json(clean(row));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, includes, manageUsers, editMode, viewAudit } = req.body || {};
  try {
    const existing = store.groups.find((g) => Number(g.id) === id);
    if (!existing) return res.status(404).json({ error: 'Group not found' });
    if (name && store.groups.find((g) => g.name === name && Number(g.id) !== id)) {
      return res.status(409).json({ error: 'A group with this name already exists' });
    }
    const inc = includes === undefined ? existing.includes : sanitizeIncludes(includes, id);
    if (wouldCycle(store.groups.all(), id, inc)) {
      return res.status(400).json({ error: 'That hierarchy would create a cycle' });
    }
    const patch = { includes: inc };
    if (name !== undefined) patch.name = String(name).trim();
    if (manageUsers !== undefined) patch.manageUsers = !!manageUsers;
    if (editMode !== undefined) patch.editMode = !!editMode;
    if (viewAudit !== undefined) patch.viewAudit = !!viewAudit;
    store.groups.update((g) => Number(g.id) === id, patch);
    res.json(clean(store.groups.find((g) => Number(g.id) === id)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  try {
    const existing = store.groups.find((g) => Number(g.id) === id);
    if (!existing) return res.status(404).json({ error: 'Group not found' });
    const userRef = store.users.find((u) => Number(u.group) === id);
    if (userRef) {
      return res.status(409).json({ error: `Group is assigned to user '${userRef.username}'. Reassign users first.` });
    }
    const groupRef = store.groups.find((g) => (g.includes || []).map(Number).includes(id));
    if (groupRef) {
      return res.status(409).json({ error: `Group is included by '${groupRef.name}'. Remove it from that hierarchy first.` });
    }
    store.groups.remove((g) => Number(g.id) === id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
