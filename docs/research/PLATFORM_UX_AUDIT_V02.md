# My Doctor & The Professor — Research-led Platform UX Audit (v0.2)

**Audit date:** 2026-10-29. **Repository:** `EyadAhmed06/My-Doctor-Professor`, baseline `a06662c4`. **Scope:** all 53 application routes, their associated workflows and shared controls. **Status:** initial *static code and information-architecture inventory*, not live authenticated or user-tested audit. No production changes are authorized by this document.

## Human-centered design objectives

**Primary goal:** improve the complete end-to-end experience of students, instructors and administrators using evidence-based, inclusive and accessible UX design. No personality theory or single cognitive style is the design philosophy.

Evaluate each workflow against **effectiveness** (users accomplish the correct task), **efficiency** (unnecessary effort and delay are reduced), **satisfaction and trust**, **learnability**, **accessibility and inclusion**, **recovery from mistakes**, **performance**, and, where relevant, **learning effectiveness**.

Principles:
1. **Start with user goals and context.** Different roles and abilities need different interfaces; do not impose one interaction style on everyone.
2. **Optimize complete journeys, not isolated screens.** Consider discovery, preparation, action, validation, recovery and next steps.
3. **Make things clear and predictable.** Surface relevant status, consequences and error recovery; reduce unnecessary cognitive load.
4. **Use the right interaction for the task.** Tables for precise operations, hierarchies for containment, visualizations for patterns, and guided flows for complex one-time setup.
5. **Preserve user control.** Appropriate previews, safe defaults, undo where possible, and clear confirmation for irreversible changes.
6. **Design for inclusion.** Keyboard and assistive technology support, mobile layouts, readable content and accessible controls.
7. **Optimize for educational outcomes.** Student learning should prioritize comprehension, active recall, feedback and long-term retention rather than just speed.
8. **Test hypotheses.** Prefer user observation, usability testing, performance measures and learning results over taste, aesthetics alone, or personality labels.
9. **Maintain coherence.** Shared navigation, terminology, responsive patterns and design tokens across the entire platform.
10. **Improve iteratively.** Benchmark existing workflows, prioritize fixes by evidence and risk, and validate before/after results.

**Operating loop (optional useful interaction pattern, not a philosophy):** Understand the situation → Choose action → Receive feedback → Verify outcome → Recover or continue.

## Research scope and evaluation methods

Use primary HCI papers and credible syntheses, accessibility standards, cognitive ergonomics, educational psychology, visual perception, information architecture, and usability engineering. Distinguish controlled evidence from guidelines or hypotheses. Run role-based task analyses, heuristic audits, accessibility checks, performance profiling and representative user testing. Document evidence strength and contexts where findings may not generalize.

## Evidence catalogue and provenance

