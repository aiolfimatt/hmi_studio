/**
 * Beckhoff TwinCAT ADS transport (protocol "ads") — reads/writes PLC variables
 * by SYMBOL NAME via the `ads-client` library. A widget's plcAddress is the PLC
 * symbol path, e.g. "MAIN.fSpeed", "GVL.bRunning", "Program.Instance.nCount".
 *
 * Connection settings come from the machine's `ads` config block, falling back
 * to the top-level `ams_net_id` / `ads_port`:
 *
 *   "protocol": "ads",
 *   "ams_net_id": "5.62.36.72.1.1",   // target PLC AmsNetId
 *   "ads_port": 851,                    // 851 = TC3 PLC runtime (801 = TC2)
 *   "ads": {
 *     "router_address": "192.168.1.10", // set to reach the PLC's AMS router
 *     "router_tcp_port": 48898,         //   directly (no local TwinCAT needed)
 *     "local_ams_net_id": "192.168.1.50.1.1", // this host's AmsNetId (route it on the PLC)
 *     "local_ads_port": 32905,
 *     "timeout_ms": 5000,
 *     "auto_reconnect": true
 *   }
 *
 * If the backend runs on a Windows box with TwinCAT installed, the local router
 * is used automatically and only ams_net_id / ads_port are needed. Otherwise set
 * `ads.router_address` (the PLC IP) + `ads.local_ams_net_id`, and add a matching
 * ADS route on the PLC (TwinCAT → Routes) so it accepts this host.
 *
 * Failures never throw random data: a read that can't be served returns null
 * (widget shows no value). Connection attempts are rate-limited by a short
 * cooldown so a down PLC doesn't stall every scan tick.
 */

let AdsClient = null;
try { ({ Client: AdsClient } = require('ads-client')); } catch { /* optional dep */ }

// key → connected Client | pending connect Promise
const clients = new Map();
// key → epoch ms until which we skip reconnect attempts (after a failed connect)
const cooldownUntil = new Map();
const CONNECT_COOLDOWN_MS = 5000;

function key(machine) {
  const a = machine.ads || {};
  const net = a.target_ams_net_id || machine.ams_net_id || '';
  const port = a.target_ads_port || machine.ads_port || 851;
  return `${net}:${port}`;
}

function settingsFor(machine) {
  const a = machine.ads || {};
  const s = {
    targetAmsNetId: a.target_ams_net_id || machine.ams_net_id,
    targetAdsPort: a.target_ads_port || machine.ads_port || 851,
    timeoutDelay: a.timeout_ms || 5000,
    autoReconnect: a.auto_reconnect !== false,
    hideConsoleWarnings: true,
  };
  // Direct-to-PLC transport (no local TwinCAT router on this host).
  if (a.router_address) s.routerAddress = a.router_address;
  if (a.router_tcp_port) s.routerTcpPort = a.router_tcp_port;
  if (a.local_ams_net_id) s.localAmsNetId = a.local_ams_net_id;
  if (a.local_ads_port) s.localAdsPort = a.local_ads_port;
  return s;
}

// Resolve a live, connected client for the machine (connecting once, cached).
async function getClient(machine) {
  if (!AdsClient) throw new Error('ads-client not installed');
  if (!(machine.ads?.target_ams_net_id || machine.ams_net_id)) {
    throw new Error(`machine ${machine.id}: no ams_net_id configured for ADS`);
  }
  const k = key(machine);

  const cached = clients.get(k);
  if (cached) return cached; // connected client or in-flight connect promise

  const until = cooldownUntil.get(k) || 0;
  if (Date.now() < until) throw new Error('ADS connect cooling down');

  const client = new AdsClient(settingsFor(machine));
  const connecting = client.connect()
    .then(() => { clients.set(k, client); return client; })
    .catch((e) => {
      clients.delete(k);
      cooldownUntil.set(k, Date.now() + CONNECT_COOLDOWN_MS);
      try { client.disconnect().catch(() => {}); } catch { /* ignore */ }
      throw e;
    });
  clients.set(k, connecting);
  return connecting;
}

// Coerce a JS value to the shape the PLC symbol expects on write.
function coerceForWrite(value, dataType) {
  const dt = String(dataType || '').toUpperCase();
  if (dt === 'BOOL') return value === true || value === 1 || value === '1' || value === 'true';
  if (dt === 'STRING') return String(value ?? '');
  const n = Number(value);
  return Number.isNaN(n) ? value : n;
}

