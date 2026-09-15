# My Doctor & The Professor — Frontend/Backend/Database Integration Audit

**Audit date:** 2026-08-03  
**Scope:** Current frontend screens, NestJS controllers/DTOs/services/entities, PostgreSQL contract, and the latest supplied HTTP/CI evidence.

## 1. Executive verdict

The project currently contains two individually buildable systems that are not yet connected:

- The frontend is a polished static prototype with 18 product routes. It builds and lints successfully, but contains no API client, `fetch`, Axios call, API base URL, authentication store, or server action that talks to the backend.
- The backend is a substantial, tested domain API. Its latest supplied HTTP pipeline exercised 131 controller routes through 141 requests with zero transport failures, zero HTTP 5xx responses, zero unexpected 4xx responses, and zero Newman failures.
- The PostgreSQL-backed backend covers the original academic, assessment, flashcard, progress, notification, audit, admin, and authentication domains. It does not cover several newer product concepts visible in the finalized frontend.

Therefore the application is **not end-to-end functional yet**. A green backend pipeline proves backend behavior in isolation; it does not prove that a user can perform those workflows from the frontend.

### Current health snapshot

| Area | Status | Evidence |
|---|---|---|
| Frontend compilation | PASS | Next.js production build generated all 18 product routes |
| Frontend lint | PASS | ESLint completed with no reported problems |
| Backend compilation | PASS | `nest build` completed successfully |
| Backend lint | PASS WITH DEBT | 0 errors, 128 unsafe-typing warnings |
| Backend HTTP route pipeline | PASS | Latest supplied run: 131 routes, 141 requests, no blocking failures |
| Entity-to-PostgreSQL compatibility | PASS for the last supplied release-gate run | Compatibility is not complete drift equivalence; see database risks |
| Frontend-to-backend integration | NOT IMPLEMENTED | No HTTP/API integration code exists in the frontend |
| End-to-end browser workflow | NOT COVERED | No frontend browser tests against the real backend/database |

## 2. Source-of-truth architecture

Every working feature must complete this chain:

`Screen/action → frontend state and API client → controller endpoint → DTO validation → service/business rules → entity → PostgreSQL object → response/error UI`

At present, most frontend flows stop at local React state. The backend portions of the chain exist for some features and are missing for others.

## 3. Frontend route-to-backend contract matrix

| Frontend route | Intended capability | Backend support | Database support | Integration status |
|---|---|---|---|---|
| `/` | Public landing and curriculum discovery | No API required for static content; curriculum could use Academic APIs | Academic hierarchy exists | Static only; navigation can be wired immediately |
| `/login` | Login, remember-me, forgot password, institutional login, Google login | Email/password login and password-reset APIs exist; no Google or institutional SSO | Users, sessions, action tokens, rate limits exist | **Blocked by missing frontend auth client**; two displayed SSO actions have no backend |
| `/register` | Student registration plus academic profile | Signup exists, but request contract does not match the form | Student profile is too small for the screen | **Blocking mismatch** |
| `/dashboard` | Personalized learning dashboard | Student/instructor/admin dashboard endpoints exist | Progress/attempt/flashcard tables exist | Partial domain match; all displayed data is hardcoded |
| `/rounds` | Week/lecture question practice, confidence, explanation, likes, save, report, highlight | Questions, attempts, answers, flags, notes, review, and bookmark partially exist | No likes, issue reports, highlights, or confidence records | Core question answering can be wired; interaction layer requires new backend work |
| `/rounds/case-14-02/reasoning` | Structured clinical reasoning builder, validation, scoring, tutor/attending feedback | No module or endpoints | No reasoning-session schema | **Missing domain** |
| `/flashcards` | Student deck browsing, card flip, due reviews, difficulty rating | Strong match: decks/cards/due/progress/review APIs | Deck, card, and spaced-repetition progress tables exist | Best first integration candidate |
| `/instructor/flashcards` | Instructor creates front/back cards, drafts deck, previews, publishes | Strong match: instructor-owned deck/card CRUD and publish rules | Deck publication and cards exist | Mostly wireable; preview remains client-side |
| `/instructor/quizzes` | Draft/publish quiz builder, question bank, templates, schedule/assignment, analytics | Tests and questions cover draft/publish and question assignment; no template, bulk generation, cohort assignment, or full scheduling workflow | Core tests/questions exist; template/assignment concepts do not | Partial match; current API requires inefficient one-question-at-a-time assembly |
| `/past-exams` | Question banks, saved sets, past finals, important/liked questions, custom quiz generation | Test listing/attempts exist; no saved-set or generation endpoint; no final-source/important/like model | Core test tables exist; saved-set and reaction semantics missing | Major partial mismatch |
| `/mock-exam/session` | Timed attempt, answers, flags, notes, review | Strong core support: start/save/submit/review/flag/note | Attempts, answers, flags, notes exist | Core can be wired; scratchpad, strikeout and lab-value state are not persisted |
| `/notebook` | General notes, saved explanations, pearls, images, linked cases, collections | No notebook module | No general note/collection/link/attachment schema | **Missing domain** |
| `/notebook/new` | Rich editor, autosave, tags, resources, images, collections | No notebook endpoints or autosave contract | Missing | **Missing domain** |
| `/guidelines` | Versioned clinical study guides by week/lecture, source, revisions, bookmarks | Academic resources can hold files, but cannot represent the displayed structured guide | No guide/version/section/bookmark schema | **Missing structured domain**; do not disguise it as a generic resource without a product decision |
| `/references/drugs/lisinopril` | Drug monographs, mechanisms, safety, dosing, monitoring, references, linked questions | No drug-reference module | No drug/category/monograph/interaction/contraindication schema | **Missing domain** |
| `/study-plan` | Calendar, question targets, weak systems, recommendations, readiness | Progress analytics provide inputs, but no planner/generation APIs | No plan/calendar/availability/goal entities | **Missing workflow** |
| `/study-plan/settings` | Exam date, availability, blocked time, intensity, review cadence, targets | No study-plan settings APIs | No preference/schedule/goal schema | **Missing domain** |
| `/settings` | Profile, academic info, notifications, security, sessions/devices, theme, data export/delete | Basic profile/password and notifications exist; most settings do not | User/session basics exist; several settings domains missing | Large partial mismatch |

