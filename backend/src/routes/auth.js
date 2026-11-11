const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const store = require('../store');
const conf = require('../../../config/conf.json');
const { authMiddleware } = require('../auth');
const { jwtSecret } = require('../services/secret');
const { resolveUser } = require('../services/groups');
const ldapGateway = require('../services/ldapGateway');
const eventLog = require('../services/eventLog');
const { HMI_EVENT } = require('../services/constants');
const { expiresAt, isExpired, minChars, maxFailedAttempts } = require('../services/passwordPolicy');
const { loginRateLimiter } = require('../services/rateLimit');

const router = express.Router();

const MAX_ATTEMPTS = maxFailedAttempts();
const MIN_CHARS = minChars();

function tokenExpiry() {
  // Absolute session ceiling. The idle auto-logout (security.auto_logout_s) is
  // enforced on the client as an *inactivity* timer that resets on user activity,
  // so the JWT must outlive it — otherwise an active operator would be kicked at
  // the idle interval. Keep the token alive for jwt_expiry (default 8h) and let
  // the client handle idling.
  return conf.jwt_expiry || '8h';
}

// LDAP fallback. Reached only for a username with NO local account (internal
// users are always checked first, and a known local username is authenticated
// locally regardless of the gateway). On success we issue an EPHEMERAL session:
// there is no local user row, so id is null and `source: 'ldap'`; the group — and
// thus the capabilities — come from the first int of the gateway's Levels array
// mapped positionally onto the hmi_studio groups (see services/ldapGateway).
async function loginViaGateway(username, password, res) {
  const result = await ldapGateway.authenticate(username, password);
  if (!result.success) return res.status(401).json({ error: 'Invalid credentials' });

  const groupId = ldapGateway.groupForLevels(result.levels);
  if (groupId == null) {
    return res.status(403).json({
      error: 'LDAP login succeeded but your access level maps to no HMI group',
      code: 'NO_GROUP',
    });
  }

  const { group, accessGroups, capabilities } = resolveUser(groupId);
  eventLog.append({
    action: 'login', event_type: HMI_EVENT.LOGIN,
    username, description: 'LOGIN (LDAP)',
  });
  const claims = {
    id: null, username, full_name: username,
    group, capabilities, accessGroups, source: 'ldap',
  };
  const token = jwt.sign(claims, jwtSecret(), { expiresIn: tokenExpiry() });
  return res.json({
    token,
    mustChangePassword: false,
    user: { id: null, username, full_name: username, group, capabilities, accessGroups, source: 'ldap' },
  });
}

router.post('/login', loginRateLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  try {
    const user = store.users.find((u) => u.username === username);
    // Unknown local username → delegate to the LDAP gateway when enabled,
    // otherwise reject. A KNOWN username always authenticates locally below.
    if (!user) {
      if (ldapGateway.isEnabled()) return await loginViaGateway(username, password, res);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user.is_active) return res.status(401).json({ error: 'Invalid credentials' });

    // Lockout — replicates legacy block after exceeding attempts (Utility.cs:1506-1553).
    if (user.locked) {
      return res.status(403).json({
        error: 'Account locked: exceeded password attempts. Unlock with an Installer group account.',
        code: 'LOCKED',
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      const attempts = (user.failed_attempts || 0) + 1;
      const locked = attempts >= MAX_ATTEMPTS ? 1 : 0;
      store.users.update((u) => u.id === user.id, { failed_attempts: attempts, locked });
      if (locked) {
        eventLog.append({
          action: 'login_locked', event_type: HMI_EVENT.LOGIN_LOCKED,
          username, description: 'Exceeded the number entering password attempts',
        });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Password expiry — never-expires accounts are exempt.
    const mustChangePassword = isExpired(user);

    // Success: reset attempts, stamp last login.
    store.users.update((u) => u.id === user.id, { failed_attempts: 0, last_login_at: store.now() });

    // "hmi studio - login event" — a credential was successfully validated
    // (both the /edit admin session and a runtime operator credential log in
    // through here).
    eventLog.append({
      action: 'login', event_type: HMI_EVENT.LOGIN,
      user_id: user.id, username: user.username, description: 'LOGIN',
    });

    // Snapshot the group's closure + capabilities into the token so runtime
    // gating needs no DB round-trip. A later project reload that changes groups
    // won't retroactively alter an issued token; the next login re-snapshots.
    const { accessGroups, capabilities } = resolveUser(user.group);
    const claims = {
      id: user.id, username: user.username, full_name: user.full_name,
      group: user.group ?? null, capabilities, accessGroups,
    };
    const token = jwt.sign(claims, jwtSecret(), { expiresIn: tokenExpiry() });
    res.json({
      token,
      mustChangePassword,
      user: {
        id: user.id, username: user.username, full_name: user.full_name,
        group: user.group ?? null, capabilities, accessGroups,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/change-password', loginRateLimiter, authMiddleware, async (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) return res.status(400).json({ error: 'Missing fields' });
  if (new_password.length < MIN_CHARS) {
    return res.status(400).json({ error: `Password must be at least ${MIN_CHARS} characters` });
  }
  try {
    const user = store.users.find((u) => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(old_password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Wrong current password' });
    if (await bcrypt.compare(new_password, user.password_hash)) {
      return res.status(400).json({ error: 'New password must differ from the current one' });
    }
    const hash = await bcrypt.hash(new_password, 10);
    store.users.update((u) => u.id === user.id, {
      password_hash: hash, password_expires_at: expiresAt(), updated_at: store.now(),
    });
    eventLog.append({
      action: 'password_change', event_type: HMI_EVENT.PASSWORD_CHANGED,
      user_id: req.user.id, username: req.user.username, description: 'CHANGE PASSWORD',
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// "hmi studio - logout event". Logout is client-side (the token/credential is
// discarded in the browser), so the client calls this best-effort before
// clearing it. authMiddleware identifies who is leaving; a stale/expired token
// simply 401s and no event is logged.
router.post('/logout', authMiddleware, (req, res) => {
  eventLog.append({
    action: 'logout', event_type: HMI_EVENT.LOGOUT,
    user_id: req.user.id, username: req.user.username, description: 'LOGOUT',
  });
  res.json({ ok: true });
});

router.get('/me', authMiddleware, (req, res) => res.json(req.user));

module.exports = router;
