/**
 * PLC alarm auto-triggering service — ports the legacy monitor.exe alarm scan
 * (Allarmi.cs `allarmi_aggiorna_allarmi`) to the Node backend.
 *
 * Each enabled machine polls a contiguous block of PLC "alarm words" and does
 * rising/falling edge detection against the previous snapshot, exactly like the
 * legacy `stato_allarmi` vs `stato_allarmi_prec` comparison:
 *
 *   bit 0 → 1  (rising)  → add the alarm to the in-memory active set (occurred_at)
 *   bit 1 → 0  (falling) → remove it from the active set
 *
 * Fired-alarm history is NOT persisted. Only the current active set is kept, in
 * memory — see activeAlarms / getActive().
 *
 * Bit → alarm_code mapping (1-based, per project decision):
 *   alarm_code = base_code + word_index * bits_per_word + bit_index
 * so with base_code=1 the first bit of the first word is alarm 1.
 *
 * Per-machine config lives in the machine's `alarms` block (data/machines.json):
 *   { enabled, ads_symbol, word_count, bits_per_word, base_code, poll_interval_ms }
 *
 * On every trigger/clear the service emits Socket.IO `alarms_changed` so the
 * Active Alarms view updates instantly (the 10s poll remains as a fallback).
 */

const scanner = require('../scanner');
const store = require('../store');

const pollTimers = new Map();  // machineId → timer
const prevWords = new Map();   // machineId → number[] (last snapshot; undefined until seeded)
const simTick = new Map();     // machineId → integer (drives the simulation pattern)

// Active (unresolved) alarms, held in memory only. Fired-alarm *history* is not
// persisted. Rising edges add to this map; falling edges remove.
const activeAlarms = new Map(); // machineId → Map(alarm_code → { alarm_code, occurred_at })

let io = null;

function pad(n) { return String(n).padStart(2, '0'); }
function nowStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function alarmCfg(machine) {
  const a = machine.alarms || {};
  return {
    enabled: !!a.enabled,
    word_count: a.word_count ?? 32,
    bits_per_word: a.bits_per_word ?? machine.n_bit ?? 16,
    base_code: a.base_code ?? 1,
    interval: a.poll_interval_ms ?? machine.scan_interval_ms ?? 1000,
    ads_symbol: a.ads_symbol || null,       // Beckhoff: name of the BOOL-array alarm symbol
    opcua_nodeid: a.opcua_nodeid || null,   // OPC UA: NodeId of the BOOL-array alarm node
  };
}

function init(socketIo) {
  io = socketIo;
  const simulation = scanner.getSimulation();
  for (const m of store.machines.all()) {
    const cfg = alarmCfg(m);
    if (!cfg.enabled) continue;
    if (!(m.is_active || simulation)) continue;
    startMachineWatch(m, cfg);
  }
}

function startMachineWatch(machine, cfg) {
  if (pollTimers.has(machine.id)) return;
  const timer = setInterval(() => pollMachine(machine, cfg).catch((e) => {
    console.error(`alarmWatcher machine ${machine.id}:`, e.message);
  }), cfg.interval);
  pollTimers.set(machine.id, timer);
  console.log(`alarmWatcher: watching machine ${machine.id} (${cfg.word_count} words, every ${cfg.interval}ms)`);
}

/**
 * Read the machine's alarms as an array of unsigned words (each bit = one alarm).
 *   ads    — read a BOOL-array symbol (ads_symbol) and pack it into words.
 *   opcua  — read a BOOL-array node (opcua_nodeid) and pack it into words.
 * In simulation there is no alarm memory, so we synthesize a slow rotating
 * pattern purely so the feature is testable end-to-end (trigger → ack → resolve).
 */
async function readAlarmWords(machine, cfg) {
  const proto = scanner.protocolOf(machine);
  if (proto === 'ads') return readBoolArrayAlarmWords(machine, cfg, cfg.ads_symbol);
  if (proto === 'opcua') return readBoolArrayAlarmWords(machine, cfg, cfg.opcua_nodeid);
  if (proto === 'sim') return simulateAlarmWords(machine, cfg);
  return null;  // mock: no alarm source — stay silent
}

/**
 * Alarms exposed as a flat BOOL array, one element per alarm — e.g.
 * `aAlarms : ARRAY[1..1024] OF BOOL` (ADS symbol) or an array node (OPC UA). The
 * driver reads the whole array in one read (0-based JS array, so element i is PLC
 * element i+1). We pack the booleans into the same word/bit layout the edge-detector
 * uses, giving alarm_code = base_code + i (base_code=1 → element[1] is code 1).
 * `address` is the machine's alarm symbol (ADS) or NodeId (OPC UA).
 */
async function readBoolArrayAlarmWords(machine, cfg, address) {
  if (!address) return null;                              // not configured → stay silent
  const bools = await scanner.readVariable(machine.id, address, 'BOOL');
  if (!Array.isArray(bools)) return null;                 // read failed / not an array → skip
  return packBoolsToWords(bools, cfg.bits_per_word);
}

/** Pack a boolean array into unsigned words (bit i → word floor(i/bpw), bit i%bpw). */
function packBoolsToWords(bools, bitsPerWord) {
  const bpw = bitsPerWord || 16;
  const words = new Array(Math.ceil(bools.length / bpw)).fill(0);
  for (let i = 0; i < bools.length; i++) {
    if (!bools[i]) continue;
    const w = Math.floor(i / bpw);
    words[w] = (words[w] | (1 << (i % bpw))) >>> 0;
  }
  return words;
}

