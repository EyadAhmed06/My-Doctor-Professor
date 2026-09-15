# Frontend–Backend Integration Status

Updated: 2026-08-03

## Rule

Authenticated product pages must render server-owned data. When no records exist, the UI shows an honest empty state. It must not substitute demo users, counts, exams, notes, drugs, schedules, progress, or statistics.

## Connected flows

| Product area | Frontend route | Backend ownership |
|---|---|---|
| Authentication | `/login`, `/register`, verification/reset routes | `auth/*`, rotating sessions, verified accounts |
| Role dashboard | `/dashboard` | `dashboard/student`, `dashboard/instructor`, `dashboard/admin` |
| Academic hierarchy | `/rounds` | semesters → courses → weeks → lectures → resources |
| Assessments | `/past-exams`, `/mock-exam/session` | tests, questions, attempts, answers, submission/review |
| Flashcards | `/flashcards`, `/instructor/flashcards` | instructor decks/cards and student spaced-repetition progress |
| Notebook | `/notebook`, `/notebook/new` | user-owned `notebook_notes` CRUD |
| Study plan | `/study-plan`, `/study-plan/settings` | one concurrency-safe `student_study_plans` row per student |
| Drug references | `/references/drugs/lisinopril` | published references for students; instructor/admin authoring API |
| Study resources | `/guidelines` | academic lecture resources; no fabricated guideline library |
| Notifications | `/notifications` and shell badge | notification list, unread count, mark-read, delete |
| Profile/security | `/settings` | current user profile, profile update, password change |
| Instructor workspace | `/instructor/quizzes` | instructor-owned tests and live aggregate counts |

## Removed mock surfaces

- The old static dashboard component and the monolithic prototype page component were removed.
- Fixed names, XP, course counts, exam cards, notebook cards, drug content, and notification counts are no longer used by active application routes.
- Unsupported billing, subscription, device-session management, and clinical-reasoning-builder data is not presented as if it exists.

## New persisted backend domains

Migration `AddStudentWorkspace1840000000000` adds:

- `notebook_notes`: private user-owned notes with type, content, metadata, timestamps, ownership and indexes.
- `student_study_plans`: a unique student plan with exam and workload targets.
- `drug_references`: instructor/admin-authored, publishable structured drug content.

The study-plan initializer uses an insert-on-conflict strategy so concurrent first requests do not produce a unique-constraint 500. Drug slugs are normalized and checked for conflicts on create and update.

## Intentional gap

`/rounds/case-14-02/reasoning` now displays an explicit unavailable state instead of a fake completed clinical pathway. A production clinical-reasoning builder needs its own case/session/step/evidence schema and endpoints; it must not be inferred from static UI copy.

## Verification baseline

- Frontend: ESLint and Next.js production build.
- Backend: ESLint, Nest production build, Jest unit suite.
- Controller/Postman inventory: 143 unique controller routes with generated collection coverage.
- Auth client: concurrent 401 responses share one refresh operation, preserving backend refresh-token rotation guarantees.

## Deployment order

1. Deploy the backend and run TypeORM migrations.
2. Configure the frontend API base URL to the deployed `/api/v1` backend.
3. Create real academic content, instructor assessments/flashcards, and published drug references.
4. Deploy the frontend only after backend readiness succeeds.
