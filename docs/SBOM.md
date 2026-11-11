# Software Bill of Materials (SBOM)

A Software Bill of Materials lists every third-party component the software ships, so
operators can track and respond to vulnerabilities. Producing one per release is part
of our [CRA readiness](CRA-READINESS.md) (Annex I, Part II §1).

We generate **CycloneDX** JSON SBOMs with
[`@cyclonedx/cyclonedx-npm`](https://github.com/CycloneDX/cyclonedx-node-npm).

## Generate

The backend and frontend have separate dependency trees, so generate one SBOM each.

```bash
# Backend (production dependencies only)
cd backend
npm install
npm run sbom          # → sbom-backend.json (repo root)

# Frontend
cd ../frontend
npm install
npm run sbom          # → sbom-frontend.json (repo root)
```

Without installing the dev tool you can also run it ad-hoc:

```bash
cd backend && npx @cyclonedx/cyclonedx-npm --omit dev --output-format JSON --output-file ../sbom-backend.json
```

Generated `sbom-*.json` files are **gitignored** (they change per build). Archive them
alongside each release artifact instead of committing them.

## Review dependencies for known vulnerabilities

```bash
cd backend  && npm audit --omit=dev
cd frontend && npm audit
```

Resolve high/critical findings before a release (update the dependency, or document an
accepted risk). Feed the SBOM into your vulnerability-monitoring tooling (e.g. Dependency-Track).

## Notes

- The portable backend bundle (`backend/server.js`) inlines these dependencies; the
  backend SBOM is the source of truth for what it contains.
- `ads-client` is an **optional** dependency (ADS support degrades gracefully if
  absent); it still appears in the dependency tree and SBOM.