## 4. Blocking contract mismatches

### 4.1 Registration cannot call the current signup endpoint

The frontend form sends or displays:

- `full_name`
- `email`
- `password`
- `confirm_password`
- university/medical school
- program
- current academic year
- current semester

The backend `SignupDto` requires:

- `full_name`
- `email`
- `password`
- `phone_number`
- `role`, exactly `STUDENT`
- `student_number`
- `current_semester`
- optional `date_of_birth`
- optional `gender`

Because global validation uses `whitelist: true` and `forbidNonWhitelisted: true`, sending university, program, academic year, or confirm-password to this DTO produces a 400 response, while omitting phone, role, or student number also produces a 400 response.

**Required decision:** Update the UI to the existing institutional student model, or expand the student/profile model and signup transaction to support the finalized UI. The recommended product-aligned option is to add institution/program/year fields to a controlled academic-profile model, retain `current_semester`, and decide whether student number and phone are mandatory during public signup or collected later.

### 4.2 Authentication screens are incomplete even though auth APIs exist

Missing frontend pieces:

- typed API client and `NEXT_PUBLIC_API_URL`
- access-token and refresh-token lifecycle
- login state/provider
- protected-route and role guards
- automatic refresh with single-flight handling
- logout and expired-session handling
- forgot-password screen
- password-reset screen
- email-verification screen
- mapping of 400/401/403/409 errors to field/page messages

Displayed but unsupported backend choices:

- Google sign-in
- institutional sign-in
- true remember-me policy

### 4.3 Development ports currently conflict

The backend defaults to port `3000`. The supplied frontend was also run on port `3000`. The backend CORS fallback expects `http://localhost:3001`.

Use one explicit local convention, for example:

- backend: `http://localhost:3000/api/v1`
- frontend: `http://localhost:3001`
- backend `FRONTEND_URL=http://localhost:3001`
- frontend `NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1`

### 4.4 Frontend identifiers are presentation IDs, backend identifiers are UUIDs

Routes such as `case-14-02` and all current selections are hardcoded. Backend resources use UUIDs. The frontend must load entity IDs from list/detail APIs and either use UUID routes or resolve stable slugs to UUIDs through explicit lookup endpoints.

## 5. Existing backend coverage that should be reused

### Authentication and account security

- Student signup and verified managed-account bootstrap
- Login with verified/active-account enforcement
- Email-verification request and confirmation
- Password-forgot and password-reset workflows
- Access/refresh tokens and server-side refresh sessions
- Refresh-token rotation and reuse detection
- Logout/session revocation
- Authentication rate limiting and encrypted email outbox

### Academic structure

- Semester → Course → Week → Lecture → Topic
- Instructor-to-course ownership
- Lecture resources, real upload, file retrieval, and validation
- Publish-state and dependency-aware modification/deletion rules

### Questions and assessments

- MCQ and essay questions
- MCQ options and essay configuration
- Tags, search, filtering, duplication, activation/version protection
- Instructor ownership
- Tests scoped to course, week, or one lecture
- Draft/publish, availability window, duration, passing marks
- Attempts, answers, flags, per-attempt question notes, submission, review
- Automatic MCQ grading and manual essay grading
- Concurrency rules for active attempts and refresh sessions

### Flashcards

