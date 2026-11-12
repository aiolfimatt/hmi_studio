# Test bench — OPC UA test server

A self-contained OPC UA server so you can run the **whole stack end-to-end without
a real PLC**. Its variables are declared in [`variables.json`](variables.json):
each one gets a **start value**, and from then on **only clients (HMI Studio)
change it** — the server never simulates or overwrites values.

SecurityPolicy `None`, anonymous. **Test tool only — never expose it on a real network.**

## Variables

```json
{
  "variables": [
    { "path": "GVL_PLC.PLC_MEM", "type": "Int32",   "length": 256, "value": 0 },
    { "path": "MAIN.fSpeed",     "type": "Double",  "value": 1500 },
    { "path": "Line1.St2.fTemp", "type": "Float",   "value": 21.5 }
  ]
}
```

| Field | Meaning |
|---|---|
| `path` | Node is `ns=1;s=<path>`. Dots create parent objects (`Line1` → `St2` → `fTemp`). |
| `type` | `Boolean` `SByte` `Byte` `Int16` `UInt16` `Int32` `UInt32` `Int64` `UInt64` `Float` `Double` `String` |
| `length` | Optional. Makes a 1-D array of that size. |
| `value` | Start value. For arrays: one value (fills every element) or a list (padded with 0/false/""). |

**Add / remove variables live:** edit `variables.json` and save. The running server
adds new variables, deletes removed ones, and recreates any whose `type`/`length`
changed. Untouched variables keep their current (HMI-written) value; changing only
a `value` does not reset a running variable — restart the server to reset all
variables to their start values. An invalid file is reported in the log and
ignored (the current variables stay).

Writes are lenient: HMI Studio writes with the widget's data type, so e.g. a
`Double` written to an `Int32` variable is rounded instead of rejected. Each write
is logged (`write  MAIN.fSpeed = 42.5`, `write  GVL_PLC.PLC_MEM[10]=123`).

The default file provides the nodes the sample machine configs expect:

| NodeId | Type | Purpose |
|---|---|---|
| `ns=1;s=GVL_PLC.PLC_MEM` | `Int32[256]` | memory block; numeric widget positions map here via `opcua.nodes_data` |
| `ns=1;s=GVL_PLC.aAlarms` | `Boolean[64]` | alarm array read by the alarm watcher — set a bit from the HMI to raise an alarm |
| `ns=1;s=MAIN.fSpeed` | `Double` | demo analog |
| `ns=1;s=MAIN.bRunning` | `Boolean` | demo flag |
| `ns=1;s=MAIN.nCounter` | `Int32` | demo integer |
| `ns=1;s=MAIN.sRecipe` | `String` | demo string |
| `ns=1;s=GRID.aName` | `String[10]` | grid demo — station names |
| `ns=1;s=GRID.aTemp` | `Double[10]` | grid demo — temperatures |
| `ns=1;s=GRID.aCount` | `Int32[10]` | grid demo — counters |
| `ns=1;s=GRID.aEnabled` | `Boolean[10]` | grid demo — flags |

**Grid widget:** add a grid with *Rows* = 10 and one column per array, each column's
address set to the array node (e.g. `ns=1;s=GRID.aTemp`, data type `LREAL`). The
grid reads `<address>[row]` for every cell.

Use another file with `VARS_FILE=path/to/file.json`.

---

## Option A — Docker (one command)

From the repo root:

```bash
docker compose -f docker-compose.test-bench.yml up --build
```

This starts the OPC UA server **and** HMI Studio wired to it (via
`test-bench/machines.docker.json`). `test-bench/variables.json` is mounted into the
server container, so editing it on the host updates the variables live. Open
<http://localhost:3100>, log in as `admin` / `admin123`, and build a page bound to
e.g. `ns=1;s=MAIN.fSpeed` or a numeric position like `10`.

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

4. Open the dev UI (`http://localhost:3101`), create a page, add an input widget
   and a value widget bound to `ns=1;s=MAIN.fSpeed` (or numeric position `10`).
   Write a value from the input and the display follows. To test alarms, write
   `true` to an element of `ns=1;s=GVL_PLC.aAlarms` and watch the **Active Alarms** view.

> To go back to your normal machine, restore your own `data/machines.json`
> (it was overwritten in step 2) and restart the backend.

## Verifying the connection

A quick connectivity check without the UI:

```bash
cd backend && node -e "const o=require('./src/plc/opcua'); o.readValue({opcua:{endpoint:'opc.tcp://127.0.0.1:4840',security_mode:'None',security_policy:'None'}},{address:'ns=1;s=MAIN.fSpeed'}).then(v=>{console.log('fSpeed=',v);process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"
```
