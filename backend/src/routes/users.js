const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../store');
const { authMiddleware, requireCapability } = require('../auth');
const { resolveUser } = require('../services/groups');
const eventLog = require('../services/eventLog');
const { HMI_EVENT } = require('../services/constants');
const { expiresAt, minChars } = require('../services/passwordPolicy');

const router = express.Router();
// User management requires the manageUsers capability. This is DECOUPLED from
// editMode so a dedicated (isolated) user-admin group can create/remove users
// and assign groups from the RUNTIME HMI without entering the designer.
router.use(authMiddleware, requireCapability('manageUsers'));

const MIN_CHARS = minChars();

// A user is an "admin" when their group confers the editMode capability (the
// designer / management role, closure-aware). Such accounts may only be touched
// by another editMode admin — see guardAdminTarget.
const groupIsAdmin = (groupId) => !!resolveUser(groupId).capabilities.editMode;

const PUBLIC_FIELDS = (u) => ({
  id: u.id, username: u.username, full_name: u.full_name,
  email: u.email, group: u.group ?? null, is_active: u.is_active,
  failed_attempts: u.failed_attempts, locked: u.locked,
  password_expires_at: u.password_expires_at,
  password_never_expires: !!u.password_never_expires,
  last_login_at: u.last_login_at, created_at: u.created_at,
  is_admin: groupIsAdmin(u.group),
});

// Protect administrator accounts from non-administrator user-managers. A caller
// WITHOUT editMode (e.g. a UserAdmin operator) may not modify an existing admin
// account, nor create/assign an account INTO an admin group (privilege
// escalation). Returns true (and sends 403) when the action must be blocked.
function guardAdminTarget(req, res, target, nextGroupId) {
  const actorIsAdmin = !!resolveUser(req.user.group).capabilities.editMode;
  if (actorIsAdmin) return false; // full admins may manage anyone
  if (target && groupIsAdmin(target.group)) {
    res.status(403).json({ error: 'Only an administrator can modify an administrator account' });
    return true;
  }
  if (nextGroupId != null && groupIsAdmin(nextGroupId)) {
    res.status(403).json({ error: 'Only an administrator can grant the administrator role' });
    return true;
  }
  return false;
}

// Annotate a user as orphaned when its group is absent from the current project.
function withOrphan(u) {
  const known = u.group == null ? false : store.groups.find((g) => Number(g.id) === Number(u.group)) != null;
  return { ...PUBLIC_FIELDS(u), orphaned: u.group != null && !known };
}