- Instructor/admin deck and card creation
- Front/back content, explanation, hint, difficulty and ordering
- Course/lecture/topic hierarchy validation
- Draft/published deck lifecycle
- Student due-card query and spaced-repetition review ratings
- Reviewed-card immutability and ownership/business rules

### Progress, operations, and administration

- Course/lecture/topic/question progress
- Question bookmark state
- Student/instructor/admin dashboards and analytics
- Notifications and unread state
- Audit log and CSV export
- Admin user management/import/statistics
- Liveness and database readiness endpoints

## 6. Missing or underspecified backend domains

### Priority A — required by primary student flows

1. **Question engagement**
   - likes/reactions with one reaction per user/question
   - issue reports with category, description, status, moderator resolution, and audit trail
   - text highlights with ranges/anchors and optional note
   - confidence selection recorded with each submitted answer
   - popularity queries such as most-liked questions within a lecture/week

2. **Lecture-based custom quiz generation**
   - Accept multiple lecture IDs, desired count, difficulty mix, ordering, and mode.
   - Verify all lectures belong to an allowed hierarchy.
   - Select only active questions through their topics.
   - Reject impossible counts with a useful availability breakdown.
   - Create the test and its question snapshot atomically.
   - Avoid the current client pattern of creating a test and issuing up to 200 sequential `add question` calls.

3. **Final examination workflow**
   - Explicit final/past-exam source classification
   - Fixed 200-question configuration and availability validation
   - Blueprint/distribution rules across lectures/topics/difficulty
   - Important-question and most-liked filters
   - Immutable question/version snapshot after publication

4. **Student academic profile contract**
   - Institution/medical school
   - program
   - academic year and semester semantics
   - verification state/evidence if student verification remains a product feature

### Priority B — visible major product areas

5. **Notebook**
   - General notes are not equivalent to existing `question_notes`, which belong to one test attempt and question.
   - Needs note type, title, rich content, owner, autosave/version, collections, tags, linked questions/cases/resources, attachments, favorite/review state, and safe deletion.

6. **Study planning**
   - Exam goal/date, availability blocks, protected time, daily/weekly targets, review cadence, weak-system weighting, generated schedule, completion, regeneration, and plan versioning.

7. **Clinical reasoning builder**
   - Case definition, reasoning session, selected symptoms/differentials/investigations/diagnosis/management, validation rubric, score dimensions, hints, and instructor feedback.

8. **Study guides/guidelines**
   - Decide whether these are course-authored study guides or externally sourced clinical guidelines.
   - The displayed UI requires structured sections, source metadata, publication/review dates, versions, revisions, bookmarks, and lecture linkage; generic resource uploads alone are insufficient.

9. **Drug reference**
   - Categories, drug monographs, brands/classes, indications, mechanism, dosing, contraindications, adverse effects, interactions, monitoring, pregnancy/lactation/renal/hepatic data, citations, versions, bookmarks, and linked questions.

### Priority C — settings and platform completeness

10. Study preferences and notification preferences
11. Two-factor authentication
12. Session/device list, revoke-one, and logout-all
13. User data export and self-service account deletion workflow
14. Help/support requests
15. Subscription/billing only if monetization returns; it should currently be removed from Settings to match the earlier decision to remove monetization
16. Google and institutional SSO only if retained in the UI

## 7. Important semantic mismatches inside partially supported features

| Feature | Current backend behavior | Frontend expectation | Required reconciliation |
|---|---|---|---|
| Custom quiz scope | A Test can reference one course, one week, or one lecture | Student selects several lectures | Add many-to-many generation scope or snapshot source metadata |
| Test assembly | Questions added individually | One-click generation, up to 200 questions | Add transactional bulk/generate endpoint |
| Saved set | No student saved-test-set entity | Saved Sets tab and reuse | Add saved set + items, or formally define saved draft tests with ownership |
| Important/liked | Tags and bookmark exist | Important Questions and Most Liked | Tag is editorial; bookmark is private. Add separate importance/reaction semantics |
| Question note | Bound to attempt + question | Reusable notebook content | Create notebook domain; do not reuse attempt note |
| Confidence | Not part of answer DTO/entity | 1–5 confidence before submission | Add answer confidence and analytics rules |
| Question report | No report workflow | Red-flag/report problem action | Add moderated report entity and endpoints |
| Highlight | No persisted highlight | User highlights question/explanation text | Add stable text anchoring/version handling |
| Flashcard draft | Deck has `is_published`; cards have `is_active` | Draft cards and publish workflow | Treat deck as publish unit, or add card draft state intentionally |
| Flashcard rating | `VERY_HARD`, `HARD`, `GOOD`, `EASY` | Again, Hard, Good, Easy | Map “Again” to `VERY_HARD` in the client or rename contract consistently |
| Mock scratchpad/strikeout | No persistence | State survives navigation/reload | Decide local-only vs server-persisted attempt state |
| Lab values | Not modeled as question data | Per-question lab panel | Add structured question attachments/context if real content requires it |
| Theme | Local storage only | Cross-page theme | Current behavior is acceptable; account sync is optional |
| Instructor nav | Present in shared shell | Backend correctly role-protects endpoints | Hide/redirect by authenticated role, not just disabled buttons |

