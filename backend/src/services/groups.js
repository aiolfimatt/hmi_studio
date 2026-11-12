/**
 * Group / capability model — the authority for access control.
 *
 * Replaces the old flat numeric `password_level`. A user belongs to exactly ONE
 * group. Groups form an inheritance DAG via `includes`: a group transitively
 * inherits both the per-object edit rights AND the capabilities of every group
 * it includes. An "isolated" group simply includes nothing and is included by
 * nothing (e.g. a UserAdmin group that can manage users but not edit anything).
 *
 * Group row shape (data/groups.json, Collection('groups','id')):
 *   { id, name, includes:[groupId...], manageUsers:bool, editMode:bool, viewAudit:bool, builtin?:bool }
 *
 * Capabilities:
 *   editMode    — may enter the designer / management area (old level-3 requireAdmin)
 *   manageUsers — may create/remove users and assign groups (usable at RUNTIME)
 *   viewAudit   — may read the audit trail (runtime audit widget). Implied by
 *                 editMode, so existing designer groups keep access with no migration.
 *
 * Per-object access: a protected object carries an `editGroup` (a group id). A
 * user in group G may write an object tagged T iff T ∈ closure(G).
 *
 * All functions are PURE over a rows array (or an index built from one), so they
 * are trivially testable and reusable by auth / plc / batchRuntime / project.
 * `resolveUser` is the one exception — it lazily reads the live store.
 */

// Seeded defaults for a fresh install / blank project.
const SEED_GROUPS = [
  { id: 1, name: 'Operator',    includes: [],  manageUsers: false, editMode: false, viewAudit: false, builtin: true },
  { id: 2, name: 'Maintenance', includes: [1], manageUsers: false, editMode: false, viewAudit: false, builtin: true },
  { id: 3, name: 'Installer',   includes: [2], manageUsers: true,  editMode: true,  viewAudit: true,  builtin: true },
  { id: 4, name: 'UserAdmin',   includes: [],  manageUsers: true,  editMode: false, viewAudit: true,  builtin: true }, // isolated
];

// Legacy numeric level → group id. Used by the one-time migration (Phase 0) and
// by backward-compat loading of v1 .hmiproj bundles / un-migrated widgets.
// Note: for WIDGETS a level of 0 means "unprotected" (no editGroup), handled by
// the caller; this table is the fallback for non-zero levels and for USER levels
// (where 0 → Operator).
const LEGACY_LEVEL_TO_GROUP = { 0: 1, 1: 1, 2: 2, 3: 3, 4: 3 };

const NO_CAPS = { editMode: false, manageUsers: false, viewAudit: false };

/** Build a Map<id, group> from a rows array. */
function indexGroups(rows) {
  const m = new Map();
  for (const g of rows || []) m.set(Number(g.id), g);
  return m;
}

/**
 * closure(G) = {G} ∪ transitive includes. Returns an array of group ids.
 * An unknown id (orphan) yields []. DFS with a visited-set so malformed data
 * containing a cycle can never loop.
 */
function closureOf(groupId, index) {
  const startId = Number(groupId);
  if (!index.has(startId)) return [];
  const out = [];
  const visited = new Set();
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop();
    if (visited.has(id)) continue;
    visited.add(id);
    const g = index.get(id);
    if (!g) continue;
    out.push(id);
    for (const inc of g.includes || []) stack.push(Number(inc));
  }
  return out;
}

/** Aggregate {editMode, manageUsers, viewAudit} over closure(groupId). Orphan → all false. */
function capabilitiesOf(groupId, index) {
  const caps = { ...NO_CAPS };
  for (const id of closureOf(groupId, index)) {
    const g = index.get(id);
    if (!g) continue;
    if (g.editMode) caps.editMode = true;
    if (g.manageUsers) caps.manageUsers = true;
    if (g.viewAudit || g.editMode) caps.viewAudit = true;
  }
  return caps;
}

/**
 * Would setting group `groupId`'s includes to `nextIncludes` create a cycle?
 * A group cannot include itself, and none of its (transitive) includes may lead
 * back to it. Preventive guard called by the API before persisting an edit.
 */
function wouldCycle(rows, groupId, nextIncludes) {
  const gid = Number(groupId);
  const inc = (nextIncludes || []).map(Number);
  if (inc.includes(gid)) return true;
  const index = indexGroups(rows);
  index.set(gid, { ...(index.get(gid) || { id: gid }), includes: inc });
  const visited = new Set();
  const stack = [...inc];
  while (stack.length) {
    const id = stack.pop();
    if (id === gid) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    const g = index.get(id);
    if (!g) continue;
    for (const n of g.includes || []) stack.push(Number(n));
  }
  return false;
}

/**
 * Resolve a user's group into the JWT snapshot fields, reading the LIVE store.
 * Orphan (group missing from the current project) → no access, no capabilities.
 * Lazily requires the store to avoid a circular module dependency at load time.
 */
function resolveUser(groupId) {
  const store = require('../store');
  const index = indexGroups(store.groups.all());
  const gid = groupId == null ? null : Number(groupId);
  return {
    group: gid,
    accessGroups: gid == null ? [] : closureOf(gid, index),
    capabilities: gid == null ? { ...NO_CAPS } : capabilitiesOf(gid, index),
  };
}

/** Seed the default groups into a collection when it is empty. */
function seedDefaults(collection) {
  if (collection.all().length === 0) {
    for (const g of SEED_GROUPS) collection.insert({ ...g, includes: [...g.includes] });
  }
}

module.exports = {
  SEED_GROUPS,
  LEGACY_LEVEL_TO_GROUP,
  NO_CAPS,
  indexGroups,
  closureOf,
  capabilitiesOf,
  wouldCycle,
  resolveUser,
  seedDefaults,
};
