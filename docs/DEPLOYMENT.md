# Deployment

One process serves the built SPA **and** the API/Socket.IO on **port 3100**. Two
supported packagings: **Docker** (cross-platform) and a **Windows portable package**.

> Before deploying: set a strong `HMI_JWT_SECRET`, change the default admin password,
> and review [docs/CRA-READINESS.md](CRA-READINESS.md).

---

## Docker (recommended)

**Build & run (standalone):**

```bash
export HMI_JWT_SECRET=$(openssl rand -base64 48)
docker compose up --build        # → http://localhost:3100
```

- Runtime state persists in the `hmi-data` named volume (`/app/data`).
- `./config` is bind-mounted to `/app/config`, so you edit `conf.json` on the host and restart.
- Configure the machine in the data volume's `machines.json` (or load a `.hmiproj`), then `docker compose restart`.

**Plain `docker run`:**

```bash
docker build -t hmi-studio .
docker run -d --name hmi -p 3100:3100 \
  -e HMI_JWT_SECRET="$(openssl rand -base64 48)" \
  -v hmi-data:/app/data \
  -v "$PWD/config:/app/config" \
  hmi-studio
```

**Upgrades:** `docker compose pull && docker compose up -d --build` (or rebuild the
image). The `hmi-data` volume is preserved across upgrades.

---

## Windows portable package

Produces a self-contained folder that runs on a target PC with **nothing installed**
(a bundled `node.exe` is included).

**On a build machine** (needs Node + internet):

```powershell
powershell -ExecutionPolicy Bypass -File package.ps1
#   -Output D:\builds\hmi     choose output folder
#   -BlankData                ship without any project data
#   -NoNode                   don't bundle node.exe (target already has Node 20+)
```

This runs `npm ci` + bundles the backend to one `server.js`, builds the frontend, and
assembles `dist-portable/`.

**On the target PC:** copy `dist-portable/`, then:

```
start.bat            (or start.ps1)
```

- Edit `config\conf.json` on the target — set `jwt_secret` (or the `HMI_JWT_SECRET`
  env var) and your `security` policy.
- Set the machine in `data\machines.json` (templates in `config\machines.example.*.json`).
- **Autostart on boot / run as a service:** `install-autostart.ps1`.

---

## Reverse proxy & TLS

The app speaks plain HTTP on 3100. For anything beyond a trusted LAN, terminate TLS
at a reverse proxy (nginx, Caddy, IIS/ARR) and forward HTTP **and** WebSocket:

```nginx
location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;      # Socket.IO
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

Then restrict cross-origin access with `conf.cors_origin` (your external origin).

---

## Configuration & data at runtime

| Path | Purpose | Persist? |
|---|---|---|
| `config/conf.json` | installation infra (secret, ports, security) | yes (host/volume) |
| `data/` | pages, users, groups, machine config, assets, audit log | **yes** — back this up |
| `HMI_JWT_SECRET` (env) | overrides `conf.json` `jwt_secret` | set per deployment |

Both config files are read **once at startup** — restart after changes (including
after loading a project that changes the machine).

**Backups:** snapshot the `data/` directory (and `config/conf.json`). To move a design
between installs, use **Project → Download** (`.hmiproj`) rather than copying `data/`,
so secrets/host-specifics stay put.

---

## Health check

`GET /api/health` → `{ "ok": true, ... }`. Use it for container/orchestrator probes.
