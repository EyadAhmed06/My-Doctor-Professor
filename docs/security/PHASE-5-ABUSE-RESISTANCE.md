# Phase 5 — Abuse Resistance and Distributed Request Budgets

Date: 2026-08-25  
Branch: `agent/phase1-interactions`

## Objective

Extend protection beyond login throttling so authenticated accounts, uploads, imports, exam generation, public catalog traffic, and provider webhooks cannot consume unbounded application or database resources.

## Global durable limiter

A second global Nest guard now runs after the global JWT guard.

Identity model:

- authenticated traffic is budgeted by persisted user ID;
- anonymous traffic is budgeted by resolved client IP;
- endpoint policies can explicitly force IP scope.

Default budgets:

- authenticated: 1,200 requests per 15 minutes per user;
- anonymous: 300 requests per 15 minutes per IP.

The limiter reuses the PostgreSQL-backed `auth_rate_limits` store. It therefore remains consistent across multiple Nest instances; it is not an in-memory limit that can be bypassed by load-balancer rotation or process restart.

Rate-limit responses include a standards-compatible `Retry-After` header.

Commits: `9920920`, `e5a9c2e`, `da4ed22`, `21be96d`, `240438a`

## High-cost endpoint policies

| Operation | Budget |
|---|---:|
| Managed lecture file upload | 20/hour/user |
| MCQ PDF inspect/enrichment | 10/hour/user |
| MCQ import publish | 20/hour/user |
| Essay PDF inspect | 10/hour/user |
| Essay import publish | 20/hour/user |
| Summer essay seed import | 5/hour/user |
| 40/200 MCQ practice generation | 30/hour/user across both generation routes |
| Paymob webhook | 300/15 minutes/IP |

Using the same `practice-generate` key on both legacy and current generation endpoints prevents route switching from doubling the allowance.

Commits: `6ea69e1`, `41cda3d`, `0119c9c`, `33ab200`, `2128add`, `7fc7308`, `03a88f9`

## Health-probe edge case

Database-backed limiting must not sit in front of liveness. If PostgreSQL is unavailable, a limiter query would make liveness fail and could cause an orchestrator restart loop.

`HealthController` therefore uses an explicit `@SkipRateLimit()` classification:

- liveness stays independent of limiter storage;
- readiness continues to report dependency health through the health service;
- the bypass is visible and security-reviewable.

Commits: `7195722`, `aff99ad`, `08d4ea6`

## Regression coverage

`request-rate-limit.guard.spec.ts` verifies:

- authenticated requests use durable user budgets;
- anonymous requests use IP budgets;
- endpoint-specific policies override defaults;
- rejected requests expose `Retry-After`.

Commit: `f0f5c80`

## Threats reduced

- credential stuffing distributed across application instances;
- authenticated scraping and automated enumeration;
- memory/CPU exhaustion through repeated PDF parsing;
- AI-enrichment cost exhaustion;
- storage exhaustion through repeated file uploads;
- database growth through repeated practice-test generation;
- webhook flooding before signature processing can dominate capacity;
- bypass by alternating between duplicate generation endpoints.

## Design constraints and open findings

### Database limiter availability

PostgreSQL is currently the limiter store. This gives consistency but means ordinary requests perform a limiter write.

Implications:

- PostgreSQL latency is added to requests;
- a database outage blocks non-health traffic;
- high traffic can create contention on hot keys.

For the expected application size this is safer than per-instance memory limits. Before larger scale, move the same atomic policy to Redis or another dedicated shared limiter.

### Expired-key retention

Unique attacker IPs can grow `auth_rate_limits`. Add a scheduled cleanup job that removes expired rows after a short forensic retention period. The cleanup must be batched and indexed to avoid long locks.

### Proxy trust

IP budgets are only trustworthy when `TRUST_PROXY_HOPS` exactly matches the deployment. A permissive proxy configuration can allow spoofed forwarded IPs; an insufficient value can rate-limit all users under the proxy address.

### Webhook defense layers

Rate limiting is not webhook authentication. Paymob still requires valid HMAC, transactional row locking, and idempotent transitions. Future work should additionally store provider event identifiers and alert on conflicting callbacks.

### Distributed denial of service

Application limiting is not volumetric DDoS protection. Production still needs edge controls such as CDN/WAF/load-balancer connection limits and request-body limits before Nest receives traffic.

## OWASP mapping

| Area | Phase 5 control |
|---|---|
| A04 Insecure Design | Explicit resource budgets for expensive workflows |
| A05 Security Misconfiguration | Health-probe limiter dependency handled explicitly |
| A07 Authentication Failures | Existing auth limits plus global anonymous/user budgets |
| A08 Data Integrity Failures | Webhook flooding constrained while HMAC/idempotency remain authoritative |
| A09 Monitoring Failures | Stable hashed limiter keys and explicit Retry-After behavior |
| API4 Unrestricted Resource Consumption | Upload/import/generation-specific budgets |
| API6 Unrestricted Access to Sensitive Business Flows | Practice generation and publishing workflows constrained |

## Exit status

Phase 5 source remediation is complete for global and high-cost request budgets.

Runtime success is not claimed because GitHub security jobs still fail before executing. Production tuning requires observed traffic, proxy topology, database capacity, and false-positive metrics.
