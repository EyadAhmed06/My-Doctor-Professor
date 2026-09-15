# Phase 1 Security Baseline

Status: active  
Scope: `backend/`, `frontend/`, database boundaries, CI/CD and third-party identity  
Verification target: OWASP ASVS 5.0 Level 2

## Security objectives

1. No request is trusted because it came from the frontend.
2. Authentication proves identity; authorization is re-evaluated for every resource.
3. Student, instructor and administrator data is isolated by server-side ownership rules.
4. Paid, expired, unpublished and unentitled content is denied by the backend.
5. A failure in one control must not expose secrets, model answers, PII or privileged actions.
6. Security requirements are executable in CI and regressions block merging.

## Asset register

| Priority | Asset | Security property | Principal threats |
|---|---|---|---|
| P0 | JWT secrets, refresh sessions, Google identities, action tokens | confidentiality, integrity | theft, replay, fixation, forgery |
| P0 | Admin and instructor privileges | integrity | privilege escalation, broken function authorization |
| P0 | Student PII | confidentiality | BOLA/IDOR, logs, exports, backups |
| P0 | Bundle entitlement and future payment state | integrity | access bypass, race conditions, forged payment |
| P1 | Exams, attempts, answers, scores, confidence and flags | integrity, availability | cross-user access, tampering, duplicate submit |
| P1 | Question bank and model answers | confidentiality, integrity | premature reveal, scraping, unauthorized editing |
| P1 | Lecture resources and uploads | confidentiality, availability | path traversal, malicious files, oversized uploads |
| P1 | Password reset and email verification | confidentiality, integrity | token replay, enumeration, brute force |
| P2 | Notifications, notes, analytics and study-plan data | confidentiality, integrity | cross-user disclosure, stored XSS |
| P2 | Audit logs, email outbox and backups | confidentiality, integrity | secret/PII leakage, tampering |

## Trust boundaries

```text
Untrusted browser
  -> Next.js UI / browser storage
  -> NestJS HTTP API
  -> authentication + authorization + ownership policy
  -> PostgreSQL / file storage / email outbox
  -> Google identity and future payment providers
```

Crossing a boundary requires validation, authentication where applicable, authorization, bounded resource use and safe error handling.

## Repository security map

### Backend

- `src/main.ts`: CORS, proxy trust, headers, global validation and exception handling.
- `src/modules/auth`: credentials, Google identity, JWTs, refresh sessions, action tokens and rate limits.
- `src/modules/users`: account state, sessions and PII.
- `src/modules/admin`: highest-impact role operations and account bootstrap.
- `src/modules/academic`: course ownership, publication and file access.
- `src/modules/bundles` and `subscriptions`: entitlement, expiry and payment state.
- `src/modules/tests`, `questions`, `essay-cases`: assessment integrity and model-answer confidentiality.
- `src/modules/workspace`, `progress`, `notifications`: student-owned data.
- `src/database`: credentials, migrations, constraints and least privilege.
- `scripts`: backup, restore, seed and schema operations.

### Frontend

- `next.config.ts`: CSP, browser isolation, security headers and allowed origins.
- `src/lib/api.ts`: credential transport, error handling and API origin.
- authentication provider/components: token lifetime, refresh concurrency and logout.
- student/instructor/admin pages: UI authorization is convenience only, never a security control.
- renderers and URL handling: XSS, unsafe redirects and untrusted files.

## Initial verified observations

| ID | Severity | Observation | Evidence | State |
|---|---|---|---|---|
| P1-001 | High design risk | Authentication is opt-in at controller level instead of deny-by-default globally. A new controller can accidentally become public. | Controllers apply `JwtAuthGuard` individually; no global authentication guard is registered in `AppModule`. | Open; inventory and tests required before migration |
| P1-002 | High | Credentialed CORS reflects arbitrary request origins. | `main.ts` uses `origin: true` with `credentials: true`. | Open; replace with explicit environment allowlist |
| P1-003 | Medium | Production CSP allows inline scripts and styles. | `next.config.ts` contains `'unsafe-inline'`. | Open; nonce/hash migration required |
| P1-004 | Medium | CSP permits images and media from every HTTPS origin. | `img-src ... https:` and `media-src ... https:`. | Open; inventory hosts then restrict |
| P1-005 | Positive control | Access JWT validation checks server-side session, revocation, expiry, verified email and active account. | `JwtStrategy.validate`. | Retain and regression-test |
| P1-006 | Positive control | Refresh token is issued in an HttpOnly SameSite=Lax cookie for browser requests. | `AuthController.refreshCookieOptions`. | Review CSRF and proxy-derived Secure flag |
| P1-007 | Positive control | Request DTOs use whitelist and reject unknown properties. | global `ValidationPipe` in `main.ts`. | Retain |
| P1-008 | Positive control | Academic reads include explicit resource-access assertions. | `AcademicAccessService` calls in controller. | Expand matrix and negative tests |
| P1-009 | Medium process risk | No repository security workflow was present at the Phase 1 start. | no `.github/workflows` directory on audited ref. | Addressed by Phase 1 workflow |

These are architecture/code-review findings, not proof that an exploit has been executed.

## Phase 1 exit criteria

- [x] Asset register and trust boundaries documented.
- [x] Initial authentication/authorization architecture reviewed.
- [x] Repeatable dependency, build and CodeQL workflow added.
- [x] Dependabot configuration added.
- [x] Threat and access-control test catalogue defined.
- [ ] Every controller/route classified public or protected.
- [ ] Every protected route assigned allowed roles and an ownership predicate.
- [ ] Negative BOLA/BFLA tests pass for all P0/P1 resources.
- [ ] CORS uses an explicit allowlist.
- [ ] Refresh and CSRF model is tested end to end.
- [ ] Existing dependency findings are triaged, not blindly suppressed.

## Severity and remediation SLA

| Severity | Merge rule | Target |
|---|---|---|
| Critical | block release and merge | immediate |
| High | block merge unless documented emergency exception | 7 days |
| Medium | owner and issue required | 30 days |
| Low | backlog with rationale | 90 days |

Security exceptions must identify the owner, affected asset, compensating control and expiration date.
