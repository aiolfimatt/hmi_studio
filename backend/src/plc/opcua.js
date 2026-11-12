/**
 * OPC UA transport (protocol "opcua") — reads/writes PLC variables by NodeId via
 * the `node-opcua` library. A widget's plcAddress is the target NodeId, e.g.
 * "ns=4;s=MAIN.fSpeed", "ns=2;i=1001". A bare name ("MAIN.fSpeed") is resolved
 * against the machine's default namespace (opcua.namespace) as "ns=<n>;s=<name>".
 *
 * Connection settings come from the machine's `opcua` config block:
 *
 *   "protocol": "opcua",
 *   "opcua": {
 *     "endpoint": "opc.tcp://192.168.1.10:4840", // server endpoint URL
 *     "security_mode": "None",       // None | Sign | SignAndEncrypt
 *     "security_policy": "None",     // None | Basic256Sha256 | Basic256 | ...
 *     "username": "",                 // optional — omit/empty for anonymous
 *     "password": "",
 *     "timeout_ms": 5000,
 *     "namespace": 4,                 // default ns for bare symbolic addresses
 *     "counters_nodeid": "ns=4;s=Counters",  // array node for batch counter block
 *     "nodes_data": { "nodeid": "ns=4;s=DataArray", "base": 0 }, // legacy numeric pos
 *     "browse_root": "ObjectsFolder", // variable-browser start node
 *     "browse_depth": 8, "browse_max": 5000,
 *     "browse_ns0": false             // include namespace-0 (server-internal) nodes
 *   }
 *
 * Mirrors plc/ads.js so the scanner can dispatch to either by `protocol`. Failures
 * never throw random data: a read that can't be served returns null (widget shows
 * no value). Connect attempts are rate-limited by a short cooldown so a down server
 * doesn't stall every scan tick.
 */

let OPC = null;
try { OPC = require('node-opcua'); } catch { /* optional dep */ }

// key (endpoint) → { client, session } | pending connect Promise
const clients = new Map();
// key → epoch ms until which we skip reconnect attempts (after a failed connect)
const cooldownUntil = new Map();
const CONNECT_COOLDOWN_MS = 5000;

function key(machine) { return (machine.opcua && (machine.opcua.endpoint || machine.opcua.endpoint_url)) || ''; }

function userIdentity(o) {
  if (o.username) return { type: OPC.UserTokenType.UserName, userName: o.username, password: o.password || '' };
  return undefined; // anonymous
}

function clientOptions(o) {
  const mode = OPC.MessageSecurityMode[o.security_mode] ?? OPC.MessageSecurityMode.None;
  const policy = OPC.SecurityPolicy[o.security_policy] ?? OPC.SecurityPolicy.None;
  return {
    applicationName: 'HMI Studio',
    endpointMustExist: false,
    securityMode: mode,
    securityPolicy: policy,
    requestedSessionTimeout: o.timeout_ms || 5000,
    connectionStrategy: { maxRetry: 1, initialDelay: 1000, maxDelay: 2000 },
  };
}

// Resolve a live, connected session for the machine (connecting once, cached).
async function getSession(machine) {
  if (!OPC) throw new Error('node-opcua not installed');
  const o = machine.opcua || {};
  const endpoint = o.endpoint || o.endpoint_url;
  if (!endpoint) throw new Error(`machine ${machine.id}: no opcua.endpoint configured`);
  const k = key(machine);

  const cached = clients.get(k);
  if (cached) return cached; // {client,session} or in-flight connect promise

  const until = cooldownUntil.get(k) || 0;
  if (Date.now() < until) throw new Error('OPC UA connect cooling down');

  const client = OPC.OPCUAClient.create(clientOptions(o));
  const connecting = (async () => {
    await client.connect(endpoint);
    const session = await client.createSession(userIdentity(o));
    const entry = { client, session };
    clients.set(k, entry); // replace the in-flight promise with the live entry
    return entry;
  })().catch((e) => {
    clients.delete(k);
    cooldownUntil.set(k, Date.now() + CONNECT_COOLDOWN_MS);
    try { client.disconnect().catch(() => {}); } catch { /* ignore */ }
    throw e;
  });
  clients.set(k, connecting);
  return connecting;
}

// ── address → NodeId (+ optional indexRange) ────────────────────────────────────
// A full NodeId ("ns=4;s=…", "i=1001", "s=MAIN.x") passes through untouched. A bare
// symbolic name is prefixed with the default namespace. A purely numeric legacy
// position N maps to element N(+base) of the configured data-array node, mirroring
// ads.js's offset→array-element model for migrated Power-PLC pages.
const NODEID_RE = /^(ns=\d+;)?[isgb]=/i;
const ELEMENT_RE = /^(.*\S)\[(\d+)\]$/;
function toNodeId(machine, a) {
  if (NODEID_RE.test(a)) return a;
  const ns = machine.opcua?.namespace;
  if (ns != null && a) return `ns=${ns};s=${a}`;
  return a;
}
function resolveAddress(machine, address) {
  const a = String(address ?? '').trim();
  if (/^\d+$/.test(a)) {
    const d = machine.opcua?.nodes_data || {};
    if (d.nodeid) return { nodeId: d.nodeid, indexRange: String(Number(a) + (Number(d.base) || 0)) };
  }
  return { nodeId: toNodeId(machine, a) };
}

