# Security phases 6–12 completion

## Phase 6 — frontend and browser

- Application-owned inline JavaScript moved to a same-origin static asset.
- CSP resource origins narrowed; arbitrary HTTPS image/media loading removed.
- Framework identification header disabled and CORP added.
- Static CI audit rejects dangerous HTML/JavaScript sinks and unsafe new-tab links.
- Access tokens remain session-scoped; refresh credentials remain HttpOnly-cookie based.

## Phase 7 — files and supply chain

- Managed uploads use randomized server-side keys, restrictive file permissions, path confinement, size limits, magic-byte detection, declared/detected MIME agreement, and an allowlist.
- Upload endpoints have durable per-user rate limits.
- CI uses reproducible installs, production dependency auditing, dependency review, and CodeQL.
- Dependabot remains enabled.

## Phase 8 — database and infrastructure

- TypeORM schema synchronization is disabled.
- PostgreSQL TLS verification is mandatory in production.
- Production refuses default database credentials, HTTP frontend origins, weak/shared JWT secrets, enabled bootstrap, or missing outbox encryption.
- Backup restore verification remains a release gate.

## Phase 9 — business logic and payments

- The legacy browser-callable direct purchase route can no longer create a permanent paid unlock.
- Paid state changes remain restricted to signature-verified webhook processing with a row lock and idempotent state transition.
- Prices and entitlement decisions are server-owned.
- Free enrollment and administrative grants remain separate domain actions.

## Phase 10 — detection and response

- Every HTTP response receives a correlation identifier.
- Structured completion events include method, route, status, and duration without bodies, credentials, or tokens.
- 4xx and 5xx events are separated by severity.
- Incident procedures must correlate API events, audit log rows, provider references, and database transactions.

## Phase 11 — verification

Automated checks cover builds, lint, backend tests, runtime fail-closed cases, browser sink checks, dependency audit/review, and CodeQL. Manual adversarial tests remain required for IDOR, role confusion, CSRF/origin bypass, malicious upload polyglots, webhook replay, concurrency, expiry boundaries, refresh rotation, and backup restoration.

## Phase 12 — final gate

See [FINAL-SECURITY-GATE.md](./FINAL-SECURITY-GATE.md). No workflow result may be reported as passing unless GitHub actually ran the jobs. Production penetration testing and infrastructure review remain outside the proof supplied by source changes.
