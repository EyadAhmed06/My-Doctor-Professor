# My Doctor Professor

My Doctor Professor is a medical-learning platform for students, instructors, and system administrators.

This README is the repository entry point. Detailed project documentation is organized under [`docs/`](docs/README.md), but code must not be considered complete merely because a status document says so.

## Product output

The finished backend must provide:

- structured medical content: Semester → Course → Week → Lecture → Topic → Resource;
- reusable MCQ and essay question banks;
- timed and tutor-mode assessments with attempts, answers, flags, notes, automatic MCQ grading, and manual essay grading;
- flashcard decks with per-student spaced-repetition state;
- course, lecture, topic, question, and test progress analytics;
- notifications and immutable audit history;
- role-based workflows for students, instructors, and system administrators.

## Roles

- `STUDENT`: consumes published content, practices questions, takes assigned tests, reviews flashcards, and accesses only personal progress.
- `INSTRUCTOR`: manages authorized academic content, questions, assessments, grading, and course analytics.
- `SYSTEM_ADMIN`: manages users, platform-wide content, reports, configuration, and audit access.

Public registration must never grant instructor or system-administrator privileges. Privileged accounts are created through protected administrative workflows.

## API contract

The canonical development base URL is:

```text
http://localhost:3000/api/v1
```

All endpoint documentation and implementations must use the `/api/v1` prefix. Response field naming is defined by DTOs; database column names do not define public JSON contracts.

## Backend implementation order

1. Product definition, requirements, user stories, business rules, and final API inventory.
2. PostgreSQL schema and canonical TypeORM entities.
3. NestJS module files for every domain.
4. Controller files with every final endpoint initialized.
5. Request, query, and response DTOs.
6. Service logic, one complete workflow at a time.
7. Authorization, transactions, validation, edge cases, and audit behavior enforced during each workflow.

Business rules are specified before service implementation and enforced while logic is written; they are not postponed until the end.

Testing/validation execution and frontend implementation are outside the current implementation scope.

## Canonical backend domains

- Authentication
- Users and role profiles
- Academic structure
- Question bank
- Assessments and grading
- Flashcards
- Student progress and analytics
- Notifications
- Audit
- Administration

## Database authority

PostgreSQL migrations/schema evolution and TypeORM entities must describe the same model. Automatic schema synchronization is disabled so it cannot compete with committed database definitions.

Exactly one TypeORM class may map each table. Duplicate entity definitions are defects.

## Current status

The original `Eyad` branch contains extensive specifications, SQL schemas, seed data, a partial authentication implementation, academic entity drafts, and a default Next.js frontend.

The active backend rebuild is performed on `agent/backend-foundation-rebuild`.

## Active build sequence

- [ ] Phase 0 — reconcile specifications, endpoint naming, entities, and SQL
- [ ] Phase 1 — authentication and user foundation
- [ ] Phase 2 — all canonical entities
- [ ] Phase 3 — all modules and controller endpoint scaffolds
- [ ] Phase 4 — all DTO contracts
- [x] Phase 5 — academic workflows
- [x] Phase 6 — question-bank workflows
- [ ] Phase 7 — assessment and grading workflows
- [ ] Phase 8 — flashcard workflows
- [ ] Phase 9 — progress, notifications, audit, and administration

A backend phase is complete only when its code, database behavior, authorization rules, workflows, and edge cases are implemented consistently.
