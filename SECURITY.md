# Security Policy

We take the security of HMI Studio seriously. This document explains how to report a
vulnerability and what to expect. It is also the coordinated-disclosure process
referenced by our [CRA readiness](docs/CRA-READINESS.md).

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | ✅ |
| < 1.0 | ❌ |

Security fixes are released as patch versions and noted in [CHANGELOG.md](CHANGELOG.md).

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Preferred: use **GitHub → Security → "Report a vulnerability"** (private advisory) on
this repository.

Alternatively, email **mattia.aiolfi@bettinelli.it** with:

- a description of the issue and its impact,
- steps to reproduce (proof-of-concept if possible),
- affected version / commit,
- any suggested remediation.

If you wish to encrypt the report, request our PGP key at the same address.

## What to expect

| Stage | Target |
|---|---|
| Acknowledgement of your report | within **3 business days** |
| Initial assessment & severity | within **10 business days** |
| Fix or mitigation plan | depends on severity; critical issues prioritised |
| Public disclosure | coordinated with you, after a fix is available |

We follow coordinated disclosure: we ask that you give us reasonable time to release a
fix before any public disclosure, and we will credit you (unless you prefer to remain
anonymous).

## Scope

In scope: the HMI Studio backend, frontend, and the configuration/deployment tooling
in this repository.

Out of scope: vulnerabilities in third-party dependencies (please report upstream;
tell us so we can update), issues requiring a already-compromised host or physical
access, and deployments that ignore the hardening guidance in the
[README](README.md#security) (e.g. running with the default admin password or the
placeholder JWT secret).

## Hardening checklist for operators

- Set a strong `HMI_JWT_SECRET` (or `conf.json` `jwt_secret`).
- Change the default `admin` password immediately.
- Put the app behind a TLS-terminating reverse proxy; set `conf.cors_origin`.
- Restrict network access to trusted operators/engineers.
- Keep Node.js and dependencies up to date; review `npm audit` and the generated SBOM.
