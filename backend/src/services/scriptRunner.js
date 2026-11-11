/**
 * Server-side script runner — the "execute script" button event.
 *
 * A button may name a script file; the backend runs `data/scripts/<name>.js`
 * inside a locked-down Node `vm` context. The sandbox exposes ONLY a small set
 * of automation helpers — read/write the main ADS PLC, log, sleep, report an
 * outcome — and nothing else: no `require`, no `process`, no filesystem, no
 * network. Scripts are plain async JavaScript; top-level `await` is supported.
 *
 * Standard result protocol (so the runtime popup can report OK / error):
 *   - Success: the script finishes without throwing. It MAY be explicit with
 *     `succeed('all good')` or `return { ok: true, message: 'all good' }`.
 *   - Failure: `throw new Error('reason')`, `fail('reason')`, or
 *     `return { ok: false, message: 'reason' }`.
 *   - Progress: `progress('step 2 of 3…')` — surfaced live in the waiting popup.
 *   - Abort: the operator may abort from the popup. In-flight `sleep`/`read`/
 *     `write` then reject; a script may also cooperatively check `aborted()` /
 *     `throwIfAborted()` between steps.
 *
 * Allowlist: the only runnable scripts are the `*.js` files physically present
 * in `data/scripts/`. The requested name is reduced to a bare basename and
 * validated against `^[A-Za-z0-9_-]+$`, so path traversal is impossible.
 *
 * NOTE (security): `vm` is a sandbox, not a hardened security boundary. It is
 * acceptable here because (a) scripts are authored by the same trusted engineers
 * who design the HMI pages and ship with the project, (b) the context has no
 * require/process/fs/net, and (c) the file allowlist blocks arbitrary paths. Do
 * not widen the sandbox (e.g. expose `require`) without revisiting this.
 *
 * Helper API available to a script:
 *   await read(address, dataType='BOOL')          → current PLC value
 *   await write(address, value, dataType='BOOL')  → write a PLC value
 *   await sleep(ms)                                → pause (capped at 5s)
 *   log(...args)                                   → collect a line (returned to caller)
 *   progress(text)                                 → update the waiting popup live
 *   succeed(message) / fail(message)              → set the outcome explicitly
 *   aborted()                                      → true once the operator aborted
 *   throwIfAborted()                               → throw if aborted (cooperative)
 *   params                                         → object passed by the caller
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const scanner = require('../scanner');
const { DATA_DIR } = require('../store');

const SCRIPTS_DIR = path.join(DATA_DIR, 'scripts');
// Wall-clock ceiling for the whole run (async helpers aren't covered by vm's
// synchronous timeout, so we race the script against this budget). The operator
// can abort sooner from the waiting popup.
const RUN_TIMEOUT_MS = 120000;
// Synchronous-CPU ceiling for the vm itself — catches a tight `while(true)` that
// would otherwise block the event loop, independent of the wall-clock budget.
const SYNC_TIMEOUT_MS = 10000;
const SLEEP_CAP_MS = 5000;

// In-flight runs keyed by the caller-supplied runId, so a separate abort request
// can cancel one. Each entry is the run's AbortController.
const running = new Map();

function abortError() {
  const e = new Error('Script aborted');
  e.code = 'ABORTED';
  return e;
}

/** Ensure the scripts directory exists (first run / fresh install). */
function ensureDir() {
  if (!fs.existsSync(SCRIPTS_DIR)) fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
}

/** List the runnable script names (bare, no extension) — powers the editor picker. */
function listScripts() {
  ensureDir();
  try {
    return fs.readdirSync(SCRIPTS_DIR)
      .filter((f) => f.toLowerCase().endsWith('.js'))
      .map((f) => f.slice(0, -3))
      .sort();
  } catch {
    return [];
  }
}

/** Resolve a caller-supplied name to an existing script file, or null if invalid. */
function resolveScript(name) {
  const base = path.basename(String(name || '')).replace(/\.js$/i, '');
  if (!/^[A-Za-z0-9_-]+$/.test(base)) return null;
  const file = path.join(SCRIPTS_DIR, `${base}.js`);
  if (!fs.existsSync(file)) return null;
  return { base, file };
}

/**
 * Abort an in-flight run by its runId. Returns true if a matching run was found
 * and signalled (it may take until the script's next await to actually stop).
 */
function abort(runId) {
  const ctrl = running.get(String(runId));
  if (!ctrl) return false;
  ctrl.abort();
  return true;
}

/**
 * Run a named script. ALWAYS resolves with a normalised outcome describing how
 * the script finished, so the caller can report OK / error / aborted uniformly:
 *
 *   { ok, message, aborted, timedOut, logs, result }
 *
 * The only thrown error is for a missing / invalid script name (a configuration
 * error, surfaced as 404 by the route) — carrying `err.code = 'NO_SCRIPT'`.
 */
