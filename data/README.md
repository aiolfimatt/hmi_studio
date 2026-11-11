# `data/` — local runtime & project state

This directory holds the application's **working state** and is **not** tracked in
git (see `.gitignore`). It is created and seeded automatically the first time the
backend starts.

| File / folder | What it is |
|---|---|
| `pages.json` | HMI pages and their widgets |
| `machines.json` | Machine / PLC configuration (protocol, endpoint, alarms) — part of the project |
| `alarm_definitions.json`, `alarm_lists.json` | Alarm catalogue and composite-alarm text lists |
| `recipes.json` | Recipes |
| `widget_library.json` | Saved reusable widgets |
| `users.json`, `groups.json` | Accounts and the access-group model |
| `app_settings.json` | Global settings (program version, sidebar, …) |
| `assets/` | Uploaded images / STL files referenced by widgets |
| `projects/*.hmiproj` | Portable project bundles (export/import) |
| `audit_log.jsonl` | Append-only audit trail |
| `logs/` | Diagnostic log files |

## First run

On a fresh checkout this folder is empty. The backend seeds:

- a default **admin** account (`admin` / `admin123`) — **change the password immediately**,
- the default access groups (Operator / Maintenance / Installer / UserAdmin),
- a single **mock** machine so the UI runs with no PLC attached.

Configure your real machine in `machines.json` (see `config/README.md` and the
ready-made templates `config/machines.example.ads.json` /
`config/machines.example.opcua.json`), then restart the backend.

> Because this directory contains credentials, machine endpoints and customer
> assets, never commit it to a public repository.
