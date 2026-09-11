# Canonical Backend API Specification

**Version:** v1  
**Base path:** `/api/v1`  
**Authentication:** Bearer access token unless marked Public  
**Roles:** `STUDENT`, `INSTRUCTOR`, `SYSTEM_ADMIN`

This file describes the implemented controller paths on `agent/backend-foundation-rebuild`. Legacy endpoint lists are planning history and are not authoritative.

## Contract rules

- Request bodies use the snake_case fields defined by request DTOs.
- Response objects currently use entity/camelCase fields in several domains and explicit snake_case projections in others. The frontend must use this specification and actual response DTOs, not database column names.
- Validation rejects unknown body fields.
- UUID path parameters are validated before service execution where controllers use `ParseUUIDPipe`.
- Expected validation, authorization, conflict, and PostgreSQL constraint failures map to 4xx responses. Unexpected infrastructure or programming failures may return 500.
- List responses use `{ data, page, limit, total, total_pages }` unless the endpoint states otherwise.
- A global success envelope is not implemented.

## Health

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health/live` | Public | Process liveness |
| GET | `/health/ready` | Public | Database readiness |

## Authentication

| Method | Path | Access |
|---|---|---|
| POST | `/auth/signup` | Public |
| POST | `/auth/login` | Public |
| POST | `/auth/email-verification/request` | Public |
| POST | `/auth/email-verification/confirm` | Public |
| POST | `/auth/password/forgot` | Public |
| POST | `/auth/password/reset` | Public |
| POST | `/auth/refresh` | Public |
| GET | `/auth/me` | Authenticated |
| POST | `/auth/logout` | Authenticated |

## Users

| Method | Path | Access |
|---|---|---|
| GET | `/users/:userId` | Same user |
| PUT | `/users/:userId` | Same user |
| POST | `/users/:userId/change-password` | Same user |

## Academic structure

All paths below start with `/academic`.

| Method | Path | Access |
|---|---|---|
| POST | `/semesters` | SYSTEM_ADMIN |
| GET | `/semesters` | Authenticated |
| GET | `/semesters/:semesterId` | Authenticated |
| PUT | `/semesters/:semesterId` | SYSTEM_ADMIN |
| DELETE | `/semesters/:semesterId` | SYSTEM_ADMIN |
| POST | `/semesters/:semesterId/courses` | Assigned INSTRUCTOR or SYSTEM_ADMIN |
| GET | `/courses` | Authenticated |
| GET | `/courses/:courseId` | Authenticated |
| GET | `/courses/:courseId/instructors` | SYSTEM_ADMIN |
| POST | `/courses/:courseId/instructors/:instructorId` | SYSTEM_ADMIN |
| DELETE | `/courses/:courseId/instructors/:instructorId` | SYSTEM_ADMIN |
| PUT | `/courses/:courseId` | Assigned INSTRUCTOR or SYSTEM_ADMIN |
| DELETE | `/courses/:courseId` | Assigned INSTRUCTOR or SYSTEM_ADMIN |
| POST | `/courses/:courseId/weeks` | Assigned INSTRUCTOR or SYSTEM_ADMIN |
| GET | `/courses/:courseId/weeks` | Authenticated |
| GET | `/weeks/:weekId` | Authenticated |
| PUT | `/weeks/:weekId` | Assigned INSTRUCTOR or SYSTEM_ADMIN |
| DELETE | `/weeks/:weekId` | Assigned INSTRUCTOR or SYSTEM_ADMIN |
| POST | `/weeks/:weekId/lectures` | Assigned INSTRUCTOR or SYSTEM_ADMIN |
| GET | `/weeks/:weekId/lectures` | Authenticated |
| GET | `/lectures/:lectureId` | Authenticated |
| PUT | `/lectures/:lectureId` | Assigned INSTRUCTOR or SYSTEM_ADMIN |
| DELETE | `/lectures/:lectureId` | Assigned INSTRUCTOR or SYSTEM_ADMIN |
| POST | `/lectures/:lectureId/topics` | Assigned INSTRUCTOR or SYSTEM_ADMIN |
| GET | `/lectures/:lectureId/topics` | Authenticated |
| GET | `/topics/:topicId` | Authenticated |
| PUT | `/topics/:topicId` | Assigned INSTRUCTOR or SYSTEM_ADMIN |
| DELETE | `/topics/:topicId` | Assigned INSTRUCTOR or SYSTEM_ADMIN |
| POST | `/lectures/:lectureId/resources` | Assigned INSTRUCTOR or SYSTEM_ADMIN; HTTPS link metadata |
| POST | `/lectures/:lectureId/resources/upload` | Assigned INSTRUCTOR or SYSTEM_ADMIN; multipart `file` |
| GET | `/lectures/:lectureId/resources` | Authenticated |
| GET | `/resources/:resourceId/file` | Authenticated and content-visible |
| DELETE | `/resources/:resourceId` | Assigned INSTRUCTOR or SYSTEM_ADMIN |

## Question bank

All paths start with `/questions`.

| Method | Path | Access |
|---|---|---|
| POST | `/` | INSTRUCTOR or SYSTEM_ADMIN |
| GET | `/` | Authenticated |
| GET | `/search` | Authenticated |
| GET | `/tags/all` | Authenticated |
| POST | `/tags` | INSTRUCTOR or SYSTEM_ADMIN |
| DELETE | `/tags/:tagId` | INSTRUCTOR or SYSTEM_ADMIN |
| PUT | `/options/:optionId` | Owning INSTRUCTOR or SYSTEM_ADMIN |
| DELETE | `/options/:optionId` | Owning INSTRUCTOR or SYSTEM_ADMIN |
| GET | `/:questionId` | Authenticated with safe student projection |
| PUT | `/:questionId` | Owning INSTRUCTOR or SYSTEM_ADMIN |
| DELETE | `/:questionId` | Owning INSTRUCTOR or SYSTEM_ADMIN |
| POST | `/:questionId/duplicate` | INSTRUCTOR or SYSTEM_ADMIN |
| GET | `/:questionId/options` | Authenticated |
| POST | `/:questionId/options` | Owning INSTRUCTOR or SYSTEM_ADMIN |
| POST | `/:questionId/essay-configuration` | Owning INSTRUCTOR or SYSTEM_ADMIN |
| GET | `/:questionId/essay-configuration` | Authenticated |
| POST | `/:questionId/tags/:tagId` | Owning INSTRUCTOR or SYSTEM_ADMIN |
| DELETE | `/:questionId/tags/:tagId` | Owning INSTRUCTOR or SYSTEM_ADMIN |

## Assessments

All paths start with `/tests`.

| Method | Path | Access |
|---|---|---|
| POST | `/` | INSTRUCTOR or SYSTEM_ADMIN |
| GET | `/` | Authenticated |
| GET | `/:testId` | Authenticated with publication/ownership rules |
| PUT | `/:testId` | Owning INSTRUCTOR or SYSTEM_ADMIN |
| DELETE | `/:testId` | Owning INSTRUCTOR or SYSTEM_ADMIN |
| POST | `/:testId/questions` | Owning INSTRUCTOR or SYSTEM_ADMIN |
| GET | `/:testId/questions` | Authenticated; active attempt required for STUDENT |
| DELETE | `/:testId/questions/:questionId` | Owning INSTRUCTOR or SYSTEM_ADMIN |
| GET | `/:testId/attempts` | Owning INSTRUCTOR or SYSTEM_ADMIN |
| POST | `/:testId/attempts` | STUDENT |
| GET | `/attempts/:attemptId` | Attempt owner or test manager |
| PUT | `/attempts/:attemptId/answers/:questionId` | STUDENT attempt owner |
| POST | `/attempts/:attemptId/submit` | STUDENT attempt owner |
| GET | `/attempts/:attemptId/answers` | Attempt owner or test manager |
| GET | `/attempts/:attemptId/review` | Attempt owner or test manager |
| POST | `/attempts/:attemptId/flags/:questionId` | STUDENT attempt owner |
| DELETE | `/attempts/:attemptId/flags/:questionId` | STUDENT attempt owner |
| POST | `/attempts/:attemptId/notes/:questionId` | STUDENT attempt owner |
| PUT | `/attempts/:attemptId/notes/:questionId` | STUDENT attempt owner |
| DELETE | `/attempts/:attemptId/notes/:questionId` | STUDENT attempt owner |
| PUT | `/attempts/:attemptId/answers/:answerId/grade` | Owning INSTRUCTOR or SYSTEM_ADMIN |

Publishing a course-scoped test automatically notifies active students in the course semester. Essay grading automatically notifies the attempt owner.

## Flashcards

All paths start with `/flashcards`.

| Method | Path | Access |
|---|---|---|
| GET | `/decks` | Authenticated |
| POST | `/decks` | INSTRUCTOR or SYSTEM_ADMIN |
| GET | `/decks/:deckId` | Authenticated |
| PUT | `/decks/:deckId` | Owning INSTRUCTOR or SYSTEM_ADMIN |
| DELETE | `/decks/:deckId` | Owning INSTRUCTOR or SYSTEM_ADMIN |
| POST | `/decks/:deckId/cards` | Owning INSTRUCTOR or SYSTEM_ADMIN |
| GET | `/decks/:deckId/cards` | Authenticated |
| GET | `/cards/due` | STUDENT |
| PUT | `/cards/:cardId` | Owning INSTRUCTOR or SYSTEM_ADMIN |
| DELETE | `/cards/:cardId` | Owning INSTRUCTOR or SYSTEM_ADMIN |
| GET | `/cards/:cardId/progress` | STUDENT |
| POST | `/cards/:cardId/review` | STUDENT |

## Progress, dashboards, and analytics

| Method | Path | Access |
|---|---|---|
| GET | `/progress/courses` | STUDENT |
| GET | `/progress/courses/:courseId` | STUDENT |
| GET | `/progress/lectures/:lectureId` | STUDENT |
| PUT | `/progress/lectures/:lectureId` | STUDENT |
| GET | `/progress/topics/:topicId` | STUDENT |
| GET | `/progress/questions/:questionId` | STUDENT |
| PUT | `/progress/questions/:questionId/bookmark` | STUDENT |
| GET | `/dashboard/student` | STUDENT |
| GET | `/dashboard/instructor` | INSTRUCTOR |
| GET | `/dashboard/admin` | SYSTEM_ADMIN |
| GET | `/analytics/questions` | INSTRUCTOR or SYSTEM_ADMIN |
| GET | `/analytics/tests` | INSTRUCTOR or SYSTEM_ADMIN |
| GET | `/analytics/performance` | INSTRUCTOR or SYSTEM_ADMIN |

## Notifications

| Method | Path | Access |
|---|---|---|
| GET | `/notifications` | Authenticated owner inbox |
| POST | `/notifications` | INSTRUCTOR or SYSTEM_ADMIN |
| PUT | `/notifications/mark-read` | Authenticated owner |
| GET | `/notifications/unread/count` | Authenticated owner |
| PUT | `/notifications/:notificationId` | Authenticated owner |
| DELETE | `/notifications/:notificationId` | Authenticated owner |

## Audit

| Method | Path | Access |
|---|---|---|
| GET | `/audit-logs` | SYSTEM_ADMIN |
| GET | `/audit-logs/export/file` | SYSTEM_ADMIN |
| GET | `/audit-logs/:auditId` | SYSTEM_ADMIN |

## Administration

All paths start with `/admin` and require `SYSTEM_ADMIN`; sensitive administrator targets additionally require a super-administrator profile.

| Method | Path |
|---|---|
| GET | `/users` |
| POST | `/users` |
| POST | `/users/import` |
| GET | `/users/:userId` |
| PUT | `/users/:userId` |
| PATCH | `/users/:userId/status` |
| POST | `/users/:userId/reset-password` |
| DELETE | `/users/:userId` |
| GET | `/statistics` |

## Release validation

The API is not release-green solely because this inventory exists. The exact commit must pass `.github/workflows/backend-ci.yml`, including PostgreSQL bootstrap, forward migrations, schema drift, integration/concurrency tests, dependency audit, and load smoke.