router.get('/', (req, res) => {
  try {
    const rows = store.users.all().slice().sort((a, b) => a.id - b.id).map(withOrphan);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  const { username, password, full_name, email, group, password_never_expires, password_expires_at } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  if (password.length < MIN_CHARS) {
    return res.status(400).json({ error: `Password must be at least ${MIN_CHARS} characters` });
  }
  if (guardAdminTarget(req, res, null, group ?? 1)) return;
  try {
    if (store.users.find((u) => u.username === username)) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    const neverExpires = !!password_never_expires;
    const hash = await bcrypt.hash(password, 10);
    const row = store.users.insert({
      username, password_hash: hash, role: 'operator',
      full_name: full_name || '', email: email || '',
      group: group ?? 1, is_active: true,
      failed_attempts: 0, locked: 0,
      password_never_expires: neverExpires,
      password_expires_at: neverExpires ? null : (password_expires_at ?? expiresAt()),
      last_login_at: null, created_at: store.now(), updated_at: store.now(),
    });
    eventLog.append({
      action: 'user_create', event_type: HMI_EVENT.USER_CREATED,
      user_id: req.user.id, username: req.user.username,
      new_value: username, description: `NEW USER ${username}`,
    });
    res.json(PUBLIC_FIELDS(row));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  const { full_name, email, group, is_active, password, password_never_expires, password_expires_at } = req.body;
  try {
    const existing = store.users.find((u) => String(u.id) === String(req.params.id));
    if (!existing) return res.status(404).json({ error: 'User not found' });
    // Block a non-admin from touching an admin account or raising anyone into one.
    if (guardAdminTarget(req, res, existing, group)) return;
    const patch = { updated_at: store.now() };
    if (full_name !== undefined) patch.full_name = full_name;
    if (email !== undefined) patch.email = email;
    if (group !== undefined) patch.group = group;
    if (is_active !== undefined) patch.is_active = is_active;
    if (password_never_expires !== undefined) patch.password_never_expires = !!password_never_expires;
    const willNeverExpire = patch.password_never_expires ?? !!existing.password_never_expires;

    if (password) {
      if (password.length < MIN_CHARS) {
        return res.status(400).json({ error: `Password must be at least ${MIN_CHARS} characters` });
      }
      patch.password_hash = await bcrypt.hash(password, 10);
      patch.failed_attempts = 0;
      patch.locked = 0;
    }

    // Resolve the password-expiry date. A standard-expiration user (never-expires
    // OFF, no custom date) must KEEP a concrete expiry date so the UI can show
    // it — a blank date means "use the configured lifetime", NOT "clear the
    // expiry". So: null it only for never-expires; honour an explicit custom
    // date when given; otherwise (re)compute the standard date when the password
    // is set, expiry is re-enabled, or none is stored yet — and leave an existing
    // standard date untouched on plain profile edits.
    const reEnabled = password_never_expires === false && existing.password_never_expires;
    if (willNeverExpire) {
      patch.password_expires_at = null;
    } else if (password_expires_at) {
      patch.password_expires_at = password_expires_at;   // explicit custom override
    } else if (password || reEnabled || !existing.password_expires_at) {
      patch.password_expires_at = expiresAt();            // standard configured lifetime
    }

    // Work out what actually changed BEFORE applying the patch, so each change
    // is logged as its own typed "hmi studio - user …" event.
    const activeChanged = is_active !== undefined && !!is_active !== !!existing.is_active;
    const expiryChanged = patch.password_expires_at !== undefined
      && (patch.password_expires_at ?? null) !== (existing.password_expires_at ?? null);
    const profileChanged =
      (full_name !== undefined && full_name !== existing.full_name) ||
      (email !== undefined && email !== existing.email) ||
      (group !== undefined && group !== existing.group) ||
      (password_never_expires !== undefined && !!password_never_expires !== !!existing.password_never_expires) ||
      expiryChanged;

    store.users.update((u) => u.id === existing.id, patch);

    const logUser = (event_type, description) => eventLog.append({
      action: 'user_update', event_type,
      user_id: req.user.id, username: req.user.username,
      new_value: existing.username, description,
    });
    if (password) logUser(HMI_EVENT.PASSWORD_CHANGED, `CHANGE PASSWORD ${existing.username}`);
    if (activeChanged) {
      logUser(is_active ? HMI_EVENT.USER_ENABLED : HMI_EVENT.USER_DISABLED,
        `${is_active ? 'ENABLE' : 'DISABLE'} USER ${existing.username}`);
    }
    if (profileChanged) logUser(HMI_EVENT.USER_MODIFIED, `MODIFY USER ${existing.username}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Unlock an account locked by failed attempts.
router.post('/:id/unlock', (req, res) => {
  try {
    const target = store.users.find((u) => String(u.id) === String(req.params.id));
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (guardAdminTarget(req, res, target)) return;
    store.users.update((u) => u.id === target.id, { locked: 0, failed_attempts: 0 });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  if (parseInt(req.params.id, 10) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  try {
    const u = store.users.find((x) => String(x.id) === String(req.params.id));
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (guardAdminTarget(req, res, u)) return;
    store.users.remove((x) => String(x.id) === String(req.params.id));
    eventLog.append({
      action: 'user_delete', event_type: HMI_EVENT.USER_DELETED,
      user_id: req.user.id, username: req.user.username,
      old_value: u?.username || '', description: `DELETE USER ${u?.username || ''}`,
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
