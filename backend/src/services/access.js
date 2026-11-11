/**
 * Per-widget access control — faithful to monitor/Utility.cs `verifica_password`
 * (Utility.cs:1102-1185).
 *
 * A widget carries up to 5 protection levels (`pass_word[5]`, legacy
 * <gmr:liv_password>). The logged-in user carries up to 5 granted levels
 * (`liv_password[5]`). Semantics of a protection value:
 *   0       → terminator / no protection
 *   1       → requires OPERATORE (level 1 exact)
 *   2..8    → requires that exact level
 *   9..12   → threshold: granted if userLevel <= protectionValue
 * INSTALLATORE (2) is always authorized.
 */

const { USER_LEVEL } = require('./constants');

/**
 * @param {number[]} userLevels  the granted levels of the logged user
 * @param {number[]} widgetLevels the widget pass_word[] array
 * @returns {boolean} true if access is granted
 */
function checkWidgetAccess(userLevels, widgetLevels) {
  const prot = (widgetLevels || []).map(Number).filter((n) => !Number.isNaN(n));
  if (!prot.length || prot[0] === 0) return true; // unprotected

  const levels = (userLevels || []).map(Number).filter((n) => !Number.isNaN(n));

  for (const li of levels) {
    if (li === 0) break;                       // end of user levels
    if (li === USER_LEVEL.INSTALLATORE) return true; // installer: full access

    for (const ph of prot) {
      if (ph === 0) break;                     // end of protection levels
      if ((ph > 2 && ph < 9) || ph === 1) {
        if (li === ph) return true;            // exact match
      }
      if (ph > 8 && ph < 13) {
        if (li <= ph) return true;             // threshold match
      }
    }
  }
  return false;
}

/** Build a user levels array from a stored password_level (single value). */
function levelsFromUser(user) {
  if (Array.isArray(user?.levels) && user.levels.length) return user.levels;
  const lvl = Number(user?.password_level ?? 0);
  return [lvl];
}

// ── Group-based per-object access (current model) ─────────────────────────────
const { resolveUser } = require('./groups');

/**
 * A protected object carries an `editGroup`: a single group id (legacy) OR an
 * array of group ids. The caller is allowed iff they hold ANY one of those
 * groups (OR semantics) — a widget tagged with several groups is editable by
 * members of any of them. A null/undefined/empty editGroup means unprotected.
 * @param {number[]} accessGroups the caller's group closure
 * @param {number|number[]|null|undefined} editGroup the object's required group(s)
 */
function checkGroupAccess(accessGroups, editGroup) {
  const required = (Array.isArray(editGroup) ? editGroup : [editGroup])
    .filter((g) => g != null)
    .map(Number);
  if (required.length === 0) return true; // unprotected
  if (!Array.isArray(accessGroups)) return false;
  const have = accessGroups.map(Number);
  return required.some((g) => have.includes(g));
}

/**
 * The caller's group closure. Prefer the JWT snapshot (`accessGroups`); fall back
 * to resolving the live store from the token's `group`. Anonymous → [].
 */
function accessGroupsFromUser(user) {
  if (Array.isArray(user?.accessGroups)) return user.accessGroups;
  if (user?.group != null) return resolveUser(user.group).accessGroups;
  return [];
}

module.exports = {
  checkWidgetAccess, levelsFromUser, USER_LEVEL,
  checkGroupAccess, accessGroupsFromUser,
};
