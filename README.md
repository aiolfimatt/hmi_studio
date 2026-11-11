# HMI Studio

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

**HMI Studio** is a web-based tool to **design and run operator HMIs for industrial
machines**. You build screens visually in a browser, bind widgets to PLC variables
over **Beckhoff ADS** or **OPC UA**, and serve the result as a touch-friendly
runtime panel — no per-machine native app to install.

- 🎨 **Visual editor** — drag-and-drop pages (labels, buttons, toggles, gauges, grids, images, 3D/STL, charts), a reusable widget library, live PLC symbol browser.
- 🔌 **Protocols** — Beckhoff TwinCAT **ADS**, **OPC UA**, plus **mock**/simulation for PLC-free development.
- 🚨 **Alarms** — edge-detected alarm polling (ADS & OPC UA), composite alarm text, active-alarm view.
- 👥 **Access control** — named groups with capability inheritance; per-widget/per-page gating.
- 🌍 **Localizable runtime** — multi-language operator UI (editor/admin UI is English).
- 📦 **Portable projects** — export/import a whole configuration (pages, alarms, recipes, groups, **machine config**) as a single `.hmiproj` file.
- 🖥️ **Simple ops** — one Node process serves the UI **and** the API; Docker image, Docker Compose, and a Windows portable package.

> Status: **1.0.0**. Single-machine deployment (one PLC per instance).

---

## Table of contents

- [Quick start (development)](#quick-start-development)
- [Try it with the OPC UA test bench](#try-it-with-the-opc-ua-test-bench)
- [Production deployment](#production-deployment)
- [Configuration](#configuration)
- [Security](#security)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Documentation index](#documentation-index)
- [Contributing](#contributing)
- [License](#license)

---

## Quick start (development)

**Prerequisites:** [Node.js](https://nodejs.org/) **20+** and npm.

```bash
git clone <your-fork-url> hmi-studio
cd hmi-studio

# 1) Backend (API + Socket.IO on :3100)
cd backend
npm install
node index.js
```

```bash
# 2) Frontend dev server (Vite on :3101, proxies /api + /socket.io to :3100)
cd frontend
npm install
npm run dev
```

Open **http://localhost:3101** and log in with **`admin` / `admin123`**
(change this immediately — see [Security](#security)).

On first run the backend seeds a clean workspace (admin user, default access groups,
and a single **mock** machine) so everything works with no PLC attached. Create a
page, drop a value widget, and it will show simulated data.

> Prefer running against a real OPC UA server without hardware? Use the
> [test bench](#try-it-with-the-opc-ua-test-bench).

---

## Try it with the OPC UA test bench

A bundled OPC UA test server exposes the nodes the HMI expects, so you can exercise
the full stack (reads, writes, alarms) without a PLC.

```bash
docker compose -f docker-compose.test-bench.yml up --build
# → http://localhost:3100   (admin / admin123)
```

Or run it locally (`cd test-bench && npm install && npm start`). Full instructions,
node list, and a non-UI connectivity check are in **[test-bench/README.md](test-bench/README.md)**.

---

## Production deployment

One container (or one Node process) serves the built SPA **and** the API on port 3100.

**Docker (recommended, cross-platform):**

```bash
export HMI_JWT_SECRET=$(openssl rand -base64 48)   # required — a strong secret
docker compose up --build                          # → http://localhost:3100
```

**Windows portable package** (no Node install needed on the target PC):

```powershell
powershell -ExecutionPolicy Bypass -File package.ps1
# copy the generated dist-portable/ to the machine and run start.bat
```

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for upgrades, autostart, reverse-proxy/TLS, and the data model.

---

## Configuration

Configuration is split by lifecycle:

| File | Scope | Holds |
|---|---|---|
| `config/conf.json` | per **installation** | `jwt_secret`, host/ports, logging, security policy, LDAP, feature toggles |
| `data/machines.json` | per **project** | the machine the HMI talks to — protocol, ADS/OPC-UA endpoint, numeric mapping, alarms |

The machine/PLC config is part of the **project** and travels inside a `.hmiproj`
bundle. Ready-made templates live in `config/machines.example.ads.json` and
`config/machines.example.opcua.json`. The full reference — every field, protocol,
and worked examples — is in **[config/README.md](config/README.md)**.

---

## Security

HMI Studio aims to be **secure by default** (see [docs/CRA-READINESS.md](docs/CRA-READINESS.md)):

- **Set a JWT secret.** Provide `HMI_JWT_SECRET` (env) or set `jwt_secret` in
  `config/conf.json`. If it's missing or still the shipped placeholder, the backend
  generates a **random ephemeral** secret at startup and warns — it never signs
  tokens with a known key.
- **Change the default admin password** (`admin`/`admin123`) immediately. The
  backend warns at startup while it's unchanged.
- **Lock down CORS** for internet-facing installs via `conf.cors_origin`.
- **Keep secrets and data out of git** — `data/` and `config/conf.*.json` are gitignored.

Found a vulnerability? See **[SECURITY.md](SECURITY.md)** for coordinated disclosure.

---

## Architecture

```
Browser (operator / designer)
        │  HTTP + WebSocket (Socket.IO)
        ▼
Node backend  ── scanner ──▶  PLC drivers:  ADS │ OPC UA │ mock/sim
   (Express)  ── JSON store (data/*.json)
        │
        └─ serves the built React SPA (frontend/dist)
```

- **Backend** (`backend/`): Express + Socket.IO; a *scanner* polls machine variables and pushes deltas to subscribed pages; a JSON file **store** (`data/`) holds pages, users, groups, alarms, recipes and machine config; a local append-only **audit log**.
- **Frontend** (`frontend/`): React + Vite + Tailwind + Ant Design. A designer (`/edit`) and an operator runtime (`/monitor`).
- **Drivers** (`backend/src/plc/`): `ads.js`, `opcua.js`, `simulator.js`, dispatched by the machine's `protocol`.

Deeper design notes: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Repository layout

```
backend/            Express + Socket.IO API, scanner, PLC drivers, JSON store
  src/plc/          ads.js · opcua.js · simulator.js
  build/            single-file bundler (esbuild) for the portable package
frontend/           React + Vite SPA (designer + runtime)
config/             conf.json (infra template) + machine config examples + reference README
data/               local runtime state — seeded on first run, gitignored (see data/README.md)
test-bench/         OPC UA test server + compose wiring
docs/               architecture, deployment, CRA readiness, SBOM
package.ps1         builds the Windows portable package (dist-portable/)
Dockerfile          production image · docker-compose*.yml
```

---

## Documentation index

| Doc | What |
|---|---|
| [config/README.md](config/README.md) | Full configuration reference (conf.json + machines.json) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow, project model |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Docker, Windows portable, upgrades, TLS |
| [docs/CRA-READINESS.md](docs/CRA-READINESS.md) | EU Cyber Resilience Act readiness & security properties |
| [docs/SBOM.md](docs/SBOM.md) | Generating a Software Bill of Materials |
| [SECURITY.md](SECURITY.md) | Coordinated vulnerability disclosure |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Dev setup, build, conventions, DCO |
| [test-bench/README.md](test-bench/README.md) | OPC UA test server |

---

## Contributing

Contributions are welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)**. By
contributing you agree your contributions are licensed under Apache-2.0.

## License

Licensed under the **Apache License 2.0** — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
