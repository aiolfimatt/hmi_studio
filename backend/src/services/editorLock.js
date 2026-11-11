// ── Single-client editor lock ──────────────────────────────────────────────
// The designer / admin area ("the editor") must be used by only ONE client at a
// time — its saves are last-write-wins, so two concurrent admins would clobber
// each other. We enforce this over Socket.IO rather than REST because a socket
// gives us free liveness detection: when the holding client closes its browser,
// navigates away, or crashes, the socket 'disconnect' fires and the lock is
// released automatically — no heartbeats, no stale-lock timeouts to tune.
//
// The lock is a single global mutex (there is one editor). The first authorised
// admin socket to call 'editor:acquire' wins and holds it until it releases or
// disconnects; every other client is told who holds it and waits. There is no
// takeover: a crashed holder frees the lock via its socket timeout.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('./secret');
const { resolveUser } = require('./groups');

let io = null;
// null when free, else { socketId, userId, username, token, acquiredAt }
let lock = null;

// Resolve the editor-capable user behind a socket from its handshake token.
// Returns null for anonymous/runtime sockets (which never touch the lock) and,
// as defence-in-depth, for a token whose group no longer grants editMode.
function authUser(socket) {
  const token = socket.handshake?.auth?.token;
  if (!token) return null;
  try {
    const u = jwt.verify(token, jwtSecret());
    const live = resolveUser(u.group);
    if (!(u.capabilities?.editMode && live.capabilities?.editMode)) return null;
    return u;
  } catch {
    return null;
  }
}

// What every client is allowed to know about the current lock.
function publicState() {
  return lock
    ? { locked: true, username: lock.username, userId: lock.userId, acquiredAt: lock.acquiredAt }
    : { locked: false };
}

function broadcastState() {
  if (io) io.emit('editor:lock_state', publicState());
}

function release(socketId) {
  if (lock && lock.socketId === socketId) {
    lock = null;
    broadcastState();
  }
}

function init(socketIo) {
  io = socketIo;

  io.on('connection', (socket) => {
    // Request the lock. ack: { ok:true } | { ok:false, locked:true, holder } |
    // { ok:false, error:'unauthorized' }.
    socket.on('editor:acquire', (ack) => {
      const user = authUser(socket);
      if (!user) {
        if (typeof ack === 'function') ack({ ok: false, error: 'unauthorized' });
        return;
      }
      // Held by a different client → deny and report the holder.
      if (lock && lock.socketId !== socket.id) {
        if (typeof ack === 'function') ack({ ok: false, locked: true, holder: publicState() });
        return;
      }
      // Grant: either the lock was free or this same socket is re-acquiring
      // (e.g. after a React effect re-run). Re-acquire keeps the existing grant.
      if (!lock) {
        lock = {
          socketId: socket.id,
          userId: user.id,
          username: user.username,
          token: crypto.randomUUID(),
          acquiredAt: new Date().toISOString(),
        };
      }
      if (typeof ack === 'function') ack({ ok: true, lockToken: lock.token });
      broadcastState();
    });

    socket.on('editor:release', () => release(socket.id));
    socket.on('disconnect', () => release(socket.id));
  });
}

// True when `token` matches the live lock — for optional REST defence-in-depth.
function isHeldByToken(token) {
  return !!(lock && token && lock.token === token);
}

module.exports = { init, publicState, isHeldByToken };