// Array-element addresses ("<node>[i]") — what the grid ("<col>[row]") and the io
// widget ("<base>[bit]") generate. Some servers expose each element as its own node
// literally named "MAIN.arr[3]" (TwinCAT, S7-1500), others only the array node. So
// the literal NodeId is tried first; if the server answers BadNodeIdUnknown, the
// address is re-read as element i of "<node>" via indexRange. The outcome is cached
// per endpoint+address so each address costs at most one failed round-trip.
const elementMode = new Map(); // `${endpoint}|${address}` → 'literal' | 'range'
function elementFallback(machine, address) {
  const a = String(address ?? '').trim();
  const m = ELEMENT_RE.exec(a);
  if (!m || /^\d+$/.test(a)) return null;
  return { nodeId: toNodeId(machine, m[1]), indexRange: m[2] };
}
function isNodeIdUnknown(statusCode) {
  return !!statusCode && OPC && statusCode.value === OPC.StatusCodes.BadNodeIdUnknown.value;
}
// Run op(target) against the right form of the address, learning which form works.
async function withElementFallback(machine, address, op) {
  const alt = elementFallback(machine, address);
  if (!alt) return (await op(resolveAddress(machine, address))).result;
  const k = `${key(machine)}|${address}`;
  if (elementMode.get(k) === 'range') return (await op(alt)).result;
  const first = await op(resolveAddress(machine, address));
  if (!isNodeIdUnknown(first.statusCode)) { elementMode.set(k, 'literal'); return first.result; }
  elementMode.set(k, 'range');
  return (await op(alt)).result;
}

// A single-element indexRange read returns a 1-element array; widgets want the scalar.
function unwrapSingle(value, indexRange) {
  if (indexRange == null || String(indexRange).includes(':')) return value;
  if ((Array.isArray(value) || ArrayBuffer.isView(value)) && value.length === 1) return value[0];
  return value;
}

// widget dataType → OPC UA DataType for writes.
function opcuaDataType(dataType) {
  switch (String(dataType || '').toUpperCase()) {
    case 'BOOL': return OPC.DataType.Boolean;
    case 'STRING': return OPC.DataType.String;
    case 'INT': case 'INT16': return OPC.DataType.Int16;
    case 'INT32': case 'DINT': return OPC.DataType.Int32;
    case 'REAL': case 'FLOAT': return OPC.DataType.Float;
    case 'LREAL': case 'DOUBLE': return OPC.DataType.Double;
    default: return OPC.DataType.Double;
  }
}

// Coerce a JS value to the shape the node expects on write.
function coerceForWrite(value, dataType) {
  const dt = String(dataType || '').toUpperCase();
  if (dt === 'BOOL') return value === true || value === 1 || value === '1' || value === 'true';
  if (dt === 'STRING') return String(value ?? '');
  const n = Number(value);
  return Number.isNaN(n) ? value : n;
}

function isGood(statusCode) {
  return !statusCode || typeof statusCode.isGood !== 'function' || statusCode.isGood();
}

async function readValue(machine, { address }) {
  const { session } = await getSession(machine);
  return withElementFallback(machine, address, async ({ nodeId, indexRange }) => {
    const toRead = { nodeId, attributeId: OPC.AttributeIds.Value };
    if (indexRange != null) toRead.indexRange = indexRange;
    const dv = await session.read(toRead);
    const statusCode = dv && dv.statusCode;
    if (!dv || !isGood(statusCode)) return { statusCode, result: null };
    return { statusCode, result: dv.value ? unwrapSingle(dv.value.value, indexRange) : null };
  });
}

async function writeValue(machine, { address, value, dataType }) {
  const { session } = await getSession(machine);
  const dt = opcuaDataType(dataType);
  const coerced = coerceForWrite(value, dataType);
  return withElementFallback(machine, address, async ({ nodeId, indexRange }) => {
    // An indexRange write targets a single array element, so the Variant must carry
    // a one-element array; a plain scalar write carries the value directly.
    const variant = indexRange != null
      ? new OPC.Variant({ dataType: dt, arrayType: OPC.VariantArrayType.Array, value: [coerced] })
      : new OPC.Variant({ dataType: dt, value: coerced });
    const toWrite = { nodeId, attributeId: OPC.AttributeIds.Value, value: { value: variant } };
    if (indexRange != null) toWrite.indexRange = indexRange;
    const statusCode = await session.write(toWrite);
    return { statusCode, result: isGood(statusCode) };
  });
}

// Read the batch-counter array node (`opcua.counters_nodeid`) as a flat number[].
async function readBlock(machine, { count }) {
  const node = machine.opcua?.counters_nodeid;
  if (!node) return null; // no array node configured → caller falls back
  const { session } = await getSession(machine);
  const dv = await session.read({ nodeId: node, attributeId: OPC.AttributeIds.Value });
  if (!dv || !isGood(dv.statusCode) || !dv.value) return null;
  const raw = dv.value.value;
  const arr = (Array.isArray(raw) || ArrayBuffer.isView(raw)) ? Array.from(raw, Number) : [];
  return count ? arr.slice(0, count) : arr;
}

