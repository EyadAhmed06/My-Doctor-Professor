# Threat Model

Method: asset-driven STRIDE plus OWASP Web/API abuse cases.

## Actors

- anonymous internet user;
- authenticated student;
- malicious or compromised student;
- instructor acting inside or outside assigned courses;
- administrator;
- compromised browser/session;
- compromised dependency or CI credential;
- external identity, email and future payment provider.

## Entry points

- authentication, Google credential exchange, refresh, verification and reset;
- public bundle catalogue and health endpoints;
- every UUID/path/query/body-controlled API route;
- resource upload/download and PDF import;
- exam generation, answer save, submit and model-answer reveal;
- bundle enrollment, entitlement and future payment callbacks;
- search, notes, notifications and analytics;
- admin bootstrap, imports, backups, restore and seed scripts;
- Next.js rendering, redirects, Server Components/Actions and image/media loading.

## Required abuse tests

### Identity and session

- invalid issuer/audience/signature/expiry Google token;
- access token with wrong token type, session or user;
- revoked/expired refresh replay and rotation race;
- disabled or unverified user using a previously issued token;
- concurrent refresh requests do not log out the valid browser or create token reuse;
- logout and revoke-others invalidate server-side sessions;
- login/reset/verification endpoints resist enumeration and brute force.

### Object and function authorization

For every resource ID, test owner, another user with the same role, another role, unauthenticated user, expired entitlement and unpublished resource.

- Student A cannot read/update/delete Student B's attempt, answer, note, progress or study plan.
- Instructor A cannot mutate courses, bundles, weeks, lectures, questions or cases owned by Instructor B.
- Students cannot invoke instructor/admin mutations by calling the API directly.
- Students cannot read model answers before the server records the required submission.
- Paid, expired, unpublished and non-enrolled bundle content is denied server-side.
- List/search endpoints filter unauthorized rows before pagination/counting.

### Input and injection

- SQL metacharacters in search, sort, import and filter fields;
- arbitrary JSON properties and type-confusion payloads;
- stored/reflected XSS in questions, cases, explanations, notes, notifications and filenames;
- path traversal, double extension, polyglot, oversized and MIME-spoofed upload;
- untrusted URL and redirect SSRF/open-redirect cases;
- oversized arrays and deeply nested JSON denial of service.

### Integrity and concurrency

- duplicate enrollment, payment callback, exam generation and submission;
- submit racing answer updates;
- entitlement expiry during an active request;
- instructor unpublishes content during a student session;
- repeated notification/reminder generation;
- optimistic UI state never overrides server truth.

### Availability

- bounded body, upload, query, pagination and import sizes;
- rate limits per IP and per account;
- database queries have indexes, limits and timeouts;
- 40/200-question generation has bounded work and no duplicates;
- Next.js/React Server Component advisories monitored continuously;
- backup restore is tested and does not widen database permissions.

## Security invariants

1. A user ID from a request is never trusted as the acting identity.
2. Role checks never replace resource ownership/entitlement checks.
3. Model answers are never included in pre-submit payloads.
4. Payment UI state never grants entitlement.
5. A bundle expiry is enforced in the same backend authorization path used by every content type.
6. Error responses never expose SQL, stack traces, tokens or provider payloads.
7. Logs contain correlation identifiers, not credentials or unnecessary PII.
8. Public endpoints are explicitly enumerated; everything else is authenticated by default.
