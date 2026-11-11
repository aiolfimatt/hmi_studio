# HMI Studio — Configuration Guide

Configuration lives in **two** places, split by lifecycle:

| File | Scope | Holds | Travels in a `.hmiproj`? |
|---|---|---|---|
| `config/conf.json` | Per **installation** (deployment infra) | `jwt_secret`, ports/host, `logging`, `security`, `ldap_gateway`, `features`, global `simulation` | **No** |
| `data/machines.json` | Per **project** | the machine(s) the HMI talks to — `protocol`, ADS/OPC-UA endpoint, `ads_data`, `alarms` | **Yes** — part of the project bundle |

So the **machine / PLC config is part of the project**: it's stored in
`data/machines.json` and is exported/imported inside a `.hmiproj` bundle alongside
pages, alarms and recipes. `conf.json` is now **infra only** — it never contains
secrets-free machine definitions and is not shipped inside a project.

> **Format:** strict JSON. No comments, no trailing commas. Validate before
> starting the backend (see [Validate & apply](#validate--apply)).
>
> **When changes take effect:** both files are read **once at backend startup**.
> After editing either (or after **loading a project** that changes the machine),
> **restart the backend** (`node index.js` in `backend/`). The frontend (Vite)
> does **not** need a restart.
>
> **Single machine:** this is a single-machine deployment — only the first entry
> in `data/machines.json` is used.
>
> **No external database.** This build is standalone: project/config state lives
> in `data/` as JSON files and the audit trail is a local file
> (`data/audit_log.jsonl`). There is no PostgreSQL / MES dependency.
>
> **Ready-made machine templates:** `config/machines.example.ads.json` and
> `config/machines.example.opcua.json` — copy one over `data/machines.json` and
> restart to switch protocol.

---

## Table of contents

1. [File shape at a glance](#file-shape-at-a-glance)
2. [Top-level settings](#top-level-settings)
3. [`features` block](#features-block)
4. [`security` block](#security-block)
5. [Machine config](#machine-config--the-important-part)
   - [Common machine fields](#common-machine-fields)
   - [`protocol` values](#protocol-values)
   - [`ads` block (Beckhoff/TwinCAT)](#ads-block-beckhofftwincat)
   - [`opcua` block (OPC UA)](#opcua-block-opc-ua)
   - [`ads_data` block (numeric addresses → ADS array)](#ads_data-block-numeric-addresses--ads-array)
   - [`alarms` block](#alarms-block)
6. [Worked examples](#worked-examples)
7. [Validate & apply](#validate--apply)
8. [Troubleshooting](#troubleshooting)

---

## File shape at a glance

```jsonc
{
  "logging":    { ... },              // diagnostic log file settings
  "jwt_secret": "change_me",          // REQUIRED — token signing key
  "jwt_expiry": "8h",
  "ldap_gateway":{ ... },             // optional LDAP login fallback
  "simulation": false,                // global: force every machine to simulator
  "features":   { ... },              // subsystem on/off switches
  "languages": ["en","it", ...],
  "default_language": "en",
  "backend_host": "0.0.0.0",
  "backend_port": 3100,
  "frontend_port": 3101,
  "max_runtime_clients": 0,           // cap concurrent runtime screens (0 = unlimited)
  "security":   { ... }
}
```

> Machine/PLC config is **not** in `conf.json` — it lives in `data/machines.json`
> (see [Machine config](#machine-config--the-important-part) below).

Every field below lists its **default** — if a field is omitted, the backend
uses that default, so you only need to set what differs.

---

## Top-level settings

| Key | Type | Default | What it does |
|---|---|---|---|
| `jwt_secret` | string | **(none — set it)** | Secret used to sign/verify login tokens. **Change it** from the shipped value in any real deployment. |
| `jwt_expiry` | string | `"8h"` | How long a login stays valid (`"8h"`, `"30m"`, `"7d"`). |
| `simulation` | boolean | `false` | **Global override.** When `true`, *every* machine is driven by the built-in simulator — no PLC is contacted. Great for demos/offline dev. |
| `languages` | string[] | all 7 | Active UI languages, in display order. Valid codes: `it en fr de es pt ru`. |
| `default_language` | string | first in `languages` | Fallback language when a translation is missing. |
| `backend_host` | string | `"0.0.0.0"` | Interface the API binds to. `0.0.0.0` = all interfaces. |
| `backend_port` | number | `3100` | API / Socket.IO port. |
| `frontend_port` | number | `3101` | Informational only (Vite reads its own config). |
| `max_runtime_clients` | number | `0` | Cap on concurrent runtime screens (`0` = unlimited). |
| `logging` | object | see below | Diagnostic log file settings (`enabled`, `dir`, `file`, `level`, `max_size_mb`, `max_files`, `tee_console`). |

### `ldap_gateway` (optional LDAP login fallback)

Optional delegated login against an external **LDAP gateway** service (a separate
HTTP→LDAP bridge, listening on `/login`). Internal accounts are **always checked
first**: a username that has a local account is authenticated locally and never
reaches the gateway. Only a username with *no* local record is forwarded here, and
only when `enabled:true`.

The gateway replies `{ "Success": bool, "Levels": int[] }`. On success the **first
int of `Levels`** is taken as a **group index** and resolved to one of HMI Studio's
groups *by position* — so the gateway's group order must mirror the group order in
`data/groups.json`. With the default `index_base:1`, `Levels[0]=1` → the 1st group
(Operator), `2` → Maintenance, `3` → Installer, … An out-of-range or negative index
denies access. LDAP sessions are ephemeral: no local user row is created
(`id:null`, `source:"ldap"`); capabilities come live from the mapped group.

| Key | Default | Notes |
|---|---|---|
| `enabled` | `false` | Master on/off for the LDAP fallback. |
| `url` | `"http://127.0.0.1:8890/login"` | Gateway `/login` endpoint. |
| `timeout_ms` | `8000` | Request timeout; on timeout/error the login is denied. |
| `index_base` | `1` | Index base of `Levels[0]` → group position. `1` = `Levels[0]=1` is the first group; set `0` for 0-based. |

---

## `features` block

A single top-level block that turns each optional subsystem on or off. It is the
one place to see and flip everything, read through `src/services/features.js`,
which gates each service at startup (and the demand-driven LDAP login fallback).

```json
"features": {
  "alarms": true,
  "event_log": true,
  "ldap": false
}
```

| Key | What it gates | Detailed config lives in |
|---|---|---|
| `alarms` | PLC alarm polling / edge detection. | `machines[].alarms` |
| `event_log` | Local audit trail writer → `data/audit_log.jsonl`. | (no block) |
| `ldap` | LDAP login fallback. | `ldap_gateway` |

**How a switch resolves:**

- **Present** (`"alarms": false`) → authoritative. A `false` here force-disables
  the feature **regardless** of its detailed `enabled` flag — a master kill-switch.
- **Absent** (key omitted, or the whole `features` block omitted) → the backend
  falls back to the feature's own nested flag (e.g. `machines[].alarms.enabled`,
  `ldap_gateway.enabled`). `event_log` defaults **on**.

On startup the backend logs the resolved set, e.g.
`[features] enabled: alarms, event_log` / `[features] disabled: ldap`.

---

## `security` block

| Key | Default | What it does |
|---|---|---|
| `min_password_chars` | `4` | Minimum password length on create / change. |
| `password_lifetime_months` | `0` | Months before a password expires. `0` = never. |
| `max_failed_attempts` | `10` | Failed logins before the account locks. |
| `auto_logout_s` | `0` (never) | Runtime operator inactivity logout, in seconds. `0` (or omitted) = never. (The `/edit` admin session is not affected.) |
| `login_rate_window_s` | `60` | Per-IP rate-limit window for `/api/auth/login` and `/api/auth/change-password`, in seconds. `0` disables rate limiting. |
| `login_rate_max` | `10` | Requests allowed per IP per window before the endpoint answers `429 Too Many Requests`. Behind a reverse proxy all clients share the proxy's IP unless Express `trust proxy` is configured (see `docs/DEPLOYMENT.md`). |

---

## Machine config — the important part

The machine/PLC config lives in **`data/machines.json`** (a project file), not in
`conf.json`. Its shape is a store collection — `{ "nextId": N, "rows": [ … ] }` —
where each row describes one machine and how to reach its PLC. The minimum viable
machine is an `id`, a `name`, and a `protocol`. This is a single-machine
deployment: only the first row is used.

```json
{ "nextId": 2, "rows": [ { "id": 1, "name": "Machine 1", "protocol": "ads", … } ] }
```

It is part of the **project**: it's exported/imported inside a `.hmiproj` bundle
and reset to a default mock machine by **New project**. To change protocol quickly,
copy `config/machines.example.ads.json` or `config/machines.example.opcua.json`
over `data/machines.json` and restart. The field tables below describe one machine
object (a `rows[]` entry).

### Common machine fields

| Key | Type | Default | What it does |
|---|---|---|---|
| `id` | number | — | Unique machine id (primary key). Referenced by pages. |
| `name` | string | — | Display name. |
| `protocol` | string | `"mock"` | How to talk to the PLC — see [protocol values](#protocol-values). |
| `n_bit` | number | `16` | Alarm bit-packing width (bits per alarm word) used when `alarms.bits_per_word` is omitted. |
| `ams_net_id` | string | — | Target PLC **AmsNetId** (ADS), e.g. `"5.98.90.5.1.1"`. |
| `ads_port` | number | `851` | Target ADS port. `851` = TwinCAT 3 PLC runtime, `801` = TC2. |
| `scan_interval_ms` | number | `500` | How often widget variables are polled. |
| `is_active` | boolean | — | If `false`, the machine is **not** scanned / watched. Set inactive machines to `false` to avoid connection noise. |

### `protocol` values

The driver is chosen by `protocol` (case-insensitive):

| Value | Driver | Use when | Address format |
|---|---|---|---|
| `"ads"` | Beckhoff TwinCAT ADS | Modern Beckhoff PLCs | **Symbol name** — `"MAIN.fSpeed"`, `"GVL_PLC.bRunning"` — *or* a numeric position if you set [`ads_data`](#ads_data-block-numeric-addresses--ads-array). |
| `"opcua"` | OPC UA | Any OPC UA server | **NodeId** — `"ns=4;s=MAIN.fSpeed"` — *or* a numeric position via `nodes_data`. |
| `"mock"` | Synthetic generator | Demos / UI work with no PLC | Any — returns random BOOL/INT/REAL. |

> When top-level `simulation:true`, the internal **simulator** overrides every
> machine's protocol regardless of this value.

### `ads` block (Beckhoff/TwinCAT)

Optional sub-object for `protocol:"ads"`. If the backend runs on a Windows host
with TwinCAT installed, you usually only need the top-level `ams_net_id` /
`ads_port` and can omit this whole block. Set it for **direct-to-PLC** routing
(no local TwinCAT router).

| Key | Default | What it does |
|---|---|---|
| `target_ams_net_id` | falls back to `ams_net_id` | Override the target AmsNetId. |
| `target_ads_port` | falls back to `ads_port` (851) | Override the target ADS port. |
| `router_address` | — | PLC's AMS router IP — set for direct mode. |
| `router_tcp_port` | — | AMS router TCP port (usually `48898`). |
| `local_ams_net_id` | — | This host's AmsNetId (must have a matching ADS route on the PLC). |
| `local_ads_port` | — | This host's ADS port. |
| `timeout_ms` | `5000` | ADS request timeout. |
| `auto_reconnect` | `true` | Reconnect automatically on drop. |

> **Direct-mode checklist:** set `router_address` (PLC IP), `router_tcp_port`,
> `local_ams_net_id`, `local_ads_port`, **and** add a matching ADS route on the
> PLC (TwinCAT → Routes) so it accepts this host. Missing route ⇒ connect fails
> with *"Device system manager state read failed"*.

### `opcua` block (OPC UA)

For `protocol:"opcua"`, add an `opcua` sub-object to the machine (see the ready-made
`config/machines.example.opcua.json`).

| Key | Default | What it does |
|---|---|---|
| `endpoint` | — | Server endpoint URL, e.g. `"opc.tcp://192.168.1.10:4840"`. |
| `security_mode` | `"None"` | `None` / `Sign` / `SignAndEncrypt`. |
| `security_policy` | `"None"` | OPC UA security policy. |
| `username` / `password` | `""` | Optional user auth (anonymous when blank). |
| `timeout_ms` | `5000` | Request timeout. |
| `namespace` | — | Default namespace index for bare symbol addresses. |
| `nodes_data` | — | `{ nodeid, base }` — numeric-position → NodeId array mapping (OPC UA equivalent of `ads_data`). |
| `browse_root` / `browse_depth` / `browse_max` | `ObjectsFolder` / `8` / `5000` | Address-space browsing limits for the editor's variable picker. |
| `browse_ns0` | `false` | Include namespace-0 (OPC UA standard `Server.*`) nodes in the variable picker. Off by default — ns=0 is server internals, not machine data. |

### `ads_data` block (numeric addresses → ADS array)

Lets a Beckhoff (`ads`) machine serve **numeric positions**. Pages addressing a
flat `MEM[]` array by number (e.g. a label bound to position `2030`) can't resolve
against a symbol-addressed PLC on their own. This block maps it:

```
numeric position N  →  <symbol>[N + base]
```

| Key | Default | What it does |
|---|---|---|
| `symbol` | — | ADS array symbol holding the memory block, e.g. `"GVL_PLC.PLC_MEM"`. |
| `base` | `0` | Offset added to the position before indexing. |

**Example:** `"ads_data": { "symbol": "GVL_PLC.PLC_MEM", "base": 0 }` makes a
widget at position `2030` read `GVL_PLC.PLC_MEM[2030]`. Full symbol-name
addresses (anything non-numeric, like `MAIN.fSpeed`) pass through untouched, so
native widgets are unaffected. This applies to **both** labels and entries.

### `alarms` block

Alarm polling per machine. Read by the alarm watcher.

| Key | Default | What it does |
|---|---|---|
| `enabled` | `false` | Master on/off for this machine's alarms. |
| `ads_symbol` | — | **ADS:** BOOL-array alarm symbol, e.g. `"GVL_PLC.aAlarms"`. |
| `opcua_nodeid` | — | **OPC UA:** NodeId of the BOOL-array alarm node, e.g. `"ns=4;s=GVL_PLC.aAlarms"`. |
| `word_count` | `32` | Number of words to read. |
| `bits_per_word` | `n_bit` or `16` | Alarm bits per word. |
| `base_code` | `1` | First alarm code. Code = `base_code + wordIndex*bits_per_word + bitIndex`. |
| `poll_interval_ms` | `scan_interval_ms` or `1000` | Alarm poll period. |

---

## Worked examples

These are rows of `data/machines.json` — wrap one in `{ "nextId": 2, "rows": [ … ] }`.
Ready-made copies ship as `config/machines.example.ads.json` and
`config/machines.example.opcua.json`.

### A) Beckhoff ADS machine with alarms + numeric labels

```json
{
  "id": 1,
  "name": "Machine 1",
  "protocol": "ads",
  "n_bit": 32,
  "ams_net_id": "5.98.90.5.1.1",
  "ads_port": 851,
  "scan_interval_ms": 500,
  "is_active": true,
  "ads_data": { "symbol": "GVL_PLC.PLC_MEM", "base": 0 },
  "alarms": {
    "enabled": true,
    "ads_symbol": "GVL_PLC.aAlarms",
    "base_code": 1,
    "bits_per_word": 16,
    "poll_interval_ms": 1000
  }
}
```

### B) OPC UA machine

```json
{
  "id": 1,
  "name": "Machine 1",
  "protocol": "opcua",
  "scan_interval_ms": 500,
  "is_active": true,
  "opcua": {
    "endpoint": "opc.tcp://192.168.1.10:4840",
    "security_mode": "None",
    "namespace": 4,
    "nodes_data": { "nodeid": "ns=4;s=GVL_PLC.PLC_MEM", "base": 0 }
  },
  "alarms": { "enabled": true, "opcua_nodeid": "ns=4;s=GVL_PLC.aAlarms", "base_code": 1, "bits_per_word": 32, "poll_interval_ms": 1000 }
}
```

> Alarms read a BOOL-array **node** (`opcua_nodeid`) on OPC UA — the same bit→code
> packing as ADS. Element i of the array is alarm `base_code + i`.

### C) Mock machine for demos (no PLC needed)

```json
{ "id": 1, "name": "Demo", "protocol": "mock", "is_active": true }
```

Or force the machine into simulation from `conf.json`: `"simulation": true`.

---

## Validate & apply

From the repo root:

```bash
# 1. Validate JSON (prints an error with position if malformed)
node -e "JSON.parse(require('fs').readFileSync('config/conf.json','utf8')); console.log('conf.json OK')"
node -e "JSON.parse(require('fs').readFileSync('data/machines.json','utf8')); console.log('machines.json OK')"

# 2. Restart the backend so changes load
#    (stop the running node index.js first, then from backend/)
cd backend && node index.js
```

A clean start logs:

```
[features] enabled: alarms, event_log
[eventLog] audit → data/audit_log.jsonl (0 records)
alarmWatcher: watching machine 1 (32 words, every 1000ms)
HMI backend listening on 0.0.0.0:3100
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Backend won't start, JSON error | Trailing comma / missing quote | Run the validate command above; fix the reported position. |
| `Device system manager state read failed` on ADS | PLC unreachable / no ADS route from this host | Check network to the PLC; add an ADS route on the PLC for this host's `local_ams_net_id`; verify `ams_net_id` / `ads_port`. |
| ADS widget shows no value (null), connection is up | Wrong symbol name, or numeric position with no `ads_data` | For symbol widgets, verify the symbol in the editor's variable browser. For numeric positions, set `ads_data.symbol` (and `base`). |
| `ads-client not installed` | Optional ADS dependency missing | `npm install` in `backend/`. |
| Alarms never fire | `alarms.enabled` false, or wrong `ads_symbol` | Enable the block and confirm the alarm array address. |
| Changes ignored | Backend not restarted | `conf.json` / `data/machines.json` load only at startup — restart the backend (also after loading a project that changes the machine). |
| Loaded project didn't switch the PLC | Machine config applies at startup | Loading a `.hmiproj` updates `data/machines.json`; restart the backend for the new machine to connect. |
| Machine keeps retrying a dead PLC | Machine left active | Set `"is_active": false` on the machine in `data/machines.json`. |
