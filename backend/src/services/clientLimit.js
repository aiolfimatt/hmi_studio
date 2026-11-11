// ── Runtime client connection limit ─────────────────────────────────────────
// Caps how many runtime operator screens (MonitorPage) may be connected at the
// same time. The designer/admin editor is limited separately (see editorLock)
// and is NOT counted here.
//
// Runtime screens announce themselves with handshake `auth.role === 'runtime'`;
// every other socket (the admin editor, admin alarm viewer, …) is unlimited.
// The cap is `conf.max_runtime_clients` — 0 or absent means unlimited. When the
// cap is reached a new handshake is rejected with the error 'client_limit_reached',
// which the client surfaces as a "maximum clients reached" screen and retries
// until a slot frees up.

const conf = require('../../../config/conf.json');

const isRuntime = (socket) => socket.handshake?.auth?.role === 'runtime';

function init(io) {
  const max = Number(conf.max_runtime_clients) || 0; // 0 → unlimited
  const runtimeClients = new Set();                  // currently-connected runtime socket ids

  // Reject the handshake before the connection is established when full. Only
  // runtime sockets are gated; admin/editor sockets always pass.
  io.use((socket, next) => {
    if (max > 0 && isRuntime(socket) && runtimeClients.size >= max) {
      return next(new Error('client_limit_reached'));
    }
    next();
  });

  io.on('connection', (socket) => {
    if (!isRuntime(socket)) return;
    runtimeClients.add(socket.id);
    socket.on('disconnect', () => runtimeClients.delete(socket.id));
  });
}

module.exports = { init };