// Read-modify-write the whole counter array node, overwriting the first
// `words.length` elements (skipping any index in `skip`) and preserving the rest —
// OPC UA writes a whole array value, so this mirrors ads.writeBlock.
async function writeBlock(machine, { words, skip = [] }) {
  const node = machine.opcua?.counters_nodeid;
  if (!node) return false; // no array node configured → caller treats as no-op
  const { session } = await getSession(machine);
  const dv = await session.read({ nodeId: node, attributeId: OPC.AttributeIds.Value });
  if (!dv || !isGood(dv.statusCode) || !dv.value) return false;
  const raw = dv.value.value;
  if (!(Array.isArray(raw) || ArrayBuffer.isView(raw))) return false;
  const arr = Array.from(raw, Number);
  const skipSet = new Set(skip);
  for (let i = 0; i < words.length && i < arr.length; i++) {
    if (skipSet.has(i)) continue;          // preserve (e.g. parts-per-box)
    arr[i] = words[i] >>> 0;
  }
  const variant = new OPC.Variant({ dataType: dv.value.dataType, arrayType: OPC.VariantArrayType.Array, value: arr });
  const status = await session.write({ nodeId: node, attributeId: OPC.AttributeIds.Value, value: { value: variant } });
  return isGood(status);
}

// Browse the server address space for the widget editor's variable browser. Returns
// the ads.listSymbols shape ({ name, type, comment, size }) so the frontend picker
// works unchanged: `name` is the NodeId (the usable address), `comment` the human
// browse path. Recursion is depth- and count-capped so a large server can't hang
// the editor.
async function listSymbols(machine) {
  const { session } = await getSession(machine);
  const o = machine.opcua || {};
  const root = OPC.resolveNodeId(o.browse_root || 'ObjectsFolder');
  const maxNodes = Number(o.browse_max || 5000);
  const maxDepth = Number(o.browse_depth || 8);
  // Namespace 0 is the OPC UA standard information model (Server diagnostics,
  // aggregate configs, …) — never machine data. Hide it from the tag picker
  // unless explicitly asked for, so real tags aren't buried under Server.*.
  const includeNs0 = !!o.browse_ns0;
  const out = [];
  const seen = new Set();

  async function walk(nodeId, pathPrefix, depth) {
    if (out.length >= maxNodes || depth > maxDepth) return;
    let result;
    try { result = await session.browse(nodeId); } catch { return; }
    for (const ref of result.references || []) {
      if (out.length >= maxNodes) return;
      if (!includeNs0 && ref.nodeId.namespace === 0) continue;
      const id = ref.nodeId.toString();
      if (seen.has(id)) continue;
      seen.add(id);
      const name = ref.browseName?.name || ref.displayName?.text || id;
      const full = pathPrefix ? `${pathPrefix}.${name}` : name;
      if (ref.nodeClass === OPC.NodeClass.Variable) {
        out.push({ name: id, type: '', comment: full, size: 0 });
      } else if (ref.nodeClass === OPC.NodeClass.Object) {
        await walk(ref.nodeId, full, depth + 1);
      }
    }
  }
  await walk(root, '', 0);
  out.sort((a, b) => a.comment.localeCompare(b.comment));
  return out;
}

// Read a struct (or array-of-struct) node and infer its scalar field names + a
// best-effort widget dataType from the first element — powers the grid editor's
// "Detect fields" button. Mirrors ads.listStructFields.
async function listStructFields(machine, nodeId) {
  const { session } = await getSession(machine);
  const dv = await session.read({ nodeId: resolveAddress(machine, nodeId).nodeId, attributeId: OPC.AttributeIds.Value });
  const v = dv?.value?.value;
  const sample = Array.isArray(v) ? v[0] : v;
  if (!sample || typeof sample !== 'object') return [];
  const guess = (x) => (typeof x === 'boolean' ? 'BOOL'
    : typeof x === 'string' ? 'STRING'
    : Number.isInteger(x) ? 'INT32' : 'REAL');
  return Object.keys(sample)
    .filter((k) => sample[k] === null || typeof sample[k] !== 'object') // skip nested struct/array members
    .map((k) => ({ field: k, dataType: guess(sample[k]) }));
}

async function disconnectAll() {
  for (const [k, c] of clients) {
    const entry = c && c.client ? c : null; // skip in-flight connect promises
    if (entry) {
      try { if (entry.session) await entry.session.close(); } catch { /* ignore */ }
      try { await entry.client.disconnect(); } catch { /* ignore */ }
    }
    clients.delete(k);
  }
  elementMode.clear(); // the server's address space may differ after a reconnect
}

module.exports = {
  readValue, writeValue, readBlock, writeBlock,
  listSymbols, listStructFields, disconnectAll,
  isAvailable: () => !!OPC,
};
