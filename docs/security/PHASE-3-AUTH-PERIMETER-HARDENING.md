# Phase 3 — Authentication and Perimeter Hardening

Date: 2026-08-25  
Branch: `agent/phase1-interactions`

## Scope

- browser/API trust boundary;
- CORS and credentialed requests;
- refresh-cookie CSRF protection;
- JWT access and refresh sessions;
- password and Google authentication;
- rate limiting and account enumeration;
- frontend security headers and CSP;
- authorization defaults.

## Remediations completed

### Explicit credentialed CORS allowlist

The backend previously used reflective CORS:

```ts
origin: true,
credentials: true
```

That behavior trusted every browser origin while permitting cookies. It has been replaced with an exact-origin allowlist built from:

- `FRONTEND_URL`;
- optional comma-separated `CORS_ORIGINS`;
- `http://localhost:3001` only as the development fallback.

Controls:

- malformed origins and origins containing paths are rejected at startup;
- production origins must use HTTPS;
- suffix/prefix lookalikes do not match;
- requests without an Origin remain available to non-browser API clients;
- preflight responses are cached for 600 seconds.

Commits: `906590d`, `5eea9fe`, `54437f9`, `cdaef48`

### Refresh-cookie origin enforcement

Cookie-based refresh now requires an Origin that exactly matches the trusted frontend allowlist. Browser-cookie logout receives the same protection.

This is defense in depth beyond `SameSite=Lax`: a later cookie-policy change or same-site deployment mistake does not silently remove the application-level CSRF boundary.

Body-supplied refresh tokens remain usable by non-browser clients without an Origin.

Commit: `c905952`

### Regression coverage

`cors-policy.spec.ts` verifies:

- exact trusted-origin matching;
- rejection of lookalike attacker origins;
- rejection of production HTTP origins;
- rejection of origins containing paths;
- controlled development fallback;
- support for non-browser requests without Origin.

Commit: `e5d13a7`

## Verified positive authentication controls

### Tokens and sessions

- access and refresh tokens use different secrets;
- both secrets require at least 32 characters;
- JWT token type, subject, and session ID are validated;
- every access request checks the persisted session, user status, verification state, revocation, and expiry;
- refresh tokens are stored only as SHA-256 digests;
- refresh tokens rotate on use;
- stale refresh-token reuse revokes the session after the bounded race window;
- password reset revokes all active sessions;
- refresh cookies are `HttpOnly`, `SameSite=Lax`, scoped to `/api/v1/auth`, and Secure over HTTPS;
- browser responses do not expose the refresh token in JSON.

### Password/account flows

- generic login failures prevent account enumeration;
- unknown-user login performs password work to reduce timing differences;
- reset and verification responses are generic;
- reset/verification tokens are random, hashed in storage, expiring, single-use, and transactionally consumed;
- password reset prevents reuse of the current password;
- repeated login and account-action requests use database-backed rate limits;
- failed login attempts support account lockout;
- production environment validation rejects default DB credentials and weak/equal JWT secrets.

### Google identity

- Google client ID format is validated;
- configuration exposes only the public client ID;
- Google credentials are verified by the backend service rather than trusted from frontend profile data;
- incomplete Google registration uses a bounded onboarding token.

## Frontend boundary review

Existing headers include:

- CSP in production;
- HSTS in production;
- frame denial;
- MIME sniffing denial;
- restrictive referrer and permissions policies;
- COOP compatible with the Google authentication popup.

Open CSP concern:

- `script-src 'unsafe-inline'` remains.
- `img-src https:` and `media-src https:` are broader than least privilege.

Removing inline script permission without a nonce/hash design can break Next.js hydration. Phase 4 should implement and test a nonce-based CSP rather than deleting it blindly.

## Open findings

### High design risk — authorization is opt-in

Protected controllers generally use `JwtAuthGuard`, but authentication is not registered globally as deny-by-default. A newly added controller can accidentally become public.

Required Phase 4 work:

1. register a global authentication guard;
2. introduce an explicit `@Public()` decorator;
3. mark only login, registration, verification, password recovery, health probes, public catalog, and required webhook routes public;
4. add an automated route inventory test that fails when a route is neither explicitly public nor protected.

This change is deliberately not applied partially because an incomplete public-route inventory could break login, health checks, webhooks, or bootstrap recovery.

### Medium — no global application abuse limiter

Authentication endpoints have durable limits, but expensive authenticated operations and generic public endpoints have no shared global/IP/user budget. Add layered limits for:

- global anonymous traffic;
- authenticated user traffic;
- imports/uploads;
- practice-test generation;
- search;
- payment/webhook endpoints.

Use a shared store in multi-instance deployment; an in-memory limiter would be inconsistent across instances.

### Medium — proxy trust is operationally sensitive

`TRUST_PROXY_HOPS` must match the real reverse-proxy chain. Too high permits spoofed client IPs and weakens rate limiting/audit attribution; too low records the proxy address and can collapse all users into one rate-limit bucket.

### Medium — cookie assurance requires deployment verification

Production must terminate HTTPS correctly and preserve the expected Origin. Validate Set-Cookie flags and refresh behavior through the deployed reverse proxy, not only unit tests.

## OWASP mapping

| OWASP area | Phase 3 result |
|---|---|
| A01 Broken Access Control | CORS/CSRF trust boundary hardened; global deny-by-default remains Phase 4 |
| A02 Cryptographic Failures | Separate strong JWT secrets, hashed refresh/action tokens, HTTPS-only production origins |
| A04 Insecure Design | Refresh rotation/reuse handling verified; authorization opt-in risk documented |
| A05 Security Misconfiguration | Reflective credentialed CORS removed; strict origin validation added |
| A07 Identification and Authentication Failures | Session persistence, revocation, lockout, rotation, generic recovery responses, durable auth rate limits |
| A09 Logging and Monitoring Failures | Session identity and IP attribution exist; proxy-hop deployment must be verified |

## Exit status

Phase 3 remediations are complete for the confirmed CORS and cookie-origin vulnerabilities.

Full production assurance remains blocked by:

- GitHub security jobs failing before execution;
- absence of a deployed proxy/cookie verification environment;
- global deny-by-default authorization and global abuse limiting still pending;
- nonce-based CSP not yet implemented.
