# CRA readiness

This document tracks how HMI Studio aligns with the **EU Cyber Resilience Act**
(Regulation (EU) 2024/2847, "CRA") essential requirements, and what remains. It is a
**technical readiness aid, not a legal conformity statement.**

> **Disclaimer.** CRA compliance (risk assessment, technical documentation, a
> conformity assessment, the EU declaration of conformity, and CE marking) is the
> legal responsibility of the **manufacturer** who places a product with digital
> elements on the EU market. Deploying HMI Studio inside your own machine/product
> makes *you* (or your company) that manufacturer for the resulting product. This
> file helps you get there; it does not by itself make any product compliant.
>
> **Open source note.** The CRA treats non-commercial open-source software, and
> "open-source software stewards", more lightly than commercial manufacturers. The
> moment HMI Studio is integrated into a commercial product, the full manufacturer
> obligations apply to that product.
>
> **Timeline (indicative).** CRA entered into force in Dec 2024; vulnerability- and
> incident-reporting obligations apply from **Sept 2026**, and the main obligations
> from **Dec 2027**. Plan accordingly.

---

## Annex I, Part I — essential cybersecurity requirements (product)

| # | Requirement (summary) | How HMI Studio addresses it | Status |
|---|---|---|---|
| 1 | Made available **without known exploitable vulnerabilities** | Pinned deps; CI (`.gitlab-ci.yml`) fails the pipeline on high/critical `npm audit` findings; [SBOM](SBOM.md) generated per release tag | **Done** |
| 2 | **Secure by default** configuration | No shipped signing key (random ephemeral secret if the placeholder is used); startup warning on the default admin password; `simulation`/`mock` default so no PLC is contacted unconfigured | **Done** |
| 3a | Protect **confidentiality** (encryption of data at rest/in transit as appropriate) | Passwords stored as bcrypt hashes; JWT session tokens; TLS is terminated at a reverse proxy (see [DEPLOYMENT](DEPLOYMENT.md)) | Partial — TLS is operator-provided |
| 3b | Protect **integrity** of data, commands, configuration | Authenticated, group-gated writes; atomic file writes in the store; audit log of value changes | **Done** |
| 3c | **Data minimisation** — process only what's necessary | Stores only HMI config + accounts; audit log is local; no telemetry/phone-home | **Done** |
| 3d | **Access control** / authorization | Named access groups with capability inheritance; per-page/per-widget gating; JWT with live re-resolution | **Done** |
| 3e | Protect from unauthorized access (authentication) | Login with lockout after N failed attempts; optional LDAP gateway; configurable password policy | **Done** |
| 3f | Minimise **attack surface** | Single service, no external DB; legacy protocols removed; optional subsystems gated by `features`; CORS lockable via `cors_origin` | **Done** |
| 3g | Minimise impact of incidents (**resilience / DoS**) | Concurrent-client cap (`max_runtime_clients`); scan back-pressure (skip overlapping ticks); transport errors are swallowed, never crash the scan loop; graceful shutdown; per-IP rate limiting on auth endpoints (`security.login_rate_*`) | **Done** |
| 3h | **Record / monitor** security-relevant activity (with opt-out) | Append-only audit log (`data/audit_log.jsonl`) of logins, lockouts, value writes, user/password changes; diagnostic logging configurable | **Done** |
| 3i | **Security updates** — ability to update, ideally automatically | Versioned releases + [CHANGELOG](../CHANGELOG.md); Docker image / portable package replace-in-place; config/data preserved across upgrades | Partial — no auto-update/signature verification |
| 3j | Secure **data deletion** / export | Project export/import (`.hmiproj`); `data/` is the single state location to wipe | **Done** |

## Annex I, Part II — vulnerability handling (process)

| # | Requirement (summary) | How HMI Studio addresses it | Status |
|---|---|---|---|
| 1 | Identify & document components (**SBOM**) | CycloneDX SBOM generation for backend + frontend — see [SBOM.md](SBOM.md) | **Done** (generate at release) |
| 2 | Address & remediate vulnerabilities **without delay** | Security patch releases; CI audit gate blocks merges carrying high/critical findings | **Done** |
| 3 | Apply effective, regular **security testing** | `npm audit` on every pipeline (`.gitlab-ci.yml`); SAST still to add | Partial — add SAST |
| 4 | Publicly disclose fixed vulnerabilities (advisories) | GitHub Security Advisories + CHANGELOG entries | **Done** (process defined) |
| 5 | **Coordinated vulnerability disclosure** policy | [SECURITY.md](../SECURITY.md) — private reporting, response targets, credit | **Done** |
| 6 | Provide a contact for reporting | [SECURITY.md](../SECURITY.md) — security contact filled in | **Done** |
| 7 | Mechanism to **distribute updates** securely | Container registry / signed artifacts (to add) | Partial |
| 8 | Disseminate information about fixed vulnerabilities | Advisories + release notes | **Done** (process defined) |

---

## Before you publish / ship

- [x] Fill in the security contact in `SECURITY.md` and the conduct contact in `CODE_OF_CONDUCT.md` (2026-11-11).
- [ ] Set the copyright holder in `LICENSE`/`NOTICE` to your legal entity (optional).
- [x] Generate and archive an SBOM per release (`docs/SBOM.md`) — `npm run sbom` verified; CI produces both SBOMs on every release tag.
- [x] Run `npm audit` in `backend/` and `frontend/`; resolve high/critical findings — **0 vulnerabilities** in both trees (incl. dev deps) as of 2026-11-11; CI keeps it that way.
- [x] Confirm no secrets/customer data are tracked (`git ls-files | grep -i -E 'machines\.json|users\.json|conf\..*local'` is empty; the tracked `config/conf.json` is a sanitized template with a placeholder secret).
- [ ] Document the deployment's security configuration (secret management, TLS, network segmentation) as part of *your* product's technical documentation.

## Roadmap to strengthen CRA posture

- SAST on every pipeline (the audit/build/SBOM pipeline exists in `.gitlab-ci.yml`).
- Signed release artifacts and an update-verification mechanism.
- Optional built-in TLS and security-header middleware.
- A documented product risk assessment template.
