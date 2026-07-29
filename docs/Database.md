# Medical Learning Platform Database Documentation

> **Version:** 1.0  
> **Database:** PostgreSQL 18  
> **Database Name:** `My_Doctor_Professor`

---

# Table of Contents

1. Project Overview
2. Technology Stack
3. Database Architecture
4. Database Modules
5. PostgreSQL Extensions
6. ENUM Definitions
7. Database Execution Order
8. Module Overview
9. Relationships
10. Naming Conventions
11. Primary Keys
12. Foreign Keys
13. Constraints
14. Indexes
15. Triggers
16. Views
17. Seed Files
18. Backend Development Notes
19. DTO Guidelines
20. Validation Rules
21. Transactions
22. Environment Variables
23. Future Improvements

---

# 1. Project Overview

The Medical Learning Platform is an AI-powered educational platform designed for medical students.

The database stores:

- Users
- Academic hierarchy
- Questions
- Tests
- Flashcards
- Student progress
- Notifications
- Audit logs

The database is fully normalized and built using PostgreSQL.

---

# 2. Technology Stack

Database

- PostgreSQL 18

Administration

- pgAdmin 4

Backend

- NestJS

Frontend

- Next.js

ORM

- (To be decided by backend team)

Primary Keys

- UUID

Extensions

- pgcrypto
- citext

Special PostgreSQL Features

- JSONB
- ENUM
- UUID
- CITEXT
- Triggers
- Views
- Indexes

---

# 3. Database Architecture

```
Semester
    │
    ▼
Course
    │
    ▼
Week
    │
    ▼
Lecture
    │
    ▼
Topic
    │
    ▼
Question
```

Student data

```
User
 ├── Student
 ├── Instructor
 └── System Admin
```

---

# 4. Database Modules

## User Module

Stores

- Users
- Students
- Instructors
- System Admins
- Instructor Availability

---

## Academic Module

Stores

- Semesters
- Courses
- Weeks
- Lectures
- Topics
- Resources

---

## Question Bank Module

Stores

- Questions
- MCQ Options
- Essay Configurations
- Tags

---

## Assessment Module

Stores

- Tests
- Test Questions
- Test Attempts
- Student Answers
- Notes
- Flags

---

## Flashcards Module

Stores

- Flashcard Decks
- Flashcards
- Student Flashcard Progress

---

## Student Progress Module

Stores

- Course Progress
- Lecture Progress
- Topic Progress
- Question Progress

---

## Notification Module

Stores

- Notifications
- User Notifications

---

## Audit Module

Stores

- Audit Logs

---

## Performance Module

Contains

- Views
- Triggers
- Performance indexes

---

# 5. PostgreSQL Extensions

Required:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
```

---

# 6. ENUM Definitions

## role

```
STUDENT
INSTRUCTOR
SYSTEM_ADMIN
```

## user_status

```
ACTIVE
PENDING_VERIFICATION
SUSPENDED
DEACTIVATED
```

## gender

```
MALE
FEMALE
```

## resource_type

```
PDF
VIDEO
IMAGE
LINK
```

## upload_status

```
UPLOADED
PROCESSING
COMPLETED
FAILED
```

## question_type

```
MCQ
ESSAY
```

## question_difficulty

```
EASY
MEDIUM
HARD
```

## test_mode

```
TIMED
TUTOR
```

## test_type

```
LECTURE
WEEK
COURSE
CUSTOM
QUESTION_BANK
```

## test_attempt_status

```
NOT_STARTED
IN_PROGRESS
SUBMITTED
EXPIRED
```

## notification_type

```
SYSTEM
COURSE
LECTURE
FLASHCARD
TEST
REMINDER
GRADE
ANNOUNCEMENT
ACHIEVEMENT
```

## notification_status

```
UNREAD
READ
```

## audit_action

```
LOGIN
LOGOUT
PASSWORD_RESET_REQUEST
PASSWORD_CHANGED
CREATE
UPDATE
DELETE
UPDATE_PROFILE
START_TEST
SUBMIT_TEST
AUTO_SUBMIT_TEST
BOOKMARK_QUESTION
REMOVE_BOOKMARK
REVIEW_FLASHCARDS
VIEW_REPORTS
EXPORT_DATA
```

---

# 7. Database Execution Order

## Extensions

```
00_extensions.sql
```

## Enums

```
01_enums.sql
```

## Schemas

```
01_users.sql
02_academic.sql
03_question_bank.sql
04_assessment.sql
05_flashcards.sql
06_student_progress.sql
07_audit.sql
08_notifications.sql
09_performance.sql
```

## Seeds

```
01_users_seed.sql
02_academic_seed.sql
03_question_bank_seed.sql
04_assessment_seed.sql
05_flashcards_seed.sql
06_student_progress_seed.sql
07_audit_seed.sql
08_notifications_seed.sql
09_demo_data.sql
```

---

# 8. Tables

## User Module

### users

Purpose

Stores authentication and common user information.

Important columns

- id
- full_name
- email
- password_hash
- phone_number
- role
- status
- email_verified
- failed_login_attempts
- locked_until
- last_login_at
- created_at
- updated_at

---

### students

Purpose

Stores student-specific data.

Columns

- user_id
- student_number
- current_semester

---

### instructors

Columns

- user_id
- specialization
- office_location
- biography

---

### instructor_availability

Columns

- instructor_id
- day_of_week
- start_time
- end_time

---

### system_admins

Columns

- user_id
- employee_number
- is_super_admin

---

## Academic Module

### semesters

Stores semester information.

### courses

Stores courses.

### weeks

Stores course weeks.

### lectures

Stores lectures.

### topics

Stores lecture topics.

### resources

Stores lecture resources.

---

## Question Bank Module

Tables

- questions
- mcq_options
- essay_configurations
- tags
- question_tags

---

## Assessment Module

Tables

- tests
- test_questions
- test_attempts
- student_answers
- question_flags
- question_notes

---

## Flashcards Module

Tables

- flashcard_decks
- flashcards
- student_flashcard_progress

---

## Student Progress Module

Tables

- student_course_progress
- student_lecture_progress
- student_topic_progress
- student_question_progress

---

## Notification Module

Tables

- notifications
- user_notifications

---

## Audit Module

Tables

- audit_logs

---

# 9. Relationships

```
Semester
1 → Many Courses