| ID | Reference | Application |
|---|---|---|
| UX-01 | [Nielsen usability heuristics (reviewed 2024)](https://www.nngroup.com/articles/ten-usability-heuristics/) | system status, recognition rather than recall, error prevention, user control |
| UX-02 | [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/) | keyboard, focus, accessible names, status messaging, targets |
| UX-03 | [ISO 9241-11 usability via ISO/TR 25060:2023](https://www.iso.org/obp/ui?_escaped_fragment_=iso%3Astd%3Aiso%3Atr%3A25060%3Aed-1%3Av1%3Aen) | effectiveness, efficiency, satisfaction |
| UX-04 | [Sweller et al., 1998 cognitive load](https://doi.org/10.1023/A:1022193728205) | limited working memory, appropriate instructional presentation |
| UX-05 | [Vessey, 1991 cognitive fit](https://doi.org/10.1111/j.1540-5915.1991.tb00344.x) | task-appropriate tables versus spatial representations |
| UX-06 | [Dunlosky et al., 2013 effective learning techniques](https://doi.org/10.1177/1529100612453266) | practice testing and distributed practice over passive rereading |

### Evidence classes

- **Observed in source:** route exists, component or specific action in code. This is not proof of correct runtime behavior.
- **Research-supported opportunity:** proposed change motivated by external findings; impact in this product is unmeasured.
- **Verified runtime finding:** requires authenticated screenshots, interaction traces or reproducible browser tests; do not label anything here this way until tested.
- **Measured effect:** requires an explicit baseline and after-change usability/learning evaluation.

## Exhaustive route inventory (code-derived, 53)

### Administration (9)
- `/admin/academics` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/admin/assessments` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/admin/audit` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/admin/flashcards` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/admin` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/admin/questions/import-essay` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/admin/questions/import` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/admin/questions` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/admin/users` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.

### Shared student experience (11)
- `/analytics` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/dashboard` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/guidelines` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/licenses` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/notifications` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/privacy` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/settings` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/shortcuts` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/subscription` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/terms` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.

### Learning content and access (5)
- `/anatomy/[region]` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/anatomy` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/bundles` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/resources/upload` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/studio` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.

### Assessment and reasoning (7)
- `/assessments` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/essay-practice` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/essay-practice/session` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/mock-exam/session` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/past-exams` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/rounds/case-14-02/reasoning` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/rounds` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.

### Self-regulated study (7)
- `/flashcards` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/notebook/new` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/notebook` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/notebook/pearl` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/study-plan/calendar` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/study-plan` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/study-plan/settings` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.

### Identity and onboarding (5)
- `/forgot-password` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/login` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/register` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/reset-password` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/verify-email` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.

### Instructor operations (9)
- `/instructor/assessments` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/instructor/courses` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/instructor/essay-cases` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/instructor/flashcards` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/instructor` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/instructor/questions/import-essay` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/instructor/questions/import` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/instructor/questions` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.
- `/instructor/quizzes` — audit pending: goals, entry/exit state, keyboard, responsive, errors, recovery and analytics.

## Prioritized candidate backlog (NOT final severity ratings)

| Priority | Surface | Proposed audit and improvement | Current evidence | Basis | Acceptance criteria / outcome |
|---|---|---|---|---|---|
| P0 | Question Bank: filters and explanation queue (`/instructor/questions`) | Inspect filter-to-result contract, empty/missing explanations, batch job checkpoint/retry and actual action feedback | code-confirmed bulk actions and explain_missing; correctness gaps require testing | UX-01, UX-03 | Exact missing count matches returned rows; 100% retries idempotent; no silent failures |
| P0 | MCQ import end-to-end workflow (`/instructor/questions/import`) | Audit review density, long-running explanations, broken/resumable actions, publish preview, keyboard and small-screen support | large all-in-one editor verified; specific UX pain remains unmeasured | UX-01, UX-02 | No destructive loss on refresh; keyboard-only publish; correct destination preview |
| P0 | Assessment session (`/mock-exam/session`) | Evaluate timer, question palette, annotation accessibility, autosave, review confirmation, return to unfinished questions | code-confirmed timer, highlight, strike, flags, notes and confirmation | UX-01, UX-02, UX-04 | No lost answers in network interruptions; review unanswered/flagged clearly; keyboard-only path |
| P0 | Instructor content hierarchy and locking (`/instructor/courses`) | One scoped course > week > lecture > topic matrix, explicit lock state and impact preview | known page exists; exact interaction still needs UI capture | UX-01, UX-05 | Can lock any lecture independently; permission and visibility match preview |
| P1 | Bundle setup and publication (`/bundles`) | Wizard or spreadsheet-like matrix by task; preview price, entitlements and unlocked content | code confirms publish/status/price/assessments; tradeoffs untested | UX-01, UX-05 | Create correct bundle without cross-page recall; prepublish validation |
| P1 | Study-plan and dashboard next-action clarity (`/study-plan`) | Explain recommendations, support schedule changes and recover prior plan | role/route verified, research-informed opportunity | UX-04, UX-06 | Students identify next useful action correctly; recommendations improve retention |
| P1 | Flashcard review and studio (`/flashcards`) | Retrieve-before-reveal, spaced practice, queue and resume state, consistent scheduling explanations | role/route verified, research-informed opportunity | UX-06, UX-01 | Card completion persists; scheduling explained; measurable delayed recall |
| P1 | Admin CSV user import (`/admin/users`) | Validate before submission, errors by row, duplicate handling, resumable partial failure | code confirms CSV parsing and 100-user per batch limit | UX-01, UX-03 | Each row outcome explicit; safely retry unsuccessful rows |
| P1 | Resource upload (`/resources/upload`) | Batch processing, destinations, visibility, progress, and post-upload verification | code confirms destination/upload/resource sections | UX-01, UX-02 | No ambiguous upload results; every resource has explicit destination |
| P1 | Essay cases + essay learning (`/instructor/essay-cases`) | Unify lecture/case organization and model answer formatting; ensure practices are source-grounded | code confirms per-week case editing and destructive delete confirmation | UX-01, UX-04 | Correct mapping and safe editing of cases/lectures |
| P2 | Analytics and progress explanations (`/analytics`) | Evidence before scorecards; show metric definitions, uncertainty and specific recommendations | research-informed candidate; live dashboard unobserved | UX-03, UX-05 | Users correctly interpret charts and can act on insights |
| P2 | Accessibility and responsive architecture (`*`) | Audit mobile navigation, focus order, form labels, error announcements and interaction alternatives | cross-cutting standard; compliance unverified | UX-02 | WCAG 2.2 AA audit with zero critical blockers; mobile and keyboard regression |

## Shared UX acceptance contract (all roles)

1. **Current state**: user can tell what exists, what is missing, what is blocked, what is saving and what succeeded; error messages identify recovery.
2. **Decision clarity**: actions and consequences have explicit scope; permissions, payments, locked weeks, published data and destructive effects are previewed.
3. **Task-specific representation**: use tables for row-precise admin actions, trees/matrices for academic containment, timelines for scheduling and appropriately labeled charts for trends.
4. **Recovery**: optimistic save conflicts, upload/publish failures and timed assessments preserve authorized data and show a safe retry mechanism.
5. **Accessibility**: WCAG 2.2 AA as an evaluation target; full keyboard flow, focus visibility, meaningful name/role/value, target size and status announcements.
6. **Mobile**: all critical paths work at common narrow widths without loss of function; no hover-only actions.
7. **Educational validity**: prioritize feedback, practice testing, distributed practice, correct source attribution and explanation quality; do not optimize away productive mental effort.
8. **Performance**: report interaction latency, slow-query behavior, request sizes and dropped updates; large lists use pagination/virtualization where needed.
9. **Measurement**: define task success, errors, time, backtracks, recovery and satisfaction before redesign; for student learning, add delayed retention / assessment outcomes.
10. **Governance**: feature flags and rollback for risky workflow changes; protect published exams and financial entitlement logic with dedicated regression tests.

## Audit protocol

For each route, record: role/persona; task and success condition; entry/exit; UI screenshot for desktop/mobile; actions; network behavior; hierarchy/navigation; dependencies; errors; accessibility scan; major bottleneck; evidence class; recommended change; implementation cost; risk; acceptance test; priority. Capture representative multi-step flows spanning multiple routes, not only page screenshots.

Score proposed fixes **impact × frequency × confidence / effort** as a planning aid, not a substitute for judgement. Track risk as an independent release gate. Never claim a UX issue is measured from source size alone.

## Initial execution slices

1. **Instructor: MCQ upload → inspect → explain → QA → publish → locate question in bank.** Baseline against real owned documents, record incorrect classifications and missing explanations. Check server batch cancellation/retry.
2. **Student: choose study activity → start timed assessment → highlight/flag → submit → review → choose targeted follow-up.** Verify transitions and persistence, then student comprehension.
3. **Instructor: create bundle → include course/weeks → price/plan → publish → impersonation-safe preview of student entitlement.** Validate scope and failure recovery.
4. **Administrator: user CSV import → row error resolution → device approval → permission verification.** Validate explicit per-record results.

## What this audit does *not* establish

No real-user preferences, no quantitative time reductions, no formal WCAG compliance, no complete screenshots, and no demonstrated improvements to learning outcomes. Those require further study. Do not use a cognitive-function or personality typology as the organizing principle of the interface.

## Research-to-change traceability template

| Finding ID | Route/flow | Observation & evidence | Research/heuristic | Hypothesis | Intervention | Metric/baseline | Test | Result |
|---|---|---|---|---|---|---|---|---|
| TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Unverified |
