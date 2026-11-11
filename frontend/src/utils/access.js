/**
 * Per-object edit-group access — mirrors backend services/access.js
 * (checkGroupAccess). A widget's `editGroup` prop may be:
 *   null / undefined / []  → unprotected
 *   number                 → a single required group (legacy shape)
 *   number[]               → any one of these groups grants access (OR semantics)
 */

// Normalise an editGroup prop to a clean list of numeric group ids.
export function editGroupList(editGroup) {
  const list = Array.isArray(editGroup) ? editGroup : [editGroup]
  return list.filter((g) => g != null).map(Number)
}

// True when the object requires at least one group (i.e. is access-protected).
export function isGroupProtected(editGroup) {
  return editGroupList(editGroup).length > 0
}

// True when a caller's group closure satisfies the object's editGroup.
// Unprotected objects are always satisfied; otherwise the caller must hold
// ANY one of the required groups.
export function hasGroupAccess(accessGroups, editGroup) {
  const required = editGroupList(editGroup)
  if (required.length === 0) return true
  const have = Array.isArray(accessGroups) ? accessGroups.map(Number) : []
  return required.some((g) => have.includes(g))
}