Course
1 → Many Weeks

Week
1 → Many Lectures

Lecture
1 → Many Topics

Lecture
1 → Many Resources

Topic
1 → Many Questions

Question
1 → Many MCQ Options

Question
1 → 1 Essay Configuration

Question
Many ↔ Many Tags

Test
Many ↔ Many Questions

Flashcard Deck
1 → Many Flashcards

Student
1 → Many Test Attempts

Student
1 → Many Course Progress

Student
1 → Many Lecture Progress

Student
1 → Many Topic Progress

Student
1 → Many Question Progress

Student
1 → Many Flashcard Progress

Notification
Many ↔ Many Users
```

---

# 10. Naming Conventions

- snake_case
- UUID primary keys
- Singular column names
- Plural table names
- Uppercase ENUM values
- Foreign key name = referenced table + "_id"

---

# 11. Primary Keys

Every table uses

```
UUID DEFAULT gen_random_uuid()
```

---

# 12. Foreign Keys

All relationships use foreign keys.

Delete behaviour includes

- CASCADE
- SET NULL
- RESTRICT

depending on business rules.

---

# 13. Constraints

Examples

- Unique email
- Unique phone number
- Unique student number
- Completion percentage between 0 and 100
- Positive marks
- Positive duration
- Positive semester number
- Time range validation
- One progress row per student/course
- One note per attempt/question
- One flag per attempt/question

---

# 14. Indexes

Indexes exist on

- Foreign keys
- Search columns
- Dashboard columns
- Status columns
- Notification status
- Audit timestamps

Purpose

- Faster filtering
- Faster joins
- Dashboard performance
- Better scalability

---

# 15. Triggers

Trigger Function

```
update_updated_at_column()
```

Automatically updates

```
updated_at
```

before UPDATE.

Applied to all major tables containing an `updated_at` column.

---

# 16. Views

## student_dashboard

Provides

- Student
- Enrolled courses
- Average completion
- Average score

---

## instructor_dashboard

Provides

- Instructor
- Tests created
- Flashcard decks
- Questions created

---

## question_bank_statistics

Provides

- Topic
- Question type
- Total questions

---

# 17. Seed Files

## 01_users_seed

Creates

- Admin
- Instructors
- Students

## 02_academic_seed

Creates

- Semesters
- Courses
- Weeks
- Lectures
- Topics
- Resources

## 03_question_bank_seed

Creates

- Questions
- MCQs
- Essay configurations
- Tags

## 04_assessment_seed

Creates

- Tests
- Attempts
- Answers

## 05_flashcards_seed

Creates

- Decks
- Flashcards
- Student flashcard progress

## 06_student_progress_seed

Creates

- Course progress
- Lecture progress
- Topic progress
- Question progress

## 07_audit_seed

Creates

- Login history
- CRUD events
- Test events
- Flashcard events

## 08_notifications_seed

Creates

- Notifications
- User notifications

## 09_demo_data

Creates realistic activity.

---

# 18. Backend Development Notes

Each SQL module maps directly to a NestJS module.

| Database | NestJS Module |
|----------|---------------|
| users | UsersModule |
| auth | AuthModule |
| semesters | AcademicModule |
| courses | CoursesModule |
| lectures | LecturesModule |
| topics | TopicsModule |
| resources | ResourcesModule |
| questions | QuestionsModule |
| tests | TestsModule |
| flashcards | FlashcardsModule |
| notifications | NotificationsModule |
| audit_logs | AuditModule |
| student_progress | ProgressModule |

---

# 19. DTO Guidelines

Never accept from client

- id
- created_at
- updated_at
- password_hash
- failed_login_attempts
- locked_until
- completed_at (system managed)
- mastered_at (system managed)

Generated by backend

- UUID
- timestamps
- password hash
- JWT
- audit logs

---

# 20. Validation Rules

Examples

Email

- required
- unique
- valid format

Phone

- unique
- 10–15 digits

Marks

- greater than zero

Completion percentage

- 0–100

Semester

- greater than zero

Lecture duration

- positive integer

---

# 21. Transactions

The backend should execute the following operations inside database transactions:

- User registration (`users` + role-specific table)
- Test creation (`tests` + `test_questions`)
- Test submission (`student_answers`, `test_attempts`, progress updates, audit log)
- Flashcard deck creation (`flashcard_decks` + `flashcards`)
- Notification creation (`notifications` + `user_notifications`)

---

# 22. Environment Variables

Backend requires

```
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
DATABASE_URL

