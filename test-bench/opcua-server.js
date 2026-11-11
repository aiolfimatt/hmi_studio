/**
 * HMI Studio — OPC UA test server (test bench).
 *
 * A tiny, self-contained OPC UA server that exposes the nodes HMI Studio expects,
 * so the whole stack can be exercised end-to-end without a real PLC:
 *
 *   ns=1;s=GVL_PLC.PLC_MEM   Int32[256]   — a live memory block (numeric widget
 *                                            positions map here via opcua.nodes_data)
 *   ns=1;s=GVL_PLC.aAlarms   Boolean[64]  — a BOOL alarm array (alarmWatcher reads it;
 *                                            a couple of bits toggle on a cycle)
 *   ns=1;s=MAIN.fSpeed       Double       — a scalar sine wave (demo analog)
 *   ns=1;s=MAIN.bRunning     Boolean      — a scalar toggling flag
 *
 * Values update every 500 ms so the HMI shows live movement. Anonymous access,
 * SecurityPolicy=None — this is a TEST tool, never expose it to a real network.
 *
 * Run:  node opcua-server.js            (listens on opc.tcp://0.0.0.0:4840)
 *       PORT=4855 node opcua-server.js  (override the port)
 *
 * Pair it with config/machines.testbench.opcua.json (see test-bench/README.md).
 */
'use strict';

const {
  OPCUAServer, Variant, DataType, VariantArrayType,
} = require('node-opcua');

const PORT = Number(process.env.PORT) || 4840;
const MEM_LEN = 256;
const ALARM_LEN = 64;

// Backing stores the bound variables read from; a timer mutates them in place.
const mem = new Array(MEM_LEN).fill(0);
const alarms = new Array(ALARM_LEN).fill(false);
let speed = 0;
let running = false;

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
  const objects = addressSpace.rootFolder.objects;

  const gvl = namespace.addObject({ organizedBy: objects, browseName: 'GVL_PLC', nodeId: 's=GVL_PLC' });
  const main = namespace.addObject({ organizedBy: objects, browseName: 'MAIN', nodeId: 's=MAIN' });

  namespace.addVariable({
    componentOf: gvl, nodeId: 's=GVL_PLC.PLC_MEM', browseName: 'PLC_MEM',
    dataType: 'Int32', valueRank: 1, arrayDimensions: [MEM_LEN],
    value: { get: () => new Variant({ dataType: DataType.Int32, arrayType: VariantArrayType.Array, value: mem }) },
  });

  namespace.addVariable({
    componentOf: gvl, nodeId: 's=GVL_PLC.aAlarms', browseName: 'aAlarms',
    dataType: 'Boolean', valueRank: 1, arrayDimensions: [ALARM_LEN],
    value: { get: () => new Variant({ dataType: DataType.Boolean, arrayType: VariantArrayType.Array, value: alarms }) },
  });

  namespace.addVariable({
    componentOf: main, nodeId: 's=MAIN.fSpeed', browseName: 'fSpeed',
    dataType: 'Double',
    value: { get: () => new Variant({ dataType: DataType.Double, value: speed }) },
  });

  namespace.addVariable({
    componentOf: main, nodeId: 's=MAIN.bRunning', browseName: 'bRunning',
    dataType: 'Boolean',
    value: { get: () => new Variant({ dataType: DataType.Boolean, value: running }) },
  });

  // Live simulation — deterministic signals so the HMI shows movement.
  let tick = 0;
  setInterval(() => {
    tick += 1;
    const t = tick * 0.5;                                   // seconds
    for (let i = 0; i < MEM_LEN; i++) {
      mem[i] = Math.round(100 + 50 * Math.sin(t * 0.3 + i));
    }
    speed = Number((1500 + 500 * Math.sin(t * 0.5)).toFixed(1));
    running = Math.floor(t / 4) % 2 === 0;

    // Cycle a couple of alarm bits on/off so the alarm watcher has edges to detect.
    const phase = Math.floor(t / 5) % 4;
    alarms.fill(false);
    if (phase === 1 || phase === 2) alarms[0] = true;        // alarm code 1
    if (phase === 2 || phase === 3) alarms[4] = true;        // alarm code 5
  }, 500);

  await server.start();
  const endpoint = `opc.tcp://localhost:${PORT}`;
  console.log(`[opcua-test] server listening at ${endpoint}  (SecurityPolicy=None, anonymous)`);
  console.log('[opcua-test] nodes:');
  console.log('[opcua-test]   ns=1;s=GVL_PLC.PLC_MEM   Int32[256]');
  console.log('[opcua-test]   ns=1;s=GVL_PLC.aAlarms   Boolean[64]');
  console.log('[opcua-test]   ns=1;s=MAIN.fSpeed       Double');
  console.log('[opcua-test]   ns=1;s=MAIN.bRunning     Boolean');

  const stop = async () => {
    console.log('\n[opcua-test] shutting down…');
    await server.shutdown(500);
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error('[opcua-test] failed to start:', err);
  process.exit(1);
});
