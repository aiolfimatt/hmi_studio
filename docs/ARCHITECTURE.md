# Architecture

HMI Studio is a single-process Node application that serves a React single-page app
and an API/WebSocket backend, talking to one PLC via a pluggable driver.

## Components

```
┌─────────────────────────────────────────────────────────────┐
│ Browser                                                      │
│   /edit     Designer SPA  (build pages, bind variables)      │
│   /monitor  Runtime SPA   (operator panel, live values)      │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTP (REST)  +  WebSocket (Socket.IO)
┌───────────────▼─────────────────────────────────────────────┐
│ Node backend (Express)                                       │
│   routes/      auth, pages, plc, alarms, project, system, …  │
│   scanner.js   polls machine variables, pushes page deltas   │
│   services/    alarmWatcher, eventLog (audit), features,     │
│                groups/access, editorLock, clientLimit        │
│   store.js     JSON file store  (data/*.json)                │
│   plc/         ads.js · opcua.js · simulator.js              │
└───────────────┬─────────────────────────────────────────────┘
                │ ADS / OPC UA / (mock)
         ┌──────▼──────┐
         │     PLC     │
         └─────────────┘
```

## Data flow (runtime)

1. The operator SPA opens a Socket.IO connection and emits `subscribe_page`.
2. `scanner.js` loads that page's widget definitions, collects every bound variable,
   and reads them **concurrently** through the machine's driver.
3. On each scan tick it broadcasts **only changed keys** (`plc_values` deltas) to the
   page's room; new subscribers get a full snapshot on subscribe.
4. Writes go through `POST /api/plc/write`, gated by the widget's access group, and
   are recorded in the audit log.

## PLC drivers

Selected per machine by `protocol` (`backend/src/scanner.js` dispatches):

| Protocol | Driver | Addressing |
|---|---|---|
| `ads` | `plc/ads.js` (Beckhoff TwinCAT, `ads-client`) | symbol names (`MAIN.fSpeed`) or numeric positions via `ads_data` |
| `opcua` | `plc/opcua.js` (`node-opcua`) | NodeIds (`ns=4;s=…`) or numeric positions via `nodes_data` |
| `mock` | inline synthetic generator | any |
| `sim` | `plc/simulator.js` (global `simulation` switch) | any — deterministic live signals |

Drivers expose a common surface (`readValue`/`writeValue`/`readBlock`/`writeBlock`,
plus `listSymbols`/browse for the editor). Adding a protocol = add a driver module
and a branch in the scanner's dispatch.

## Storage

A tiny JSON file store (`backend/src/store.js`) — one file per collection under
`data/`, written atomically (temp + rename). No external database.

| Collection | File |
|---|---|
| pages, recipes, alarm definitions/lists, widget library | `data/*.json` |
| users, groups | `data/users.json`, `data/groups.json` |
| **machines** (PLC config) | `data/machines.json` |
| app settings | `data/app_settings.json` |
| audit trail | `data/audit_log.jsonl` (append-only) |

The store seeds a default admin, the standard access groups, and a mock machine on
first run.

## Configuration split

- **`config/conf.json`** — per-installation infrastructure: `jwt_secret`, host/ports,
  logging, `security`, `ldap_gateway`, `features`, global `simulation`, `cors_origin`.
  Read once at startup.
- **`data/machines.json`** — the machine/PLC definition. Part of the **project**.

This separation keeps secrets/host-specifics out of exported projects.

## Project model (`.hmiproj`)

A project bundle (`routes/project.js`) is a portable snapshot of the working set:
pages, alarm definitions/lists, recipes, widget library, groups, settings, the asset
**manifest** (names only — bytes live in `data/assets/`), and the **machine config**.
It deliberately excludes user accounts and infra. `POST /api/project/load` replaces
the live set from a bundle; the machine change takes effect on the next backend
restart.

## Access control

Named **groups** with a capability inheritance DAG (`services/groups.js`). A login
snapshots the group's capability closure into the JWT; gating re-resolves against the
live groups as defence-in-depth. Objects (pages, widgets) carry an `editGroup`; a
caller may act iff that group is within their closure.

## Build & packaging

- **Frontend:** `vite build` → `frontend/dist` (static SPA served by the backend in
  production).
- **Backend (portable):** `backend/build/bundle.js` (esbuild) packs `index.js` + all
  of `src/` + production deps into a single `backend/server.js`, so the Windows
  portable package ships one file plus `node.exe`. The Docker image instead runs the
  unbundled backend with `node_modules`.
