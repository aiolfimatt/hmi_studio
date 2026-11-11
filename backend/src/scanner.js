/**
 * PLC Scanner — maintains per-machine PLC connections and pushes variable
 * values to subscribed Socket.IO rooms.
 *
 * Each machine selects its protocol via conf.json `protocol`:
 *   "ads"   — Beckhoff TwinCAT ADS, by symbol name (see plc/ads.js)
 *   "opcua" — OPC UA, by NodeId (see plc/opcua.js)
 *   "mock"  — synthetic values (no PLC)
 * The global `simulation` switch overrides all machines to the in-memory sim.
 *
 * Per-widget K multiplier, rounding and input limits (k/round/limit) are applied
 * after the raw read, before the value is displayed.
 *
 * Room naming: "page:{pageName}" — all viewers of that page subscribe.
 */

const conf = require('../../config/conf.json');
const store = require('./store');
const ads = require('./plc/ads');
const opcua = require('./plc/opcua');
const simulator = require('./plc/simulator');

// Global simulation switch. When on, every machine is served by the in-memory
// simulator regardless of its configured protocol — lets the app run with no PLC.
let simulation = !!conf.simulation;
function getSimulation() { return simulation; }
function setSimulation(on) {
  simulation = !!on;
  // (re)arm scan loops so newly-relevant machines emit while simulating
  for (const m of store.machines.all()) {
    if ((m.is_active || simulation) && !scanTimers.has(m.id)) startMachineScan(m);
  }
  return simulation;
}

/** Effective protocol for a machine, honouring the global simulation switch. */
function protocolOf(machine) {
  if (simulation) return 'sim';
  return (machine?.protocol || 'mock').toLowerCase();
}

const pageDefinitions = new Map();     // pageName → page definition (from the JSON store)
let io = null;

const scanTimers = new Map(); // machineId → timer
// pageName → last values BROADCAST to the page's room, so a periodic tick can emit
// only the keys that actually changed (and skip the emit entirely when nothing
// moved). New subscribers still get a full snapshot from the subscribe_page
// handler, so clients never miss the baseline the deltas apply on top of.
const pageValueCache = new Map();

// Keys of `next` whose value differs from `prev` (the full `next` when there is no
// prior snapshot), or null when nothing changed so the caller can skip the emit.
// Scan values are primitives (number/bool/string/null) — strict compare suffices.
function diffValues(prev, next) {
  const changed = {};
  let any = false;
  for (const k in next) {
    if (!prev || next[k] !== prev[k]) { changed[k] = next[k]; any = true; }
  }
  return any ? changed : null;
}

// Single-machine deployment: resolve the (optional) id to the one machine. A
// missing/unknown id falls back to the single configured machine, so callers no
// longer need to pass a machine id at all.
function machineById(id) {
  const list = store.machines.all();
  return list.find((m) => m.id === id) || list[0];
}

function init(socketIo) {
  io = socketIo;

  io.on('connection', (socket) => {
    socket.on('subscribe_page', async (pageName) => {
      socket.join(`page:${pageName}`);
      await ensurePageLoaded(pageName);
      const vals = await readPageVariables(pageName);
      socket.emit('plc_values', vals);
    });

    socket.on('unsubscribe_page', (pageName) => {
      socket.leave(`page:${pageName}`);
    });
  });

  for (const m of store.machines.all()) {
    if (m.is_active || simulation) startMachineScan(m);
  }
}

function startMachineScan(machine) {
  const interval = machine.scan_interval_ms || 500;
  let busy = false; // a tick still reading when the next fires (slow PLC) → skip it
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const rooms = io.sockets.adapter.rooms;
      for (const [pageName] of pageDefinitions) {
        const roomName = `page:${pageName}`;
        if (!rooms.has(roomName)) continue;
        const page = pageDefinitions.get(pageName);
        if (!page) continue;
        const vals = await readPageVariables(pageName);
        // Emit only the changed keys, and nothing at all when the page is static —
        // this cuts socket traffic and client re-renders on an idle screen. The
        // cache tracks what the room has; new subscribers get their own full
        // snapshot from subscribe_page, so these deltas stay consistent.
        const delta = diffValues(pageValueCache.get(pageName), vals);
        pageValueCache.set(pageName, vals);
        if (delta) io.to(roomName).emit('plc_values', delta);
      }
    } finally {
      busy = false;
    }
  }, interval);
  scanTimers.set(machine.id, timer);
}

async function ensurePageLoaded(pageName) {
  if (pageDefinitions.has(pageName)) return;
  try {
    const page = store.pages.find((p) => p.name === pageName);
    if (page) {
      const def = typeof page.definition === 'string'
        ? JSON.parse(page.definition) : (page.definition || { widgets: [] });
      pageDefinitions.set(pageName, { ...def });
    }
  } catch (e) {
    console.error('ensurePageLoaded error:', e.message);
  }
}

