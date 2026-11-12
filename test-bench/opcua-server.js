/**
 * HMI Studio — OPC UA test server (test bench).
 *
 * A tiny, self-contained OPC UA server whose variables are declared in a JSON file
 * (default: ./variables.json), so the whole stack can be exercised end-to-end
 * without a real PLC.
 *
 *   { "variables": [
 *       { "path": "MAIN.fSpeed",     "type": "Double",  "value": 1500 },
 *       { "path": "GVL_PLC.PLC_MEM", "type": "Int32",   "length": 256, "value": 0 }
 *   ] }
 *
 * - Each entry becomes the node ns=1;s=<path>; the dotted prefix creates parent
 *   objects (GVL_PLC, MAIN, Line1.Station2, …).
 * - "value" is the START value only. The server never changes it afterwards:
 *   variables are read/write, and only clients (HMI Studio) modify them.
 * - The file is watched: add, remove or retype a variable and save — the change is
 *   applied live. Variables left untouched keep their current (client-written)
 *   value; a changed start value alone does not reset a running variable
 *   (restart the server to reset everything).
 *
 * Anonymous access, SecurityPolicy=None — this is a TEST tool, never expose it on a
 * real network.
 *
 * Run:  node opcua-server.js                       (opc.tcp://0.0.0.0:4840)
 *       PORT=4855 node opcua-server.js             (override the port)
 *       VARS_FILE=my-vars.json node opcua-server.js (use another variables file)
 *
 * Pair it with config/machines.testbench.opcua.json (see test-bench/README.md).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  OPCUAServer, Variant, DataType, VariantArrayType, AccessLevelFlag,
  coerceInt64, coerceUInt64,
} = require('node-opcua');

const PORT = Number(process.env.PORT) || 4840;
const VARS_FILE = path.resolve(process.env.VARS_FILE || path.join(__dirname, 'variables.json'));
const RW = AccessLevelFlag.CurrentRead | AccessLevelFlag.CurrentWrite;
const log = (...a) => console.log('[opcua-test]', ...a);

// ── Types ────────────────────────────────────────────────────────────────────

const INT_RANGES = {
  SByte: [-128, 127], Byte: [0, 255],
  Int16: [-32768, 32767], UInt16: [0, 65535],
  Int32: [-2147483648, 2147483647], UInt32: [0, 4294967295],
};
// node-opcua stores numeric arrays as typed arrays; giving it plain arrays only
// triggers a coercion warning.
const TYPED = {
  SByte: Int8Array, Byte: Uint8Array, Int16: Int16Array, UInt16: Uint16Array,
  Int32: Int32Array, UInt32: Uint32Array, Float: Float32Array, Double: Float64Array,
};
const TYPES = ['Boolean', ...Object.keys(INT_RANGES), 'Int64', 'UInt64', 'Float', 'Double', 'String'];

function toBool(v) {
  if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true';
  return Boolean(v);
}

// Coerce any JS value to the declared OPC UA type. Lenient on purpose: HMI Studio
// writes with the widget's data type (often Double), so a Double written to an
// Int32 node is converted instead of rejected with BadTypeMismatch.
function coerce(type, v) {
  if (type === 'Boolean') return toBool(v);
  if (type === 'String') return v == null ? '' : String(v);
  if (type === 'Int64') return coerceInt64(Array.isArray(v) ? v : Math.trunc(Number(v) || 0));
  if (type === 'UInt64') return coerceUInt64(Array.isArray(v) ? v : Math.trunc(Number(v) || 0));
  const n = typeof v === 'boolean' ? Number(v) : Number(v);
  const num = Number.isFinite(n) ? n : 0;
  const range = INT_RANGES[type];
  if (range) return Math.min(range[1], Math.max(range[0], Math.round(num)));
  return num; // Float / Double
}

function defaultFor(type) {
  return coerce(type, type === 'String' ? '' : 0);
}

function makeVariant(def, value) {
  const dataType = DataType[def.type];
  if (def.length == null) return new Variant({ dataType, value: coerce(def.type, value) });
  const src = Array.isArray(value) ? value : null;
  const arr = Array.from({ length: def.length }, (_, i) =>
    coerce(def.type, src ? (i < src.length ? src[i] : defaultFor(def.type)) : value));
  const Typed = TYPED[def.type];
  return new Variant({ dataType, arrayType: VariantArrayType.Array, value: Typed ? Typed.from(arr) : arr });
}

// ── Variables file ───────────────────────────────────────────────────────────

// Parse + validate the file. Returns Map<path, def> or throws with a readable message.
function loadDefs() {
  const raw = JSON.parse(fs.readFileSync(VARS_FILE, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.variables;
  if (!Array.isArray(list)) throw new Error('expected { "variables": [ ... ] }');
  const defs = new Map();
  list.forEach((v, i) => {
    const where = `variables[${i}]`;
    const p = typeof v?.path === 'string' ? v.path.trim() : '';
    if (!p || p.startsWith('.') || p.endsWith('.') || p.includes('..')) throw new Error(`${where}: invalid "path"`);
    if (!TYPES.includes(v.type)) throw new Error(`${where} (${p}): "type" must be one of ${TYPES.join(', ')}`);
    if (v.length != null && !(Number.isInteger(v.length) && v.length > 0)) throw new Error(`${where} (${p}): "length" must be a positive integer`);
    if (defs.has(p)) throw new Error(`${where}: duplicate path "${p}"`);
    defs.set(p, { path: p, type: v.type, length: v.length ?? null, value: v.value ?? defaultFor(v.type) });
  });
  // A path cannot be both a variable and a parent object of another variable.
  for (const p of defs.keys()) {
    const parts = p.split('.');
    for (let k = 1; k < parts.length; k++) {
      const prefix = parts.slice(0, k).join('.');
      if (defs.has(prefix)) throw new Error(`"${prefix}" is a variable but also the parent of "${p}"`);
    }
  }
  return defs;
}

const sameShape = (a, b) => a.type === b.type && a.length === b.length;
const describe = (d) => `${d.type}${d.length != null ? `[${d.length}]` : ''}`;

// ── Server ───────────────────────────────────────────────────────────────────

async function main() {
  const server = new OPCUAServer({
    port: PORT,
    resourcePath: '',               // → endpoint opc.tcp://host:PORT (no sub-path)
    buildInfo: {
      productName: 'HMIStudioTestBench',
      buildNumber: '1',
      buildDate: new Date(0),       // fixed so restarts are deterministic
    },
  });
  await server.initialize();

  const addressSpace = server.engine.addressSpace;
  const namespace = addressSpace.getOwnNamespace();         // own namespace → ns=1
  const objectsFolder = addressSpace.rootFolder.objects;

  const folders = new Map();   // object path → UAObject
  const vars = new Map();      // variable path → { def, node }

  function ensureFolder(objPath) {
    if (folders.has(objPath)) return folders.get(objPath);
    const cut = objPath.lastIndexOf('.');
    const parent = cut < 0 ? objectsFolder : ensureFolder(objPath.slice(0, cut));
    const obj = namespace.addObject({
      ...(cut < 0 ? { organizedBy: parent } : { componentOf: parent }),
      browseName: objPath.slice(cut + 1),
      nodeId: `s=${objPath}`,
    });
    folders.set(objPath, obj);
    return obj;
  }

  function addVar(def) {
    const cut = def.path.lastIndexOf('.');
    const parent = cut < 0 ? objectsFolder : ensureFolder(def.path.slice(0, cut));
    const node = namespace.addVariable({
      ...(cut < 0 ? { organizedBy: parent } : { componentOf: parent }),
      nodeId: `s=${def.path}`,
      browseName: def.path.slice(cut + 1),
      dataType: def.type,
      valueRank: def.length != null ? 1 : -1,
      ...(def.length != null ? { arrayDimensions: [def.length] } : {}),
      accessLevel: RW,
      userAccessLevel: RW,
      minimumSamplingInterval: 100,
    });
    node.setValueFromSource(makeVariant(def, def.value));

    // Coerce incoming writes to the declared type (and keep array length fixed),
    // then let node-opcua apply them — including indexRange (single-element) writes.
    const origWrite = node.writeValue;
    node.writeValue = function patchedWrite(context, dataValue, ...rest) {
      const v = dataValue && dataValue.value;
      if (v && v.value != null) {
        const isArr = v.arrayType === VariantArrayType.Array;
        dataValue.value = new Variant({
          dataType: DataType[def.type],
          arrayType: isArr ? VariantArrayType.Array : VariantArrayType.Scalar,
          value: isArr ? Array.from(v.value, (x) => coerce(def.type, x)) : coerce(def.type, v.value),
        });
      }
      return origWrite.call(this, context, dataValue, ...rest);
    };
    let last = def.length != null ? Array.from(node.readValue().value.value) : null;
    node.on('value_changed', (dv) => {
      const val = dv.value.value;
      if (last == null) { log(`write  ${def.path} = ${JSON.stringify(val)}`); return; }
      const now = Array.from(val);
      const changed = now.map((x, i) => (x !== last[i] ? `[${i}]=${x}` : null)).filter(Boolean);
      last = now;
      if (changed.length) log(`write  ${def.path}${changed.slice(0, 10).join(' ')}${changed.length > 10 ? ` …(+${changed.length - 10})` : ''}`);
    });

    vars.set(def.path, { def, node });
  }

  function removeVar(p) {
    const entry = vars.get(p);
    if (!entry) return;
    namespace.deleteNode(entry.node);
    vars.delete(p);
  }

  // Drop parent objects that no longer contain any variable (deepest first).
  function pruneFolders() {
    const used = new Set();
    for (const p of vars.keys()) {
      const parts = p.split('.');
      for (let k = 1; k < parts.length; k++) used.add(parts.slice(0, k).join('.'));
    }
    [...folders.keys()].sort((a, b) => b.length - a.length).forEach((f) => {
      if (used.has(f)) return;
      namespace.deleteNode(folders.get(f));
      folders.delete(f);
    });
  }

  // Bring the address space in line with the file. Unchanged variables keep their value.
  function sync(defs) {
    const added = [], removed = [], retyped = [];
    for (const [p, { def }] of vars) {
      const next = defs.get(p);
      if (!next) { removeVar(p); removed.push(p); }
      else if (!sameShape(def, next)) { removeVar(p); addVar(next); retyped.push(`${p} → ${describe(next)}`); }
      else vars.get(p).def.value = next.value;        // remember new start value (used on restart)
    }
    for (const [p, def] of defs) {
      if (!vars.has(p)) { addVar(def); added.push(`${p} ${describe(def)}`); }
    }
    pruneFolders();
    return { added, removed, retyped };
  }

  sync(loadDefs());

  await server.start();
  log(`server listening at opc.tcp://localhost:${PORT}  (SecurityPolicy=None, anonymous)`);
  log(`variables from ${VARS_FILE}  (edit + save to add/remove; values change only via client writes)`);
  for (const { def } of vars.values()) log(`  ns=1;s=${def.path.padEnd(28)} ${describe(def)}`);

  // Hot reload. watchFile (stat polling) survives editors that replace the file
  // and works on Docker bind mounts, where fs.watch events are unreliable.
  fs.watchFile(VARS_FILE, { interval: 1000 }, (cur, prev) => {
    if (cur.mtimeMs === prev.mtimeMs && cur.size === prev.size) return;
    let defs;
    try {
      defs = loadDefs();
    } catch (err) {
      log(`reload skipped — ${path.basename(VARS_FILE)}: ${err.message} (keeping current variables)`);
      return;
    }
    const { added, removed, retyped } = sync(defs);
    if (!added.length && !removed.length && !retyped.length) return;
    added.forEach((x) => log(`  + ${x}`));
    removed.forEach((x) => log(`  - ${x}`));
    retyped.forEach((x) => log(`  ~ ${x}`));
  });

  const stop = async () => {
    log('shutting down…');
    fs.unwatchFile(VARS_FILE);
    await server.shutdown(500);
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error('[opcua-test] failed to start:', err.message || err);
  process.exit(1);
});