// ── numeric-position → ADS array-element mapping ───────────────────────────────
// Pages may address a flat MEM[] array by numeric position (a widget plcAddress
// like "2030"). TwinCAT has no such offset model — it addresses by symbol. When
// the machine exposes that memory as an ADS array symbol (sibling of the alarm
// array, e.g. "GVL_PLC.aData"), a numeric position N maps to `<symbol>[N + base]`.
// Symbol-name addresses (containing a dot or letters) pass through untouched, so
// native TwinCAT widgets are unaffected.
//   machine.ads_data = { symbol: "GVL_PLC.aData", base: 0 }
function resolveAddress(machine, address) {
  const a = String(address ?? '').trim();
  if (/^\d+$/.test(a)) {
    const d = machine.ads_data || {};
    if (d.symbol) return `${d.symbol}[${Number(a) + (Number(d.base) || 0)}]`;
  }
  return a;
}

async function readValue(machine, { address, dataType }) {
  const client = await getClient(machine);
  const res = await client.readSymbol(resolveAddress(machine, address));
  return res?.value; // ads-client already returns typed values (bool/number/string)
}

async function writeValue(machine, { address, value, dataType }) {
  const client = await getClient(machine);
  await client.writeSymbol(resolveAddress(machine, address), coerceForWrite(value, dataType));
  return true;
}

// Built-in / system symbol groups exposed by every TwinCAT runtime — hidden from
// the editor's variable browser so the picker shows the PLC program's own symbols.
const SYMBOL_NOISE = /^(TwinCAT_SystemInfoVarList|TcHydraulic|Constants|Global_Version|TwinCAT_)/i;

// List the PLC's symbol table (name, type, comment, size) for the widget editor's
// variable browser. TwinCAT exposes every declared symbol over ADS, so — unlike
// the offset-based Power PLC — an ADS machine can be browsed for its variables.
async function listSymbols(machine) {
  const client = await getClient(machine);
  const table = await client.readAndCacheSymbols(); // { lowerName: { name, type, comment, size, ... } }
  const out = [];
  for (const k of Object.keys(table)) {
    const s = table[k];
    if (!s?.name || SYMBOL_NOISE.test(s.name)) continue;
    out.push({
      name: s.name,
      type: s.type || '',
      comment: s.comment || '',
      size: s.size ?? 0,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// Read an array-of-struct (or a single struct) symbol and infer its scalar field
// names + a best-effort widget dataType from the first element. Powers the grid
// editor's "Detect fields" button so an ADS struct array can be mapped to columns
// without the operator typing each member by hand. Nested structs/arrays are
// skipped (only directly-displayable scalar members become columns).
async function listStructFields(machine, symbol) {
  const client = await getClient(machine);
  const res = await client.readSymbol(symbol);
  const v = res?.value;
  const sample = Array.isArray(v) ? v[0] : v;
  if (!sample || typeof sample !== 'object') return [];
  const guess = (x) => (typeof x === 'boolean' ? 'BOOL'
    : typeof x === 'string' ? 'STRING'
    : Number.isInteger(x) ? 'INT32' : 'REAL');
  return Object.keys(sample)
    .filter((k) => sample[k] === null || typeof sample[k] !== 'object') // skip nested struct/array members
    .map((k) => ({ field: k, dataType: guess(sample[k]) }));
}

// Read an array symbol as a flat block of numbers (used by batch counters when
// the PLC exposes the counters as a single array symbol via `ads.counters_symbol`).
async function readBlock(machine, { count }) {
  const sym = machine.ads?.counters_symbol;
  if (!sym) return null; // no array symbol configured → caller falls back
  const client = await getClient(machine);
  const res = await client.readSymbol(sym);
  const arr = Array.isArray(res?.value) ? res.value.map(Number) : [];
  return count ? arr.slice(0, count) : arr;
}

// Write a flat block of numbers back into the counters array symbol
// (`ads.counters_symbol`). ADS writes a whole typed symbol, so this is a
// read-modify-write: read the current array, overwrite the first `words.length`
// elements (skipping any index in `skip`, e.g. PARTS_FOR_BOX), and write the
// whole array back — preserving every element outside the counter block. Used by
// the batch service to zero / restore counters on the real PLC.
async function writeBlock(machine, { words, skip = [] }) {
  const sym = machine.ads?.counters_symbol;
  if (!sym) return false; // no array symbol configured → caller treats as no-op
  const client = await getClient(machine);
  const res = await client.readSymbol(sym);
  const arr = Array.isArray(res?.value) ? res.value.slice() : null;
  if (!arr) return false;
  const skipSet = new Set(skip);
  for (let i = 0; i < words.length && i < arr.length; i++) {
    if (skipSet.has(i)) continue;          // preserve (e.g. parts-per-box)
    arr[i] = words[i] >>> 0;
  }
  await client.writeSymbol(sym, arr);
  return true;
}

async function disconnectAll() {
  for (const [k, c] of clients) {
    const client = c && typeof c.disconnect === 'function' ? c : null;
    if (client) { try { await client.disconnect(); } catch { /* ignore */ } }
    clients.delete(k);
  }
}

module.exports = { readValue, writeValue, readBlock, writeBlock, listSymbols, listStructFields, disconnectAll, isAvailable: () => !!AdsClient };
