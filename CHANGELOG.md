# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Apache-2.0 license, `NOTICE`, and open-source project documentation (README,
  architecture, deployment, contributing, security, CRA readiness, SBOM).
- OPC UA **test bench**: a standalone `node-opcua` test server plus Docker Compose
  wiring to run the full stack without a PLC.
- Docker image and Compose files (standalone + test bench).
- OPC UA **alarm polling** (`alarms.opcua_nodeid`), matching the existing ADS path.
- Secure-by-default hardening: `HMI_JWT_SECRET` env override with a random ephemeral
  fallback when the shipped placeholder is detected; startup warning when the default
  admin password is unchanged; `conf.cors_origin` knob.
- SBOM generation scripts (CycloneDX) for backend and frontend.
- Per-IP **rate limiting** on `/api/auth/login` and `/api/auth/change-password`
  (`security.login_rate_window_s` / `login_rate_max`, HTTP 429 when exceeded) —
  dependency-free in-memory limiter complementing the per-account lockout.
- **CI pipeline** (`.gitlab-ci.yml`): `npm audit` gate (fails on high/critical),
  backend bundle + frontend build verification, SBOM artifacts on release tags.

### Changed
- **Machine/PLC config moved out of `conf.json`** into the project store
  (`data/machines.json`) and the `.hmiproj` bundle. `conf.json` is now infra-only.
- Editor: delete-page button on the page list; new-page flow no longer prompts twice.

### Removed
- Legacy ST_BET/PW_PLC protocol and the auxiliary "satellite" ADS feature.

### Security
- Repository scrubbed of confidential data; `data/`, built artifacts, and local
  config/secrets are gitignored.
- All `npm audit` findings resolved (0 vulnerabilities in backend and frontend,
  including dev dependencies): Express/Socket.IO/multer/body-parser patch bumps,
  `react-router-dom` 6 → 7, Vite 5 → 8 (+ `@vitejs/plugin-react` 6), esbuild
  ≥ 0.25, `minimatch` override for nodemon.
- Security/conduct contact filled in `SECURITY.md` and `CODE_OF_CONDUCT.md`.

## [1.0.0]
- Initial internal release.
