/**
 * In-memory PLC simulator — lets the whole app run without a real PLC.
 *
 * Behaviour:
 *  - Writes persist: writing an address stores the value; subsequent reads of
 *    that address return what was written (until overwritten).
 *  - Un-written addresses return a *live* synthetic signal so the monitor shows
 *    movement: analog values follow a slow sine + noise, booleans toggle on a
 *    period, integers ramp. The signal is derived deterministically from the
 *    address, so each variable keeps its own identity.
 *  - Production counters advance over time, so the batch lifecycle (produced /
 *    rejects / cycles / boxes) accumulates exactly as it would against a PLC.
 *
 * Keyed per machine so multiple simulated machines stay independent.
 */

// Data-type helpers (inlined; the simulator is transport-agnostic and no longer
// shares a protocol driver's type model).
function isFloat(dataType) {
  switch ((dataType || '').toUpperCase()) {
    case 'REAL': case 'REAL32': case 'FLOAT': case 'FLOAT32': case 'LREAL':
      return true;
    default:
      return false;
  }
}
function isLong(dataType) {
  switch ((dataType || '').toUpperCase()) {
    case 'LONG': case 'INT32': case 'DINT': case 'UINT32': case 'UDINT':
    case 'ULONG': case 'REAL32': case 'REAL': case 'FLOAT': case 'FLOAT32':
    case 'LREAL':
      return true;
    default:
      return false;
  }
}

const written = new Map();   // `${machineId}:${address}` → value
const counters = new Map();  // machineId → { values:number[], last:number }

// Stable numeric seed from an address string, so each variable keeps its own
// identity in the synthetic signal regardless of address format (ADS symbol,
// OPC UA NodeId, …).
function addrSeed(address) {
  const s = String(address ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 100000;
}

function key(machineId, address) {
  return `${machineId}:${address}`;
}

function isAnalog(dataType) {
  return isFloat(dataType);
}

// Deterministic synthetic signal for an address that was never written.
function syntheticValue(machineId, pos, dataType) {
  const t = Date.now() / 1000;
  const phase = ((machineId * 131 + pos * 17) % 360) * (Math.PI / 180);
  const dt = (dataType || '').toUpperCase();

  if (dt === 'BOOL') {
    // toggles with a per-address period of 2-9 s
    const period = 2 + ((pos + machineId) % 8);
    return Math.floor(t / period) % 2 === 0;
  }
  if (isAnalog(dataType)) {
    const base = 50 + ((pos * 7) % 50);          // 50..99 baseline
    const amp = 10 + ((pos * 3) % 20);           // 10..29 amplitude
    return parseFloat((base + amp * Math.sin(t * 0.4 + phase)).toFixed(2));
  }
  if (isLong(dataType)) {
    // slowly ramping integer
    return Math.floor(1000 + (t * 3 + pos) % 5000);
  }
  // 16-bit int: bounded ramp/oscillation
  return Math.floor(100 + 50 * (1 + Math.sin(t * 0.6 + phase)));
}

function readValue(machine, { address, dataType }) {
  const k = key(machine.id, address);
  if (written.has(k)) return written.get(k);
  return syntheticValue(machine.id, addrSeed(address), dataType);
}

function writeValue(machine, { address, value }) {
  written.set(key(machine.id, address), value);
  return true;
}

// ── Production counters (batch demo) ──────────────────────────────────────────
function counterState(machineId) {
  let s = counters.get(machineId);
  if (!s) {
    s = { values: new Array(22).fill(0), last: Date.now() };
    counters.set(machineId, s);
  }
  return s;
}

/**
 * Returns a raw counter block. Indices follow the legacy mapping used by the
 * batch service (0=produced, 1=box1, 5=rejects, 6=cycles, 8/9/10=box2/3/4).
 * Counters advance proportionally to elapsed time so production looks real.
 */
function readBlock(machine, { pos_in, n_dati }) {
  const count = n_dati || 22;
  const s = counterState(machine.id);
  const now = Date.now();
  const dt = (now - s.last) / 1000; // seconds since last read
  s.last = now;

  if (machine.sim?.run !== false && dt > 0) {
    const rate = (machine.sim?.parts_per_sec ?? 1.5);
    const made = Math.max(0, Math.round(rate * dt + (Math.random() - 0.3)));
    s.values[0] += made;                                  // produced
    s.values[6] += made + (Math.random() < 0.2 ? 1 : 0);  // cycles
    if (Math.random() < 0.08) s.values[5] += 1;           // rejects
    s.values[1] += made;                                  // box1
    s.values[8] = Math.floor(s.values[1] * 0.4);          // box2
    s.values[9] = Math.floor(s.values[1] * 0.25);         // box3
    s.values[10] = Math.floor(s.values[1] * 0.1);         // box4
  }
  return s.values.slice(0, count).map((v) => v >>> 0);
}

function writeBlock(machine, { words }) {
  // batch reactivation restoring counters — accept and store
  const s = counterState(machine.id);
  for (let i = 0; i < words.length && i < s.values.length; i++) s.values[i] = words[i] >>> 0;
  return true;
}

/** Reset a machine's simulated production (used when (re)starting a batch). */
function resetCounters(machineId) {
  counters.set(machineId, { values: new Array(22).fill(0), last: Date.now() });
}

module.exports = { readValue, writeValue, readBlock, writeBlock, resetCounters };
