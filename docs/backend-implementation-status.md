# Backend Implementation Status

## Active branch

`agent/backend-foundation-rebuild`

## Completed domains

### Authentication

- PostgreSQL-backed sessions
- Access/refresh token rotation and revocation
- Email verification
- Password reset
- Encrypted email outbox
- PostgreSQL-backed abuse throttling
- Argon2id password hashing with gradual bcrypt migration

### Academic structure

- Semester, course, week, lecture, topic, and resource workflows
- Active-course and published-lecture visibility
- Draft/publish rules
- Safe hierarchy deletion rules
- Pagination, filtering, search, and PostgreSQL error mapping

### Question Bank

- MCQ and essay question workflows
- Draft-to-active lifecycle
- Creator ownership for instructors
- Administrator-wide management
- MCQ option validation
- Essay configuration validation
- Tags and question-tag assignments
- Question duplication
- Version increments
- Student-safe response projection

## Next domain

Assessments, attempts, answer submission, automatic MCQ grading, manual essay grading, and attempt finalization.

## Scope constraints

Testing execution and frontend implementation remain outside the current backend implementation phase. Deployment occurs only after the full project is complete. No AWS integration is planned.
