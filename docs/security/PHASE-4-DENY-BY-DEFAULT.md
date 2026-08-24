# Phase 4 — Deny-by-Default Authorization and Public Endpoint Integrity

Date: 2026-08-25  
Branch: `agent/phase1-interactions`

## Objective

Remove the opt-in authentication failure mode identified in Phase 3. Every backend route is now authenticated unless a security-reviewed controller or handler explicitly carries `@Public()`.

## Architecture change

### Global JWT guard

`JwtAuthGuard` is registered through Nest's `APP_GUARD`.

Default behavior:

1. inspect class and handler metadata;
2. bypass JWT authentication only when `@Public()` is present;
3. otherwise validate the access JWT and persisted session;
4. reuse an already-authenticated request when legacy controller-level guards are also present, avoiding duplicate database session checks.

A new controller with no decorators is therefore protected automatically.

Commits: `4df6989`, `48eadc2`, `9c7a6b9`, `c261a01`

## Explicit public surface

The reviewed public surface is limited to:

- root service probe;
- authentication entry points:
  - login;
  - Google configuration/sign-in/onboarding;
  - signup;
  - verification request/confirmation;
  - password reset request/confirmation;
  - refresh;
  - browser-cookie clearing;
- liveness and readiness probes;
- published public bundle catalog;
- one-time bootstrap endpoint protected by its bootstrap token and shutdown rules;
- Paymob webhook protected by HMAC verification.

Authenticated auth routes remain protected:

- `GET /auth/me`;
- `GET /auth/security`;
- `POST /auth/sessions/revoke-others`;
- `POST /auth/logout`.

Commits: `88d33a7`, `c528ad6`, `cdae6be`, `1442e1f`, `6faca53`, `4537225`

## Automated enforcement

### Global boundary test

`global-auth-boundary.spec.ts` verifies:

- `APP_GUARD` registration exists;
- an explicit `@Public()` handler bypasses Passport;
- sensitive authentication handlers are not public.

### Public route inventory

`public-route-inventory.spec.ts` recursively scans controller source files and compares every `@Public()` occurrence with a reviewed allowlist and expected count.

The test fails when:

- a developer adds an unreviewed public controller;
- a new `@Public()` annotation appears;
- an expected public annotation is removed or duplicated.

Commits: `8f4f3f2`, `b12039c`

## Payment webhook integrity remediation

Paymob HMAC verification was already present, but concurrent webhook deliveries could read the same purchase as `PENDING` before either saved its transition.

The handler now:

1. verifies HMAC before database work;
2. starts a database transaction;
3. locks the purchase row with `pessimistic_write`;
4. permits only one `PENDING -> PAID/FAILED` transition;
5. updates promo usage in the same transaction;
6. treats later duplicate deliveries as no-ops.

This makes webhook idempotency valid under concurrency and prevents duplicate promo usage.

Commits: `2bbc5dc`, `f66b188`

## OWASP coverage

| Area | Phase 4 control |
|---|---|
| A01 Broken Access Control | Global deny-by-default JWT guard and explicit public allowlist |
| A04 Insecure Design | Public routes require affirmative security classification |
| A05 Security Misconfiguration | Automated detection of accidental public exposure |
| A07 Authentication Failures | Persisted-session validation applies automatically to new routes |
| A08 Data Integrity Failures | Signed webhook plus transactional, row-locked idempotency |
| A09 Monitoring Failures | Public surface is machine-inventoried and reviewable |

## Remaining work

1. **Global abuse controls:** shared-store budgets for anonymous, authenticated, upload, import, search, exam-generation, and webhook traffic.
2. **Nonce-based CSP:** remove frontend `script-src 'unsafe-inline'` safely.
3. **Webhook replay telemetry:** record provider event/transaction identifiers and alert on anomalous repeated or conflicting callbacks.
4. **Authorization role inventory:** extend static inventory to require an explicit role policy for privileged mutation routes, not only authentication.
5. **CI restoration:** security jobs still need repository-level Actions/billing/GHAS diagnosis before automated results can be treated as evidence.

## Exit status

The application authorization boundary is now deny-by-default in source, and its intentionally public surface is explicit and test-inventoried.

Build/test execution is not claimed because the configured GitHub security workflow still fails before running job steps.