function invalidatePage(pageName) {
  pageDefinitions.delete(pageName);
  // Drop the cached snapshot too: an edited page may have different keys, so the
  // next tick must re-broadcast the full set rather than diff against stale keys.
  pageValueCache.delete(pageName);
}

async function readPageVariables(pageName) {
  const page = pageDefinitions.get(pageName);
  if (!page) return {};
  const widgets = page.widgets || [];
  const result = {};

  // Collect one read task per widget variable and run them all concurrently.
  // Awaiting each read in series (the previous behaviour) meant a page with many
  // widgets — or a grid that expands to rowCount×columns cells — did N sequential
  // PLC round-trips per scan tick. Every transport is safe to pipeline: ads-client
  // and node-opcua both multiplex over their connection (invoke/request ids). Each
  // task returns its own key→value map, merged into the shared result after all
  // settle.
  const tasks = [];
  for (const w of widgets) {
    for (const v of getWidgetVariables(w)) tasks.push(readOneVariable(v));
  }
  for (const entries of await Promise.all(tasks)) Object.assign(result, entries);
  return result;
}

// Read one widget variable and return its key→value entries (multiple for DAQ
// lists and struct arrays). A transport failure resolves to { key: null } so one
// dead variable never rejects the whole-page Promise.all.
async function readOneVariable(v) {
  const out = {};
  try {
    // PLC array-of-struct (ADS, source='struct'): read the whole array symbol
    // once per tick, then expand each struct field into a column cell
    // ("<id>_<col>_<row>") — the same keys the per-column plc grid uses, so
    // GridWidget renders both identically. ADS-only (null elsewhere).
    if (v.structArray) {
      const arr = await readStructArray(v.structArray.symbol);
      const { fields, count } = v.structArray;
      for (let ri = 0; ri < count; ri++) {
        const row = Array.isArray(arr) ? arr[ri] : null;
        fields.forEach((f, ci) => {
          const raw = (row && f.field != null) ? row[f.field] : null;
          out[`${v.key}_${ci}_${ri}`] = applyTransform(raw ?? null, f);
        });
      }
      return out;
    }
    if (!v.address) return out;
    const raw = await readVariable(undefined, v.address, v.dataType);
    out[v.key] = applyTransform(raw, v);
    return out;
  } catch {
    out[v.key] = null;
    return out;
  }
}

/** Apply K multiplier, rounding and clamping to a raw read (legacy display math). */
function applyTransform(value, v) {
  if (value === null || value === undefined || typeof value === 'boolean') return value;
  let out = Number(value);
  if (Number.isNaN(out)) return value;
  if (v.k !== undefined && v.k !== null && v.k !== '') {
    const kk = Number(v.k);
    if (!Number.isNaN(kk) && kk !== 1 && kk !== 0) out *= kk;
  }
  if (v.round !== undefined && v.round !== null && v.round !== '') {
    const dec = parseInt(v.round, 10);
    if (!Number.isNaN(dec) && dec >= 0) out = Number(out.toFixed(dec));
  }
  return out;
}

function widgetTransform(props = {}) {
  return {
    k: props.k ?? props.kMultiplier,
    round: props.round ?? props.decimals,
    min: props.limitMin,
    max: props.limitMax,
  };
}

function getWidgetVariables(widget) {
  const vars = [];
  const t = widgetTransform(widget.props);
  // Generic PLC source: an address served by the machine's primary protocol.
  // Guard on source so a non-'plc' widget (e.g. list/session) that happens to
  // carry a plcAddress isn't also read over the primary transport.
  if (widget.props?.plcAddress && (!widget.props.source || widget.props.source === 'plc')) {
    vars.push({
      key: widget.id,
      address: widget.props.plcAddress,
      dataType: widget.props.dataType || 'REAL',
      ...t,
    });
  }
  if (widget.type === 'table' && Array.isArray(widget.props?.rows)) {
    for (const row of widget.props.rows) {
      if (row.plcAddress) {
        vars.push({ key: `${widget.id}_${row.key}`, address: row.plcAddress, dataType: row.dataType || 'REAL', ...widgetTransform(row) });
      }
    }
  }
  if (widget.type === 'io' && widget.props?.plcAddress) {
    const count = widget.props.ioCount || 16;
    for (let i = 0; i < count; i++) {
      vars.push({ key: `${widget.id}_${i}`, address: `${widget.props.plcAddress}[${i}]`, dataType: 'BOOL' });
    }
  }
  if (widget.type === 'grid') {
    const rowCount = widget.props?.rowCount || 8;
    if (widget.props?.source === 'struct' && widget.props?.structSymbol) {
      // ADS array-of-struct: one read of the array symbol per tick, each column
      // bound to a struct field (col.field). Per-column K/round still apply.
      const cols = Array.isArray(widget.props.columns) ? widget.props.columns : [];
      vars.push({
        key: widget.id,
        structArray: {
          symbol: widget.props.structSymbol,
          count: rowCount,
          fields: cols.map((c) => ({ field: c.field, ...widgetTransform(c) })),
        },
      });
    } else if (Array.isArray(widget.props?.columns)) {
      widget.props.columns.forEach((col, ci) => {
        if (!col.plcAddress) return;
        for (let ri = 0; ri < rowCount; ri++) {
          vars.push({ key: `${widget.id}_${ci}_${ri}`, address: `${col.plcAddress}[${ri}]`, dataType: col.dataType || 'REAL', ...widgetTransform(col) });
        }
      });
    }
  }
  return vars;
}


