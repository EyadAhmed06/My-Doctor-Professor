# Phase 2 — Data and Content Security Controls

Date: 2026-08-25  
Branch: `agent/phase1-interactions`

## Scope

Phase 2 reviewed the authorization and data-exposure boundaries for:

- course, week, lecture, and resource access;
- bundle enrollment and paid entitlement;
- MCQ practice generation and test attempts;
- essay case authoring, submission, and model-answer reveal;
- uploaded resource storage and delivery;
- database operational privileges.

This phase follows the Phase 1 threat model and access-control matrix. The goal is to prevent IDOR/BOLA, expired or unpaid access, answer leakage, unsafe ownership claims, and unsafe file handling.

## Remediations completed

### 1. Instructor course ownership can no longer be claimed implicitly

Previously, an instructor entering the essay-case workflow could become assigned to an unowned course through an automatic insert into `course_instructors`. This converted a read/write request into an authorization grant.

Now:

- instructors must already be explicitly assigned to the course;
- only the administrative assignment workflow can create that relationship;
- unassigned instructors receive a forbidden response;
- a regression test verifies that no implicit insert occurs.

Commit: `0d56bfde317c5b722571cd29db821bc775a472b1`

### 2. Essay model answers are not selected before reveal

For unrevealed student cases, the backend no longer fetches `model_answer` from PostgreSQL and then removes it from the response. The sensitive column is omitted from the query itself until the actor is authorized to reveal it.

This reduces accidental serialization, logging, debugger, and future refactor leakage.

Commit: `0d56bfde317c5b722571cd29db821bc775a472b1`

### 3. MCQ generation requires a live entitlement

MCQ practice generation now requires all of the following:

- enrollment status is `ACTIVE`;
- enrollment start time has passed;
- enrollment has not expired;
- payment is either `NOT_REQUIRED` or `PAID`;
- bundle status is `PUBLISHED`;
- bundle availability window is current;
- lecture is published;
- every requested lecture belongs to the entitled bundle.

Archived, expired, scheduled, revoked, and unpaid access is denied.

Commit: `1aea4c703da40a387fbdac56b72bbe3696ced5d8`

### 4. Test catalog, launch, and custom practice use the same entitlement boundary

The same live-entitlement predicate is now applied to:

- student test listing;
- individual test access and attempt start;
- question-bank curriculum/catalog access;
- 40- and 200-question custom practice generation.

Question-bank counts and generation are restricted to active `MCQ` questions; essay questions cannot accidentally inflate eligibility or enter an MCQ exam.

Commit: `c63bfad2269e3d4831acff5fe8df1cb2d9ed7cc8`

### 5. Test answers remain secret during an open attempt

The student question view excludes:

- option correctness;
- option explanations;
- question explanation and hint;
- instructor/creator details;
- essay model-answer configuration.

Full answers are returned only after submission or expiry through the review flow. Tutor mode returns the explanation only after that specific answer is saved.

Regression coverage: `8d369e73b8de73b23a20268ae3601914d84c0490`

## Regression tests added

- `essay-cases.service.security.spec.ts`
  - rejects implicit instructor ownership;
  - excludes model answers from unrevealed student queries.
- `mcq-practice.service.security.spec.ts`
  - rejects missing live entitlement;
  - asserts active/current/paid-or-free/published SQL predicates.
- `tests.service.security.spec.ts`
  - rejects practice access without the complete entitlement predicate;
  - asserts correctness and explanations are removed from student question views.

## Upload review

Existing positive controls:

- endpoint requires JWT and instructor/admin role;
- application-level course ownership checks are used by the academic service;
- file size is checked;
- magic bytes are validated rather than trusting the extension;
- declared MIME must match detected content;
- allowed types are explicitly enumerated;
- storage keys are UUID-based and path-contained;
- files are created exclusively with mode `0600`;
- downloads perform resource-level authorization.

Open remediation:

1. **High — malware scanning/quarantine is absent.** Add an asynchronous scanner and quarantine state before a file becomes student-readable.
2. **Medium — uploads are buffered in process memory.** Stream to a bounded quarantine location to reduce memory-exhaustion risk.
3. **Medium — Multer has a fixed 50 MiB limit while storage uses configuration.** Make both limits derive from one validated configuration value.
4. **Medium — active-content delivery policy needs tightening.** Prefer attachment or a sandboxed viewer for formats that do not require inline rendering, and explicitly set download security headers.

## Database operational findings

1. **High design risk — runtime DDL.** `TestsService.onModuleInit` performs `ALTER TABLE`, constraints, and indexes. Production application credentials therefore need schema-modification rights. Move all runtime DDL to versioned migrations, then revoke DDL privileges from the application role.
2. **Medium — entitlement policy is duplicated in raw SQL.** The corrected predicates are aligned, but duplication can drift. Phase 3 should introduce one canonical entitlement query/service and use it across bundles, academic content, tests, flashcards, essays, and analytics.
3. **Positive — TypeORM synchronize is disabled.**
4. **Positive — reviewed raw SQL uses bound parameters for attacker-controlled values.**
5. **Verification required — production role grants, RLS posture, backup encryption, restore testing, and audit-log retention cannot be proven from application source alone.**

## OWASP mapping

| Risk | Phase 2 control |
|---|---|
| A01 Broken Access Control | Explicit course assignment; live bundle entitlement; attempt ownership; resource-level authorization |
| A02 Cryptographic Failures | No sensitive answer fields returned pre-review; production DB/TLS configuration remains an operational verification item |
| A03 Injection | Parameterized SQL for reviewed entitlement and content queries |
| A04 Insecure Design | Removed implicit authorization grant; documented canonical-policy and runtime-DDL design debt |
| A05 Security Misconfiguration | Identified runtime DDL and upload-policy gaps |
| A08 Software and Data Integrity Failures | File magic-byte validation and immutable UUID storage names |
| A09 Logging and Monitoring Failures | Sensitive answer columns are no longer unnecessarily loaded; audit retention still needs operational validation |
| A10 SSRF | Resource uploads do not fetch user-controlled remote URLs in the reviewed file-upload path |

## Exit status

Phase 2 code remediation is complete for the verified authorization and answer-secrecy defects above.

It is **not** valid to claim full production assurance yet because:

- the GitHub security workflow is currently failing before jobs execute;
- production database grants and infrastructure controls were not available for verification;
- malware scanning and runtime-DDL removal remain open.

Phase 3 should cover authentication/session hardening, global deny-by-default authorization, CORS/CSP, CSRF analysis, secrets, rate limiting, and abuse controls.
