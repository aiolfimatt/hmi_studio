# Contributing to HMI Studio

Thanks for your interest! This guide covers local setup, conventions, and how to
submit changes.

## Development setup

Prerequisites: **Node.js 20+** and npm.

```bash
# backend (API + Socket.IO on :3100)
cd backend && npm install && node index.js    # or: npm run dev  (nodemon)

# frontend (Vite dev server on :3101, proxies to :3100)
cd frontend && npm install && npm run dev
```

Open http://localhost:3101 (login `admin` / `admin123`). For a PLC-free end-to-end
environment, use the [OPC UA test bench](test-bench/README.md).

## Repo layout

See the [Repository layout](README.md#repository-layout) section of the README and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Coding conventions

- **Match the surrounding code.** The codebase favours small, well-commented modules;
  keep comment density and naming consistent with the file you're editing.
- **Backend:** CommonJS, Node 20, no TypeScript. Keep PLC access behind the driver
  interface (`backend/src/plc/*`) and dispatch in `scanner.js`.
- **Frontend:** React function components + hooks, Vite, Tailwind, Ant Design.
- **Designer/admin UI is English;** only the operator runtime is localizable.
- **No secrets or customer data in commits.** `data/` and `config/conf.*.json` are
  gitignored — keep it that way.

## Before you open a PR

- Backend sanity check: `cd backend && node -e "require('./index.js')"` (Ctrl-C) —
  it should boot without errors.
- Frontend build: `cd frontend && npm run build` must succeed.
- If you touched the portable bundle path, re-run `cd backend && node build/bundle.js`.
- Update docs when you change behaviour or configuration.
- Add a line to [CHANGELOG.md](CHANGELOG.md) under **Unreleased**.

## Commit & PR

- Write clear, imperative commit messages ("Add OPC UA alarm polling").
- Keep PRs focused; describe what changed and why, and how you tested it.

## Developer Certificate of Origin (DCO)

By contributing you certify the [DCO](https://developercertificate.org/). Sign off
your commits:

```bash
git commit -s -m "Your message"
```

Contributions are accepted under the project's **Apache-2.0** license.

## Reporting bugs vs. vulnerabilities

- **Bugs / features:** open a GitHub issue.
- **Security vulnerabilities:** do **not** open a public issue — follow
  [SECURITY.md](SECURITY.md).