// Read an array-of-struct symbol/node whole (used by the grid's struct source).
// ADS/OPC-UA only: the primary machine must speak one of those (returns null under
// sim/mock so struct cells simply show no value). Transport failures swallow
// to null so a down PLC never throws into the scan path.
async function readStructArray(symbol) {
  const machine = machineById();
  if (!machine) return null;
  const proto = protocolOf(machine);
  if (proto === 'ads') { try { return await ads.readValue(machine, { address: symbol }); } catch { return null; } }
  if (proto === 'opcua') { try { return await opcua.readValue(machine, { address: symbol }); } catch { return null; } }
  return null;
}

// ── Public read/write dispatch ────────────────────────────────────────────────
async function readVariable(machineId, address, dataType) {
  const machine = machineById(machineId);
  if (!machine) return simulation ? null : generateMockValue(dataType);
  const proto = protocolOf(machine);

  if (proto === 'sim') {
    return simulator.readValue(machine, { address, dataType });
  }
  if (proto === 'ads') {
    // ADS addresses are PLC symbol names (e.g. "MAIN.fSpeed"), used verbatim.
    try {
      return await ads.readValue(machine, { address, dataType });
    } catch {
      return null;
    }
  }
  if (proto === 'opcua') {
    // OPC UA addresses are NodeIds (e.g. "ns=4;s=MAIN.fSpeed").
    try {
      return await opcua.readValue(machine, { address, dataType });
    } catch {
      return null;
    }
  }
  return generateMockValue(dataType);
}

async function writeVariable(machineId, address, value, dataType) {
  const machine = machineById(machineId);
  if (!machine) return false;
  const proto = protocolOf(machine);

  if (proto === 'sim') {
    return simulator.writeValue(machine, { address, dataType, value });
  }
  if (proto === 'ads') {
    try {
      return await ads.writeValue(machine, { address, value, dataType });
    } catch {
      return false;
    }
  }
  if (proto === 'opcua') {
    try {
      return await opcua.writeValue(machine, { address, value, dataType });
    } catch {
      return false;
    }
  }
  return true; // mock: pretend success
}

/** Read a contiguous block of raw words — used by batch counter polling. */
async function readBlock(machineId, pos_in, count, riga) {
  const machine = machineById(machineId);
  if (!machine) return null;
  const proto = protocolOf(machine);
  if (proto === 'sim') {
    return simulator.readBlock(machine, { pos_in, n_dati: count, riga: riga || 0 });
  }
  if (proto === 'ads') {
    // Supported only if the machine exposes the counters as one array symbol
    // (ads.counters_symbol); otherwise fall through to zeros so batch math stays stable.
    try { const b = await ads.readBlock(machine, { count }); if (b) return b; } catch { /* ignore */ }
    return new Array(count).fill(0);
  }
  if (proto === 'opcua') {
    // Supported only if the machine exposes the counters as one array node
    // (opcua.counters_nodeid); otherwise fall through to zeros.
    try { const b = await opcua.readBlock(machine, { count }); if (b) return b; } catch { /* ignore */ }
    return new Array(count).fill(0);
  }
  // mock: no contiguous block read — return zeros so batch math is stable
  return new Array(count).fill(0);
}

// `skip` (array of element indices) is honoured only by ADS, whose whole-symbol
// read-modify-write can preserve specific counters (e.g. parts-per-box).
async function writeBlock(machineId, pos_in, words, riga, skip = []) {
  const machine = machineById(machineId);
  if (!machine) return false;
  const proto = protocolOf(machine);
  if (proto === 'sim') return simulator.writeBlock(machine, { pos_in, words, riga: riga || 0 });
  if (proto === 'ads') {
    try { return await ads.writeBlock(machine, { words, skip }); }
    catch { return false; }
  }
  if (proto === 'opcua') {
    try { return await opcua.writeBlock(machine, { words, skip }); }
    catch { return false; }
  }
  return true;
}

function generateMockValue(dataType) {
  switch ((dataType || '').toUpperCase()) {
    case 'BOOL': return Math.random() > 0.5;
    case 'INT': case 'INT16': case 'INT32': return Math.floor(Math.random() * 1000);
    case 'REAL': case 'LREAL': case 'FLOAT': return parseFloat((Math.random() * 100).toFixed(2));
    default: return parseFloat((Math.random() * 100).toFixed(2));
  }
}

module.exports = {
  init,
  readVariable,
  writeVariable,
  readBlock,
  writeBlock,
  invalidatePage,
  machineById,
  protocolOf,
  getSimulation,
  setSimulation,
};