## 8. Database assessment

The runtime model currently contains 37 entity mappings across users/auth, academic content, questions/tests, flashcards, progress, notifications, and audit.

### What the existing schema checker proves

- Required entity columns, types, nullability, length/precision
- Enum values/order
- Foreign-key targets and delete behavior

### What it does not completely prove

- Primary keys and defaults
- Unique and check constraints
- Indexes and partial indexes
- Views, functions, and triggers
- Unexpected tables or columns
- Extensions as a declared set
- PostgreSQL grants and role attributes
- Complete equality between clean-bootstrap and upgraded databases

The database is suitable for integrating existing modules, but every new UI-only domain above needs a deliberate entity/schema/migration design. Do not turn on TypeORM synchronization. Each schema change must have one migration owner and must be tested on both a clean database and the deployed upgrade path.

## 9. API and frontend integration foundation to build once

Before wiring individual pages, add:

1. Environment validation for `NEXT_PUBLIC_API_URL`.
2. One typed API transport with JSON/multipart/download support.
3. Standard parsing of backend validation and problem responses.
4. Auth state initialized through `/auth/me`.
5. Access-token injection and single-flight refresh handling.
6. Role-aware route guards and navigation.
7. Query/cache strategy with cancellation, loading, empty, error, and retry states.
8. Generated or manually shared TypeScript request/response contracts.
9. UUID/slug route policy.
10. End-to-end tests that start frontend + backend + PostgreSQL and execute real browser workflows.

## 10. Recommended execution order

### Phase 0 — freeze the contract

- Confirm which finalized screens are in v1.
- Remove unsupported placeholders that are not v1, especially monetization/SSO if intentionally postponed.
- Approve the registration/student-profile contract.
- Create a versioned API specification from controllers/DTOs and add response schemas, not only request schemas.

### Phase 1 — integration foundation

- Resolve ports/CORS/environment variables.
- Implement API transport, auth/session provider, guards, error handling, and shared types.
- Add login, signup, verification, forgot/reset-password, refresh, me, and logout flows.

### Phase 2 — academic read model

- Wire semester/course/week/lecture/topic navigation.
- Replace every hardcoded academic ID and count.
- Load resources and progress.

### Phase 3 — flashcards end to end

- Instructor create/edit/publish deck and cards.
- Student browse/flip/due/review.
- This is the highest-value flow with the smallest backend gap.

### Phase 4 — question and assessment core

- Question listing/detail/options.
- Test listing/start/answer/flag/note/submit/review.
- Instructor question/test CRUD and publish.
- Add UI state for 400/401/403/404/409, not generic failures.

### Phase 5 — client-requested question enhancements

- Multi-lecture quiz generation.
- Confidence, likes, reports, highlights.
- Final 200-question workflow, important questions, most-liked views, saved sets.

### Phase 6 — dashboards and notifications

- Replace mock statistics with existing endpoints.
- Reconcile displayed metrics with exact backend definitions.
- Add notification inbox/unread behavior.

### Phase 7 — new domains

- Notebook
- Study planner
- Clinical reasoning builder
- Study guides/guidelines
- Drug reference

Implement each as `requirements → user stories → API contract → entities/migration → module → controller/DTO → service/business rules → integration → tests`, not as UI-only additions.

### Phase 8 — settings and production hardening

- Profile/preferences/session security/data rights.
- Browser E2E tests, accessibility, load/security checks, RDS backup/restore and rollback rehearsal.
- Reduce backend unsafe-type lint warnings and add frontend observability.

## 11. Definition of done for “100% functional”

A screen is not complete merely because it renders. For every user action, require:

- a documented API contract and authorization rule
- DTO validation and business-rule coverage
- matching entity and migration where persistence is required
- loading, empty, success, validation, permission, conflict, not-found, and retry UX
- no unhandled 500 response for expected input or state
- idempotency/concurrency handling for double clicks and parallel requests
- integration test against PostgreSQL
- browser E2E test through the real frontend
- analytics/audit behavior where required
- accessibility and responsive verification

## 12. Immediate next implementation slice

The safest next slice is:

1. Fix the registration/profile contract.
2. Build the shared frontend API/auth foundation.
3. Integrate the complete auth lifecycle.
4. Integrate academic hierarchy reads.
5. Integrate instructor and student flashcards.

This produces the first genuinely end-to-end usable path while keeping the larger missing domains out of the critical path.