async function run(name, { params, runId, onProgress } = {}) {
  const resolved = resolveScript(name);
  if (!resolved) {
    const err = new Error(`script '${name}' not found in data/scripts`);
    err.code = 'NO_SCRIPT';
    throw err;
  }

  const source = fs.readFileSync(resolved.file, 'utf8');
  const logs = [];

  const controller = new AbortController();
  const { signal } = controller;
  const key = runId != null ? String(runId) : null;
  if (key) running.set(key, controller);

  // Explicit outcome set by succeed()/fail(); overrides the returned value.
  let explicit = null;

  const emitProgress = (text) => {
    const line = String(text ?? '');
    logs.push(line);
    try { onProgress?.(line); } catch { /* progress is best-effort */ }
  };

  const sandbox = {
    params: params && typeof params === 'object' ? { ...params } : {},
    log: (...args) => { logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); },
    progress: emitProgress,
    succeed: (message) => { explicit = { ok: true, message: message != null ? String(message) : '' }; },
    fail: (message) => { explicit = { ok: false, message: message != null ? String(message) : '' }; },
    aborted: () => signal.aborted,
    throwIfAborted: () => { if (signal.aborted) throw abortError(); },
    read: (address, dataType = 'BOOL') => {
      if (signal.aborted) throw abortError();
      return scanner.readVariable(undefined, address, dataType);
    },
    write: (address, value, dataType = 'BOOL') => {
      if (signal.aborted) throw abortError();
      return scanner.writeVariable(undefined, address, value, dataType);
    },
    sleep: (ms) => new Promise((resolve, reject) => {
      if (signal.aborted) return reject(abortError());
      const d = Math.min(Math.max(Number(ms) || 0, 0), SLEEP_CAP_MS);
      const id = setTimeout(resolve, d);
      signal.addEventListener('abort', () => { clearTimeout(id); reject(abortError()); }, { once: true });
    }),
  };
  const context = vm.createContext(sandbox);

  // Wrap in an async IIFE so the script body may use await at the top level.
  const wrapped = `(async () => {\n${source}\n})()`;
  const script = new vm.Script(wrapped, { filename: `scripts/${resolved.base}.js` });

  let timer;
  const budget = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`script '${resolved.base}' exceeded ${RUN_TIMEOUT_MS}ms`);
      e.code = 'TIMEOUT';
      reject(e);
    }, RUN_TIMEOUT_MS);
  });
  // Resolves (rejects) the moment the operator aborts, so the held HTTP request
  // returns immediately rather than waiting on the script's next await.
  const aborted = new Promise((_, reject) => {
    if (signal.aborted) return reject(abortError());
    signal.addEventListener('abort', () => reject(abortError()), { once: true });
  });

  try {
    // The synchronous portion is bounded by vm's own timeout; the returned
    // promise (async helpers) is bounded by the wall-clock budget / abort above.
    const exec = Promise.resolve(script.runInContext(context, { timeout: SYNC_TIMEOUT_MS }));
    // If abort/timeout wins the race, the script promise may still reject later
    // with nothing awaiting it — swallow that so it isn't an unhandledRejection.
    exec.catch(() => {});
    const result = await Promise.race([exec, budget, aborted]);

    if (explicit) return { ...explicit, aborted: false, timedOut: false, logs, result: result ?? null };
    // A returned object that opts into the protocol decides the outcome.
    if (result && typeof result === 'object' && typeof result.ok === 'boolean') {
      return { ok: result.ok, message: result.message != null ? String(result.message) : '', aborted: false, timedOut: false, logs, result };
    }
    // Any other return (or none) is a plain success; a returned string is the message.
    return { ok: true, message: typeof result === 'string' ? result : '', aborted: false, timedOut: false, logs, result: result === undefined ? null : result };
  } catch (err) {
    if (err && err.code === 'ABORTED') {
      return { ok: false, aborted: true, timedOut: false, message: explicit?.message || 'Script aborted', logs, result: null };
    }
    if (err && err.code === 'TIMEOUT') {
      return { ok: false, aborted: false, timedOut: true, message: err.message, logs, result: null };
    }
    // A thrown error (incl. vm sync timeout) is a script failure.
    return { ok: false, aborted: false, timedOut: false, message: err?.message || 'Script failed', logs, result: null };
  } finally {
    clearTimeout(timer);
    if (key && running.get(key) === controller) running.delete(key);
  }
}

module.exports = { run, abort, listScripts, resolveScript, SCRIPTS_DIR };
