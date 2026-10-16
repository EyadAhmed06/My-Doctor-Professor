# Production Reliability Program — Assessment First

Status: implementation plan and release criteria, not a claim that all website functionality has been tested.

## Goal
Students should never serve as the primary bug-reporting mechanism. Find regressions before release, detect incidents quickly after release, and preserve evidence for fast diagnosis.

## Coverage map
| Surface | Critical end-to-end journey | Contract and failure assertions |
| --- | --- | --- |
| Authentication | Signup, verification, login, refresh, logout, recovery, device limits | Session lifetime, authorization, invalid token, concurrent login |
| Academic organization | Course, week, lecture, topic, locks | Owner permissions, reorder-independent locks, delete safeguards |
| MCQ import | One question, one section/lecture, full PDF, JSON | Exact source key, selection-only publication, idempotence, question marks |
| Essay import | Cases + lectures, single case/lecture, answer formatting | Bullet/paragraph fidelity, draft/publish separation, destination mapping |
| Bundles | Free, paid, plans, entitlements, revoked/expired/pending | Unauthorized access denied, payment audit retained, independent plans |
| Practice quiz | One topic, multiple lectures, max-length, tutor/timed | DB constraints, valid marks/options, idempotency, cross-course guard |
| Attempts | Start, answer + confidence, notes, flags, submit, review, resume | Server ACK visible, concurrent retry, timeout, reload and cross-device |
| Annotations | Highlight, erase, strike, draw, save, reload, other browser | Revision conflicts, ownership, payload bounds, interrupted connection |
| Student analytics | Progress, dashboard, review, achievements | Counts and saved state match actual attempts |
| Instructor authoring | Create/edit/lock/publish/delete, upload resources | Role scoping, visibility, media accessibility |
| UI | 320px phone, Android WebView, iPhone Safari, tablet, desktop | No clipped controls, overlapping navigation, RTL, touch target size |
| Operations | CI, migrations, container health, deploy and rollback | Pinned release, readiness checks, zero unnoticed failure |

## Test strategy
1. **Static**: TypeScript builds, lint, dependency audit, secret scanning, SQL interpolation audit.
2. **Unit/contract**: validator, permission and transaction tests, database migration schema assertions, limit tests.
3. **Full-stack integration**: throwaway PostgreSQL with real migrations, seeded courses, sample students and representative imported questions; call actual HTTP endpoints. Mock only truly external payment/LLM services.
4. **Browser journeys**: Playwright against the full-stack integration environment. Cover critical instructor-to-student sequences, not only mocked API endpoints. Run both iOS Safari WebKit and Chromium Android profiles for mobile.
5. **Exploratory and visual**: periodic screenshot/regression review of source-backed question UIs, notes, RTL, empty/error states and paid plans.
6. **Staging release rehearsal**: production-equivalent app containers and migration rehearsal, synthetic quiz creation/resume, verify schema and permissions; NEVER write synthetic tests to production student accounts.
7. **Production observability**: exception tracking with privacy safeguards, error rate and latency alerts, database constraint name logged server-side, uptime/health probes and alert routing. Release only on green critical gates; rollback on measurable regression.

## Critical test data
- One/three/seven lecture bundles; 4-option and 5-option MCQs
- Correct marks, zero marks, negative marks, blank options, inconsistent source answer
- 176-question multi-lecture quiz and 200-question final with exact distribution
- Mid-session cross-device reload of answers, notes, highlights and pen drawings
- Real timed expiry; reconnect after network failure; duplicate submit and race conditions
- Student active, revoked, pending payment, expired, different-course user
- Arabic and English in portrait and landscape, light and dark theme

## Release gates
- No uncovered critical student journey (quiz creation, answer save/resume, entitlement, payments).
- Zero high-severity accessibility blockers and no known breaking mobile UI overlap.
- Database-backed integration suite passes against the exact migration set.
- Smoke checks produce version-specific evidence after deployment.
- Failed migration or degraded health automatically blocks/rolls back application deployment.
- Staging vs production config differences are documented.
- Incident has an actionable runbook and correlation ID, not only a generic toast.

## Limits
100% of all possible functionality, devices, network scenarios and inputs is not a mathematically achievable guarantee. A comprehensive test inventory plus risk-based release gates, production monitoring, and rapid rollbacks reduces student-discovered incidents; it cannot promise zero bugs.

## Immediate priorities
1. Validate annotation migration, auth, save/reload/concurrency and WebKit mobile operation.
2. Reproduce PostgreSQL quiz check-constraint errors against seeded DB and real request payloads.
3. Add true backend-backed practice creation -> answer -> exit -> resume -> review E2E.
4. Audit all user roles and device-width variants for primary flows.
5. Connect error alerts to a maintainer-owned channel; prohibit red CI deployment.
