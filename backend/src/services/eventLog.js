/**
 * eventLog — local, file-backed audit trail.
 *
 * Every auditable action in the app (login, user change, PLC write, script run)
 * calls `append(event)` ONCE; the event is written as one JSON line to
 * `data/audit_log.jsonl`. Writes are synchronous and best-effort so a logging
 * failure never turns a completed action into a 500. This file is the permanent
 * sink — the no-legacy build has no external database.
 *
 * The file is capped: once it grows past COMPACT_AT lines it is rewritten to the
 * newest MAX_LINES records, so it can't grow without bound. `query()` backs the
 * /api/trace viewer endpoint (filter by type / date / user, newest first).
 */
const fs = require('fs');
const path = require('path');
const features = require('./features');

const LOG_FILE = path.join(__dirname, '../../../data/audit_log.jsonl');
const MAX_LINES = 20000;                       // records kept after a compaction
const COMPACT_AT = Math.floor(MAX_LINES * 1.25); // compact once the file exceeds this

let lineCount = 0;

// "YYYY-MM-DD HH:MM:SS" (local time) — same shape store.js uses, and lexically
// sortable so the from/to string filters in query() work by plain comparison.
function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function readLines() {
  try {
    return fs.readFileSync(LOG_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
  } catch { return []; }
}

// Keep only the newest MAX_LINES records so the log can't grow unbounded.
function compact() {
  try {
    const lines = readLines();
    if (lines.length <= MAX_LINES) { lineCount = lines.length; return; }
    const kept = lines.slice(lines.length - MAX_LINES);
    const tmp = `${LOG_FILE}.tmp`;
    fs.writeFileSync(tmp, kept.join('\n') + '\n');
    fs.renameSync(tmp, LOG_FILE);
    lineCount = kept.length;
  } catch { /* best effort */ }
}

/**
 * Record an event (appended to the local audit log). Never throws, never blocks.
 * @param {object} e
 * @param {string}  e.action        canonical action, e.g. 'value_modified', 'login'
 * @param {number} [e.event_type]   numeric event code (services/constants HMI_EVENT)
 * @param {string} [e.username]     operator login
 * @param {string} [e.old_value] [e.new_value] [e.description] [e.reason]
 * @param {string} [e.page_name] [e.widget_label] [e.plc_address] [e.data_type] [e.ip_address]
 */
function append(e) {
  if (!e) return;
  // Master switch off → auditing is disabled: drop the event.
  if (!features.isEnabled('event_log')) return;
  const rec = {
    ts: now(),
    action: e.action || 'trace',
    event_type: e.event_type ?? null,
    user_id: e.user_id ?? null,
    username: e.username || '',
    page_name: e.page_name ?? null,
    widget_label: e.widget_label ?? null,
    plc_address: e.plc_address ?? null,
    data_type: e.data_type ?? null,
    old_value: e.old_value ?? null,
    new_value: e.new_value ?? null,
    reason: e.reason ?? null,
    description: e.description ?? null,
    ip_address: e.ip_address ?? null,
  };
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(rec) + '\n');
    if (++lineCount >= COMPACT_AT) compact();
  } catch { /* best effort — a failed audit write never breaks the action */ }
}

/**
 * Query the audit log, newest first. Filters: event_type (exact), from/to (ts
 * range, inclusive), username (substring), q (free-text over the whole record).
 * Returns { rows, total } where total is the match count before pagination.
 */
function query(opts = {}) {
  const { event_type, from, to, username, q, limit = 200, offset = 0 } = opts;
  let rows = readLines()
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
  if (event_type != null && event_type !== '') rows = rows.filter((r) => r.event_type === Number(event_type));
  if (from) rows = rows.filter((r) => r.ts >= from);
  if (to) rows = rows.filter((r) => r.ts <= to);
  if (username) {
    const u = String(username).toLowerCase();
    rows = rows.filter((r) => (r.username || '').toLowerCase().includes(u));
  }
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(needle));
  }
  rows.reverse(); // file is oldest→newest; viewer wants newest first
  const total = rows.length;
  const lim = Math.max(0, parseInt(limit, 10) || 200);
  const off = Math.max(0, parseInt(offset, 10) || 0);
  return { rows: rows.slice(off, off + lim), total };
}

function init() {
  if (!features.isEnabled('event_log')) { console.log('[eventLog] disabled (conf.features.event_log=false)'); return; }
  try { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); } catch { /* best effort */ }
  lineCount = readLines().length;
  console.log(`[eventLog] audit → data/audit_log.jsonl (${lineCount} records)`);
}

module.exports = { init, append, query };
