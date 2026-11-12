const jwt = require('jsonwebtoken');
const { jwtSecret } = require('./services/secret');
const { resolveUser } = require('./services/groups');

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token' });
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, jwtSecret());
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Parse a Bearer token when present but never reject: unauthenticated callers
// continue with req.user = null. Used by public runtime routes (page reads,
// unprotected PLC writes) that must work with no session.
function optionalAuth(req, res, next) {
  const header = req.headers['authorization'];
  req.user = null;
  if (header) {
    try {
      req.user = jwt.verify(header.replace('Bearer ', ''), jwtSecret());
    } catch { /* ignore invalid token — treated as anonymous */ }
  }
  next();
}

// Decode a raw token (no "Bearer " prefix) outside Express, e.g. on a socket
// event. Invalid/missing → null (anonymous).
function userFromToken(token) {
  if (!token || typeof token !== 'string') return null;
  try { return jwt.verify(token.replace(/^Bearer /, ''), jwtSecret()); } catch { return null; }
}

// ── Capability gating ─────────────────────────────────────────────────────────
// Access control is now driven by the caller's GROUP capabilities, snapshotted
// into the JWT at login (`req.user.capabilities`). We additionally RE-RESOLVE the
// capability against the live groups store as defence-in-depth: a mid-session
// project reload that changed the group definitions must not let a stale token
// keep a capability its group no longer grants.
//   editMode    — may enter the designer / management area (old level-3 admin)
//   manageUsers — may create/remove users and assign groups (usable at runtime)
function requireCapability(cap) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    const tokenCap = !!(req.user.capabilities && req.user.capabilities[cap]);
    const live = resolveUser(req.user.group);
    if (!(tokenCap && live.capabilities[cap])) {
      return res.status(403).json({ error: `Capability '${cap}' required` });
    }
    next();
  };
}

// Pass when the caller holds ANY of the given capabilities (same token + live
// re-resolution as requireCapability). Used by endpoints that serve more than
// one role — e.g. listing groups is needed by the designer (editMode) AND by a
// user admin (manageUsers) assigning a group to a user.
function requireAnyCapability(...caps) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    const live = resolveUser(req.user.group);
    const ok = caps.some((cap) =>
      !!(req.user.capabilities && req.user.capabilities[cap]) && live.capabilities[cap]);
    if (!ok) return res.status(403).json({ error: `One of [${caps.join(', ')}] capability required` });
    next();
  };
}

// ── Backward-compatibility shim ───────────────────────────────────────────────
// The ~12 management routers still call requireAdmin / requireLevel(n) from the
// old numeric model. We keep the names but remap their meaning onto capabilities
// so those routers compile and behave unchanged without edits:
//   requireAdmin        → editMode capability (was level 3)
//   requireLevel(>=3)   → editMode capability
//   requireLevel(1|2)   → authenticated-only pass-through. Those finer checks were
//                         sub-gradations INSIDE edit-mode (every such router does
//                         `router.use(authMiddleware, requireAdmin)` first), which
//                         no longer exist in a capability world.
// Follow-up cleanup (non-blocking): inline explicit requireCapability() at call
// sites and delete this shim.
const EDIT_LEVEL = 3;

function requireAdmin(req, res, next) {
  return requireCapability('editMode')(req, res, next);
}

function requireLevel(minLevel) {
  if (minLevel >= EDIT_LEVEL) return requireCapability('editMode');
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    next();
  };
}

module.exports = { authMiddleware, optionalAuth, userFromToken,requireLevel, requireAdmin, requireCapability, requireAnyCapability };
