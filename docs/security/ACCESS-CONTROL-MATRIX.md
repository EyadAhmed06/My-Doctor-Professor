# Access Control Matrix

This is the verification contract. "Allowed" still requires the listed ownership predicate.

| Resource/action | Anonymous | Student | Instructor | Admin | Required server predicate |
|---|---:|---:|---:|---:|---|
| login/signup/reset/Google config | allowed | allowed | allowed | allowed | rate limit + safe response |
| public bundle catalogue | read | read | read | read | published fields only |
| own profile/session | no | own | own | own | JWT subject equals target |
| another user profile | no | no | no | controlled | explicit admin policy + audit |
| enrolled bundle content | no | read | managed | all | active enrollment, plan, publication and expiry |
| locked/paid bundle content | no | no | managed | all | confirmed entitlement only |
| course/week/lecture mutation | no | no | managed | all | instructor-course relationship |
| lecture resource file | no | entitled | managed | all | same entitlement path as lecture |
| question bank authoring | no | no | managed | all | managed course/lecture |
| practice/exam attempt | no | own | reporting only | controlled | attempt.student_id = JWT subject |
| answer update/submit | no | own active | no | controlled | ownership + active state + idempotency |
| model-answer reveal | no | own submitted | managed | all | server-recorded submission/reveal condition |
| essay case solve/reveal | no | own entitled | managed | all | entitlement + complete submission |
| note/progress/study plan | no | own | no | controlled | row.user_id = JWT subject |
| notifications | no | own | authored system events | controlled | recipient_id = JWT subject |
| bundle/payment administration | no | subscribe | managed | all | price from DB, verified provider callback |
| backup/restore/bootstrap | no | no | no | restricted operator | separate secret, network and audit controls |

## Route inventory rule

Each controller method must have:

- authentication classification: public or protected;
- allowed roles;
- ownership/entitlement predicate;
- input DTO and bounded collection/pagination;
- audit requirement for privileged/state-changing operations;
- at least one denial test for a different user and different role.

A role decorator alone is insufficient for resources owned by a specific instructor or student.