JWT_SECRET
REFRESH_TOKEN_SECRET

PORT
NODE_ENV
```

---

# 23. Future Improvements

- Soft delete support
- Full-text search
- Materialized dashboard views
- Query optimisation
- Table partitioning for audit logs
- Automated backups
- Read replicas
- Row-level security
- Database migration pipeline
- Monitoring and performance metrics

---

# Notes for Backend Developers

- Always use transactions for multi-table writes.
- Validate all incoming data using DTOs and `class-validator`.
- Never expose `password_hash` or internal audit information in API responses.
- Prefer pagination for list endpoints.
- Use the provided views for dashboard endpoints where appropriate.
- Keep business logic in NestJS services; the database should enforce integrity through constraints, foreign keys, and triggers.

# 24. Backend Entity Mapping

This section defines the mapping between PostgreSQL tables and the corresponding NestJS modules and entities.

| Database Table             | NestJS Module       | Entity                   |
| -------------------------- | ------------------- | ------------------------ |
| users                      | UsersModule         | User                     |
| students                   | UsersModule         | Student                  |
| instructors                | UsersModule         | Instructor               |
| system_admins              | UsersModule         | SystemAdmin              |
| instructor_availability    | UsersModule         | InstructorAvailability   |
| semesters                  | AcademicModule      | Semester                 |
| courses                    | AcademicModule      | Course                   |
| weeks                      | AcademicModule      | Week                     |
| lectures                   | AcademicModule      | Lecture                  |
| topics                     | AcademicModule      | Topic                    |
| resources                  | AcademicModule      | Resource                 |
| questions                  | QuestionsModule     | Question                 |
| mcq_options                | QuestionsModule     | McqOption                |
| essay_configurations       | QuestionsModule     | EssayConfiguration       |
| tags                       | QuestionsModule     | Tag                      |
| question_tags              | QuestionsModule     | QuestionTag              |
| tests                      | TestsModule         | Test                     |
| test_questions             | TestsModule         | TestQuestion             |
| test_attempts              | TestsModule         | TestAttempt              |
| student_answers            | TestsModule         | StudentAnswer            |
| question_flags             | TestsModule         | QuestionFlag             |
| question_notes             | TestsModule         | QuestionNote             |
| flashcard_decks            | FlashcardsModule    | FlashcardDeck            |
| flashcards                 | FlashcardsModule    | Flashcard                |
| student_flashcard_progress | FlashcardsModule    | StudentFlashcardProgress |
| student_course_progress    | ProgressModule      | StudentCourseProgress    |
| student_lecture_progress   | ProgressModule      | StudentLectureProgress   |
| student_topic_progress     | ProgressModule      | StudentTopicProgress     |
| student_question_progress  | ProgressModule      | StudentQuestionProgress  |
| notifications              | NotificationsModule | Notification             |
| user_notifications         | NotificationsModule | UserNotification         |
| audit_logs                 | AuditModule         | AuditLog                 |

---

# 25. Suggested API Ownership

Each database table should be owned by exactly one backend module.

## Auth Module

Responsible for:

* User authentication
* Login
* Logout
* JWT
* Password reset
* Email verification

Database Tables

* users
* students
* instructors
* system_admins

---

## Academic Module

Responsible for:

* Semester management
* Course management
* Week management
* Lecture management
* Topic management
* Resources

Database Tables

* semesters
* courses
* weeks
* lectures
* topics
* resources

---

## Questions Module

Responsible for

* Question Bank
* MCQs
* Essay Questions
* Tags

Database Tables

* questions
* mcq_options
* essay_configurations
* tags
* question_tags

---

## Assessment Module

Responsible for

* Tests
* Attempts
* Answers
* Notes
* Flags

Database Tables

* tests
* test_questions
* test_attempts
* student_answers
* question_flags
* question_notes

---

## Flashcards Module

Responsible for

* Decks
* Flashcards
* Review System

Database Tables

* flashcard_decks
* flashcards
* student_flashcard_progress

---

## Progress Module

Responsible for

Tracking student learning progress.

Database Tables

* student_course_progress
* student_lecture_progress
* student_topic_progress
* student_question_progress

---

## Notifications Module

Responsible for

* Creating notifications
* Sending notifications
* Reading notifications

Database Tables

* notifications
* user_notifications

---

## Audit Module

Responsible for

Recording all important user activities.

Database Tables

* audit_logs

---

# 26. DTO Design Guidelines

## Create DTOs

Only allow client-controlled fields.

Example:

### Create Course DTO

Allowed

* semester_id
* course_code
* course_name
* slug
* description
* credit_hours
* display_order

Generated automatically

* id
* created_at
* updated_at

---

### Create Question DTO

Allowed

* topic_id
* question_type
* title
* question_text
* explanation
* hint
* reference
* difficulty
* estimated_time_seconds
* marks

Generated automatically

* id
* version
* created_by
* created_at
* updated_at

---

### Create Student DTO

Allowed

* full_name
* email
* password
* phone_number
* gender
* date_of_birth
* student_number
* current_semester

Generated automatically

* UUID
* password_hash
* status
* email_verified
* timestamps

---

## Update DTOs

Update DTOs should always use optional fields.

Generated fields must never be editable.

---

# 27. Repository Layer Guidelines

Every table should have a dedicated repository or ORM model.

Recommended naming

```
UserRepository

