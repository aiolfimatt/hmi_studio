/**
 * logger — dependency-free diagnostic logging for the backend.
 *
 * The app logs diagnostics with raw `console.*` (each line tagged `[module]`).
 * This service keeps that style but TEES every console line to a size-rotated
 * file under `data/logs/` so there's a durable record after the terminal scrolls
 * or the service restarts — important for a kiosk HMI where nobody is watching
 * stdout. It also records operator-side (frontend) crashes forwarded by the
 * `/api/client-log` endpoint, so client and server diagnostics share one file.
 *
 * This is NOT the audit trail. Operator ACTIONS (writes, logins) still go through
 * `eventLog` → the local audit log. This file is for DIAGNOSTICS (what broke,
 * stack traces, lifecycle) only.
 *
 * Writes are synchronous `appendFileSync` so a line is on disk before an
 * `uncaughtException` handler exits the process. Volume here is low; durability
 * matters more than throughput.
 *
 * Config (config/conf.json "logging", all optional):
 *   { enabled, dir, file, level, max_size_mb, max_files, tee_console }
 * `level` (and the LOG_LEVEL env var) filter only what reaches the FILE — the
 * terminal always shows everything, so the dev experience is unchanged.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../store');

let conf = {};
try { conf = require('../../../config/conf.json').logging || {}; } catch { conf = {}; }

const ENABLED = conf.enabled !== false;
const TEE_CONSOLE = conf.tee_console !== false;
const LOG_DIR = path.join(DATA_DIR, conf.dir || 'logs');
const LOG_FILE = path.join(LOG_DIR, conf.file || 'app.log');
const MAX_BYTES = Math.max(0.1, Number(conf.max_size_mb) || 2) * 1024 * 1024;
const MAX_FILES = Math.max(1, Number(conf.max_files) || 5);
const THRESHOLD = String(process.env.LOG_LEVEL || conf.level || 'info').toLowerCase();

const ORDER = { debug: 10, info: 20, warn: 30, error: 40 };
const levelOk = (lvl) => (ORDER[lvl] || 20) >= (ORDER[THRESHOLD] || 20);

// Keep unpatched console refs so our own failures never recurse through the tee.
const orig = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: (console.debug || console.log).bind(console),
};

let curSize = 0;
let installed = false;
let warnedFail = false;

function ts() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

// Render one console argument the way a human expects: strings as-is, Errors as
// their stack, everything else as JSON (falling back to String on cycles).
function fmtArg(a) {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.stack || `${a.name}: ${a.message}`;
  if (a === undefined) return 'undefined';
  if (a === null) return 'null';
  try { return JSON.stringify(a); } catch { return String(a); }
}

function ensureDir() {
  try { if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { /* best effort */ }
}

function initSize() {
  try { curSize = fs.statSync(LOG_FILE).size; } catch { curSize = 0; }
}

// Size-based rotation: app.log → app.log.1 → … → app.log.N (oldest dropped).
function rotate() {
  try {
    const oldest = `${LOG_FILE}.${MAX_FILES - 1}`;
    if (fs.existsSync(oldest)) fs.unlinkSync(oldest);
    for (let i = MAX_FILES - 2; i >= 1; i--) {
      const src = `${LOG_FILE}.${i}`;
      if (fs.existsSync(src)) fs.renameSync(src, `${LOG_FILE}.${i + 1}`);
    }
    if (fs.existsSync(LOG_FILE)) fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch { /* if rotation fails, keep appending to the current file */ }
  curSize = 0;
}

function writeLine(line) {
  if (!ENABLED) return;
  const buf = line + '\n';
  const len = Buffer.byteLength(buf);
  try {
    if (curSize + len > MAX_BYTES) rotate();
    fs.appendFileSync(LOG_FILE, buf);
    curSize += len;
  } catch (e) {
    if (!warnedFail) { warnedFail = true; orig.error('[logger] file write failed:', e.message); }
  }
}

/**
 * Install the console tee. Idempotent. After this, every console.log/info/warn/
 * error/debug still prints to the terminal AND is appended to the log file
 * (subject to the level threshold), tagged `[backend]`.
 */
function install() {
  if (installed) return;
  installed = true;
  ensureDir();
  initSize();

  const wrap = (origFn, level) => (...args) => {
    if (TEE_CONSOLE) origFn(...args);
    if (ENABLED && levelOk(level)) {
      writeLine(`${ts()} ${level.toUpperCase().padEnd(5)} [backend] ${args.map(fmtArg).join(' ')}`);
    }
  };

  console.log = wrap(orig.log, 'info');
  console.info = wrap(orig.info, 'info');
  console.warn = wrap(orig.warn, 'warn');
  console.error = wrap(orig.error, 'error');
  console.debug = wrap(orig.debug, 'debug');

  writeLine(`${ts()} INFO  [backend] [logger] file logging started → ${LOG_FILE} (level=${THRESHOLD}, max=${Math.round(MAX_BYTES / 1024 / 1024)}MB x${MAX_FILES})`);
}

/**
 * Record a frontend-forwarded diagnostic (via /api/client-log). Tagged
 * `[client]` and echoed to the terminal so operator-side crashes are visible
 * live too. `entry`: { level, message, stack, context, url, userAgent }.
 */
function client(entry = {}) {
  const level = ORDER[entry.level] ? entry.level : 'error';
  const message = String(entry.message || '').slice(0, 2000);
  if (TEE_CONSOLE) orig.warn(`[client] ${message}`);
  if (!ENABLED || !levelOk(level)) return;

  const parts = [`${ts()} ${level.toUpperCase().padEnd(5)} [client] ${message}`];
  if (entry.context) parts.push(`ctx=${String(entry.context).slice(0, 500)}`);
  if (entry.url) parts.push(`url=${String(entry.url).slice(0, 500)}`);
  if (entry.userAgent) parts.push(`ua=${String(entry.userAgent).slice(0, 300)}`);
  writeLine(parts.join(' | '));
  if (entry.stack) {
    writeLine('    ' + String(entry.stack).slice(0, 8000).split('\n').join('\n    '));
  }
}

/** Last `n` lines of the current log file (for an optional admin viewer). */
function tail(n = 200) {
  try {
    const text = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = text.split('\n');
    return lines.slice(Math.max(0, lines.length - n)).join('\n');
  } catch { return ''; }
}

module.exports = { install, client, tail, file: () => LOG_FILE };