/** Deterministic demo pattern: cycles a couple of alarm bits on/off over time. */
function simulateAlarmWords(machine, cfg) {
  const tick = (simTick.get(machine.id) ?? 0) + 1;
  simTick.set(machine.id, tick);
  const words = new Array(cfg.word_count).fill(0);
  const setCode = (code) => {
    const idx = code - cfg.base_code;
    if (idx < 0) return;
    const w = Math.floor(idx / cfg.bits_per_word);
    const b = idx % cfg.bits_per_word;
    if (w < words.length) words[w] = (words[w] | (1 << b)) >>> 0;
  };
  const phase = Math.floor(tick / 8) % 4;   // advances every 8 polls
  if (phase === 1 || phase === 2) setCode(cfg.base_code);       // alarm #1
  if (phase === 2 || phase === 3) setCode(cfg.base_code + 4);   // alarm #5

  // Also cycle any composite alarms on/off so their composed description is
  // exercised in simulation. Toggling (on in phases 1 & 3, off in 0 & 2) makes
  // each one re-trigger, which re-latches fresh (advancing) list indices — see
  // simCompositeIndices — so the operator sees the composed text change.
  if (phase === 1 || phase === 3) {
    for (const d of store.alarmDefinitions.filter((x) => x.composite)) {
      const code = Number(d.alarm_code);
      if (Number.isInteger(code)) setCode(code);
    }
  }
  return words;
}

async function pollMachine(machine, cfg) {
  const words = await readAlarmWords(machine, cfg);
  if (!words) return;

  const prev = prevWords.get(machine.id);
  // First successful read seeds the baseline WITHOUT firing, so a restart never
  // re-triggers alarms that were already active (they stay in the active set).
  if (!prev) { prevWords.set(machine.id, words); return; }

  const risen = [];
  const fallen = [];
  const len = Math.max(words.length, prev.length);
  for (let w = 0; w < len; w++) {
    const cur = words[w] >>> 0;
    const old = (prev[w] ?? 0) >>> 0;
    const changed = cur ^ old;
    if (changed === 0) continue;                 // word-skip optimisation (legacy)
    for (let b = 0; b < cfg.bits_per_word; b++) {
      if (((changed >>> b) & 1) === 0) continue;
      const code = cfg.base_code + w * cfg.bits_per_word + b;
      if ((cur >>> b) & 1) risen.push(code);
      else fallen.push(code);
    }
  }
  prevWords.set(machine.id, words);

  if (!risen.length && !fallen.length) return;

  // Trigger before emitting so composite alarms have their PLC indices latched
  // by the time clients re-fetch the (now composed) active list.
  await Promise.all(risen.map((code) => triggerAlarm(machine.id, code)));
  for (const code of fallen) clearAlarm(machine.id, code);

  if (io) io.emit('alarms_changed', { risen, fallen });
}

async function triggerAlarm(machineId, alarmCode) {
  let m = activeAlarms.get(machineId);
  if (!m) { m = new Map(); activeAlarms.set(machineId, m); }
  if (m.has(alarmCode)) return;                 // already active — don't re-stamp
  const entry = { alarm_code: alarmCode, occurred_at: nowStr() };
  // Composite alarms: latch the two PLC row-numbers now (legacy behaviour), so
  // the description stays fixed for the duration of this occurrence. The route
  // layer turns these indices into text when enriching the active list.
  const def = store.alarmDefinitions.find((d) => Number(d.alarm_code) === alarmCode);
  if (def && def.composite && Array.isArray(def.composite_parts) && def.composite_parts.length) {
    entry.composite_indices = scanner.getSimulation()
      ? simCompositeIndices(machineId, def)       // no PLC in sim → synthesise indices
      : await readCompositeIndices(machineId, def);
  }
  m.set(alarmCode, entry);
}

// Simulation stand-in for the PLC row-numbers: walk through each referenced
// list's entries, offset per part so the two don't move in lockstep, and advance
// with the sim tick so successive occurrences compose different text. Returns
// PLC-style values honouring the alarm's index base (so the route's
// value→entry math lands on a real entry).
function simCompositeIndices(machineId, def) {
  const tick = simTick.get(machineId) ?? 0;
  const base = Number(def.composite_index_base) === 0 ? 0 : 1;
  return def.composite_parts.map((p, i) => {
    const list = p && p.list_id != null
      ? store.alarmLists.find((l) => String(l.id) === String(p.list_id)) : null;
    const len = list && Array.isArray(list.entries) ? list.entries.length : 0;
    if (!len) return null;
    return ((tick + i) % len) + base;   // 0-based position → PLC value
  });
}

// Read the row-number for each composite part from the PLC. Returns an array
// aligned with def.composite_parts; a part with no address or a failed read
// yields null (the route then falls back to the generic description).
async function readCompositeIndices(machineId, def) {
  const out = [];
  for (const p of def.composite_parts) {
    const addr = p && p.address;
    if (addr == null || addr === '') { out.push(null); continue; }
    try {
      const v = await scanner.readVariable(machineId, addr, p.data_type || 'INT16');
      out.push(v == null ? null : Number(v));
    } catch {
      out.push(null);
    }
  }
  return out;
}

function clearAlarm(machineId, alarmCode) {
  activeAlarms.get(machineId)?.delete(alarmCode);
}

/**
 * Snapshot of currently-active (unresolved) alarms, newest first.
 * @returns {Array<{alarm_code:number, occurred_at:string}>}
 */
function getActive() {
  const out = [];
  for (const [, m] of activeAlarms) {
    for (const a of m.values()) out.push(a);
  }
  return out.sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : 0));
}

function stop() {
  for (const t of pollTimers.values()) clearInterval(t);
  pollTimers.clear();
  prevWords.clear();
}

module.exports = { init, stop, getActive };
