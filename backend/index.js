// Install the console→file tee FIRST so every subsequent require/init line is
// also captured in the diagnostic log (data/logs/app.log).
require('./src/services/logger').install();

const express = require('express');
const compression = require('compression');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const conf = require('../config/conf.json');

const scanner = require('./src/scanner');
const eventLog = require('./src/services/eventLog');
const alarmWatcher = require('./src/services/alarmWatcher');
const editorLock = require('./src/services/editorLock');
const clientLimit = require('./src/services/clientLimit');
const features = require('./src/services/features');

const authRouter = require('./src/routes/auth');
const pagesRouter = require('./src/routes/pages');
const usersRouter = require('./src/routes/users');
const plcRouter = require('./src/routes/plc');
const alarmsRouter = require('./src/routes/alarms');
const recipesRouter = require('./src/routes/recipes');
const assetsRouter  = require('./src/routes/assets');
const traceRouter   = require('./src/routes/trace');
const systemRouter  = require('./src/routes/system');
const i18nRouter    = require('./src/routes/i18n');
const transferRouter = require('./src/routes/transfer');
const textioRouter  = require('./src/routes/textio');
const sidebarRouter = require('./src/routes/sidebar');
const projectRouter = require('./src/routes/project');
const groupsRouter  = require('./src/routes/groups');
const libraryRouter = require('./src/routes/library');
const clientLogRouter = require('./src/routes/clientLog');

// Single-machine deployment: the machine/PLC config lives in the project store
// (data/machines.json) and is trimmed to a single entry there; see src/store.js.

const app = express();

// gzip every response big enough to benefit — the built SPA bundle is ~2.7 MB
// uncompressed (index.js alone ~2 MB); gzip cuts that to a few hundred KB, which
// is the first-load cost on the weak runtime PCs. Must sit before the static
// handler and the routers so both the bundle and API JSON are compressed.
app.use(compression());

// CORS origin is '*' by default (convenient for a single-host install that serves
// both the UI and API). For a hardened deployment set conf.cors_origin to your
// exact origin(s) — a string or array — to lock cross-origin access down.
const corsOrigin = conf.cors_origin || '*';
app.use(cors({ origin: corsOrigin }));
// Limit is generous because page transfer bundles embed image assets as base64.
app.use(express.json({ limit: '150mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date() });
});

app.use('/api/auth', authRouter);
app.use('/api/pages', pagesRouter);
app.use('/api/users', usersRouter);
app.use('/api/plc', plcRouter);
app.use('/api/alarms', alarmsRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/trace', traceRouter);
app.use('/api/system', systemRouter);
app.use('/api/i18n', i18nRouter);
app.use('/api/transfer', transferRouter);
app.use('/api/textio', textioRouter);
app.use('/api/sidebar', sidebarRouter);
app.use('/api/project', projectRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/library', libraryRouter);
app.use('/api/client-log', clientLogRouter);

// ── Serve the built frontend (production: one process serves UI + API) ─────────
// In development the Vite dev server (frontend_port) hosts the SPA and proxies
// /api + /socket.io here. In a portable production install there is no Vite
// server, so this same process serves frontend/dist on the backend port. The
// SPA uses client-side routing and a relative "/api" base, so any non-/api GET
// must return index.html (deep-link / refresh) while /api misses still fall
// through to the JSON 404 below. socket.io intercepts /socket.io before Express.
const FRONTEND_DIST = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
  // Vite fingerprints every file under /assets with a content hash, so a given
  // URL never changes contents — cache it hard (1y, immutable) to skip even the
  // 304 revalidation on each navigation/reload. index.html itself is served with
  // the default (revalidated) caching so a new deploy is always picked up.
  app.use('/assets', express.static(path.join(FRONTEND_DIST, 'assets'), {
    immutable: true,
    maxAge: '1y',
  }));
  app.use(express.static(FRONTEND_DIST));
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => err && next(err));
  });
  console.log(`[static] serving frontend from ${FRONTEND_DIST}`);
} else {
  console.warn(`[static] no built frontend at ${FRONTEND_DIST} — run the frontend build (UI will 404)`);
}

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: corsOrigin },
});

// Each subsystem below is gated by its master switch in conf.features (resolved
// by services/features.js). This is the single place that decides what runs.
features.logSummary();

clientLimit.init(io);   // cap concurrent runtime screens (conf.max_runtime_clients)
scanner.init(io);
if (features.isEnabled('event_log')) eventLog.init();   // local audit trail (data/audit_log.jsonl)
if (features.isEnabled('alarms')) alarmWatcher.init(io);
editorLock.init(io);    // single-client lock for the designer/admin area

const port = conf.backend_port || 3100;
const host = conf.backend_host || '0.0.0.0';
server.listen(port, host, () => {
  console.log(`HMI backend listening on ${host}:${port}`);
});

// ── Graceful shutdown ──────────────────────────────────────────────────────────
// Close the PLC connections (also fixes a pre-existing leak), then stop the HTTP
// server. Idempotent against repeated signals.
const ads = require('./src/plc/ads');
const opcua = require('./src/plc/opcua');
let shuttingDown = false;
async function shutdown(signal, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} — closing PLC connections`);
  try { await ads.disconnectAll(); } catch (e) { console.warn('[shutdown] ads disconnect:', e.message); }
  try { await opcua.disconnectAll(); } catch (e) { console.warn('[shutdown] opcua disconnect:', e.message); }
  server.close(() => process.exit(code));
  // Safety net: force-exit if something keeps the loop alive.
  setTimeout(() => process.exit(code), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Process-level crash handlers — log (the logger's writes are synchronous, so the
// line is on disk) before exiting. An uncaught exception leaves the process in an
// undefined state, so we flush and exit non-zero (a supervisor/nodemon restarts
// it). An unhandled rejection is logged but kept non-fatal so a stray promise
// doesn't take the HMI down.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  shutdown('uncaughtException', 1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason instanceof Error ? reason : String(reason));
});