StudentRepository

InstructorRepository

CourseRepository

WeekRepository

LectureRepository

TopicRepository

QuestionRepository

TestRepository

FlashcardRepository

NotificationRepository

AuditRepository
```

---

# 28. Service Layer Responsibilities

Business logic belongs inside services.

Examples

UsersService

* Register user
* Update profile
* Change password

QuestionsService

* Create question
* Update question
* Search question
* Archive question

TestsService

* Create test
* Start attempt
* Submit attempt
* Auto-submit expired attempts

FlashcardsService

* Review flashcards
* Calculate spaced repetition
* Update review progress

ProgressService

* Update course progress
* Update lecture progress
* Update topic mastery

NotificationService

* Create notification
* Mark as read
* Send system notifications

AuditService

* Record actions
* Retrieve activity history

---

# 29. Security Considerations

Sensitive columns

* password_hash
* locked_until
* ip_address
* user_agent

These fields must never be exposed through public APIs.

Passwords must always be stored using BCrypt.

JWT secrets must only be loaded from environment variables.

Parameterized queries or ORM query builders should always be used to prevent SQL injection.

---

# 30. Performance Recommendations

The backend should

* Use pagination for all list endpoints.
* Avoid SELECT * queries.
* Select only required columns.
* Use indexes whenever filtering by foreign keys.
* Cache frequently accessed dashboard data when appropriate.
* Batch insert operations where possible.

---

# 31. Error Handling

The backend should return appropriate HTTP status codes.

Examples

400 Bad Request

* Invalid input
* Validation errors

401 Unauthorized

* Invalid credentials

403 Forbidden

* Insufficient permissions

404 Not Found

* Requested entity does not exist

409 Conflict

* Duplicate email
* Duplicate course code
* Duplicate slug

422 Unprocessable Entity

* Business rule violations

500 Internal Server Error

* Unexpected server errors

---

# 32. Database Maintenance

Recommended maintenance tasks

Daily

* Automated backup
* Audit log review

Weekly

* Index health check
* Database statistics update

Monthly

* Performance analysis
* Storage usage review
* Security review

---

# 33. Development Workflow

Recommended workflow

1. Modify schema.
2. Update seed files if necessary.
3. Update this documentation.
4. Review changes.
5. Test locally.
6. Commit changes.
7. Push to Git repository.
8. Open Pull Request.
9. Merge after approval.

---

# 34. Conclusion

The Medical Learning Platform database is designed to support scalable and maintainable backend development using PostgreSQL and NestJS. It follows a modular architecture with strong data integrity enforced through foreign keys, constraints, triggers, and indexes.

Developers should treat this document as the primary reference when implementing new backend features, creating DTOs, designing APIs, or modifying the database schema. Any future schema changes should be reflected in this document to ensure consistency across the development team.
