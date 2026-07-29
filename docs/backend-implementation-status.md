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

### Assessments and grading

- Instructor-owned and administrator-managed test definitions
- Course, week, and lecture scope validation
- Draft, publish, immutability, and availability rules
- Question assignment with synchronized total marks
- Single-active-attempt enforcement
- Timed and availability-window auto-expiry
- Student-owned answers, flags, and notes
- Tutor-mode feedback without timed-mode answer leakage
- Automatic MCQ grading and manual essay grading with feedback
- Transactional, idempotent attempt finalization
- PostgreSQL constraints and migration-safe schema alignment

### Flashcards and spaced repetition

- Instructor-owned and administrator-managed decks
- Canonical course, lecture, and topic scope validation
- Draft/publish lifecycle and active-card requirements
- Reviewed-card immutability and protected deletion
- Student-only progress ownership
- Due-card pagination and filtering
- Serialized concurrent reviews
- SM-2-style ease-factor and interval scheduling
- Recall streaks, correctness counts, mastery, and mastery revocation
- PostgreSQL constraints, indexes, and migration-safe schema alignment

### Student progress and analytics

- Student-owned lecture completion and time tracking
- Monotonic course and lecture completion
- Question bookmarks
- Question metrics synchronized from finalized assessment answers
- Topic accuracy, coverage, confidence, and mastery calculations
- Course completion and normalized assessment averages
- Student, instructor, and administrator dashboards
- Question, test, and student-performance analytics
- Instructor ownership boundaries and administrator-wide reporting
- PostgreSQL retention constraints and migration-safe entity alignment

### Notifications

- Instructor and administrator notification creation
- Active-recipient validation and instructor-to-student boundaries
- Transactional fan-out to recipient inbox rows
- Paginated inbox filtering by status and type
- Per-user unread counts
- Idempotent single and bulk read transitions
- Per-user deletion without removing shared notifications
- Safe internal target paths without open redirects
- PostgreSQL read-state constraints and inbox indexes

### Audit

- PostgreSQL-enforced append-only audit history
- Global successful mutation logging
- Failed handled-request logging
- Authentication, assessment, bookmark, flashcard, report, and export action classification
- Recursive credential and token redaction
- Bounded metadata depth, size, and string lengths
- Actor, entity, request origin, and user-agent capture
- Administrator-only pagination and filtering
- Date-bounded CSV export with spreadsheet-injection protection
- Best-effort audit writes that do not reverse completed business operations

## Next domain

Administration and final cross-module consistency review.

## Scope constraints

Testing execution and frontend implementation remain outside the current backend implementation phase. Deployment occurs only after the full project is complete. No AWS integration is planned.
