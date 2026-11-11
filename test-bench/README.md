# Test bench — OPC UA test server

A self-contained OPC UA server that exposes the nodes HMI Studio expects, so you
can run the **whole stack end-to-end without a real PLC**. It serves a live memory
block, a BOOL alarm array (with toggling bits), and a couple of scalars.

| NodeId | Type | Purpose |
|---|---|---|
| `ns=1;s=GVL_PLC.PLC_MEM` | `Int32[256]` | memory block; numeric widget positions map here via `opcua.nodes_data` |
| `ns=1;s=GVL_PLC.aAlarms` | `Boolean[64]` | alarm array read by the alarm watcher (bits 0 & 4 cycle) |
| `ns=1;s=MAIN.fSpeed` | `Double` | demo analog (sine) |
| `ns=1;s=MAIN.bRunning` | `Boolean` | demo flag (toggles) |

SecurityPolicy `None`, anonymous. **Test tool only — never expose it on a real network.**

---

## Option A — Docker (one command)

From the repo root:

```bash
docker compose -f docker-compose.test-bench.yml up --build
```

This starts the OPC UA server **and** HMI Studio wired to it (via
`test-bench/machines.docker.json`). Open <http://localhost:3100>, log in as
`admin` / `admin123`, and build a page bound to e.g. `ns=1;s=MAIN.fSpeed` or a
numeric position like `10`.

## Option B — Local (Node 20+)

1. **Start the OPC UA test server:**
   ```bash
   cd test-bench
   npm install
   npm start                 # → opc.tcp://127.0.0.1:4840
   ```

2. **Point the backend at it** (in another terminal, from the repo root):
   ```bash
   cp config/machines.testbench.opcua.json data/machines.json
   cd backend && npm install && node index.js
   ```

3. **Start the frontend** (third terminal):
   ```bash
   cd frontend && npm install && npm run dev      # → http://localhost:3101
   ```

4. Open the dev UI (`http://localhost:3101`), create a page, add a value widget,
   and bind it to `ns=1;s=MAIN.fSpeed` (or numeric position `10`). You should see
   it move. Enable the **Active Alarms** view to watch alarms 1 and 5 cycle.

> To go back to your normal machine, restore your own `data/machines.json`
> (it was overwritten in step 2) and restart the backend.

## Verifying the connection

A quick connectivity check without the UI:

```bash
cd backend && node -e "const o=require('./src/plc/opcua'); o.readValue({opcua:{endpoint:'opc.tcp://127.0.0.1:4840',security_mode:'None',security_policy:'None'}},{address:'ns=1;s=MAIN.fSpeed'}).then(v=>{console.log('fSpeed=',v);process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"
```
