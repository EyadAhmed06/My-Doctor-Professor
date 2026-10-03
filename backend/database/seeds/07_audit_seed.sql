-- =====================================================
-- Medical Learning Platform
-- Audit Logs Seed Data
-- =====================================================
--
-- Contains:
-- • Authentication Events
-- • Question Bank Events
-- • Test Events
-- • Flashcard Events
-- • Profile Updates
-- • Report Events
--
-- =====================================================

BEGIN;

---------------------------------------------------------
-- User Login
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_name,
    entity_id,
    description,
    ip_address,
    user_agent
)
SELECT
    id,
    'LOGIN'::audit_action,
    'users',
    id,
    'User logged into the platform.',
    '192.168.1.10',
    'Mozilla/5.0'
FROM users
LIMIT 5;

---------------------------------------------------------
-- User Logout
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_name,
    entity_id,
    description,
    ip_address,
    user_agent
)
SELECT
    id,
    'LOGOUT'::audit_action,
    'users',
    id,
    'User logged out.',
    '192.168.1.10',
    'Mozilla/5.0'
FROM users
LIMIT 3;

---------------------------------------------------------
-- Password Changed
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_name,
    entity_id,
    description
)
SELECT
    id,
    'PASSWORD_CHANGED'::audit_action,
    'users',
    id,
    'Password changed successfully.'
FROM users
LIMIT 2;

---------------------------------------------------------
-- Profile Updated
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_name,
    entity_id,
    description
)
SELECT
    id,
    'UPDATE_PROFILE'::audit_action,
    'users',
    id,
    'User updated profile information.'
FROM users
LIMIT 4;

---------------------------------------------------------
-- Question Created
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_name,
    entity_id,
    description,
    new_values
)
SELECT
    q.created_by,
    'CREATE'::audit_action,
    'questions',
    q.id,
    'Question added to the question bank.',
    jsonb_build_object(
        'title', q.title,
        'difficulty', q.difficulty,
        'type', q.question_type
    )
FROM questions q
LIMIT 3;

---------------------------------------------------------
-- Question Updated
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_name,
    entity_id,
    description,
    old_values,
    new_values
)
SELECT
    q.created_by,
    'UPDATE'::audit_action,
    'questions',
    q.id,
    'Question updated.',
    jsonb_build_object(
        'difficulty','EASY'
    ),
    jsonb_build_object(
        'difficulty', q.difficulty
    )
FROM questions q
LIMIT 2;

---------------------------------------------------------
-- Test Started
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_name,
    entity_id,
    description
)
SELECT
    ta.student_id,
    'START_TEST'::audit_action,
    'tests',
    ta.test_id,
    'Student started a test.'
FROM test_attempts ta
LIMIT 3;

---------------------------------------------------------
-- Test Submitted
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_name,
    entity_id,
    description
)
SELECT
    ta.student_id,
    'SUBMIT_TEST'::audit_action,
    'tests',
    ta.test_id,
    'Student submitted a test.'
FROM test_attempts ta
LIMIT 3;

---------------------------------------------------------
-- Question Bookmarked
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_name,
    entity_id,
    description
)
SELECT
    sqp.student_id,
    'BOOKMARK_QUESTION'::audit_action,
    'questions',
    sqp.question_id,
    'Question bookmarked.'
FROM student_question_progress sqp
WHERE sqp.bookmarked = TRUE
LIMIT 5;

---------------------------------------------------------
-- Flashcards Reviewed
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_name,
    entity_id,
    description
)
SELECT
    sfp.student_id,
    'REVIEW_FLASHCARDS'::audit_action,
    'flashcards',
    sfp.flashcard_id,
    'Student reviewed flashcards.'
FROM student_flashcard_progress sfp
LIMIT 5;

---------------------------------------------------------
-- Reports Viewed
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_name,
    entity_id,
    description
)
SELECT
    user_id,
    'VIEW_REPORTS'::audit_action,
    'dashboard',
    NULL,
    'Instructor viewed analytics dashboard.'
FROM instructors
LIMIT 2;

---------------------------------------------------------
-- Data Exported
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_name,
    entity_id,
    description
)
SELECT
    user_id,
    'EXPORT_DATA'::audit_action,
    'reports',
    NULL,
    'Instructor exported analytics report.'
FROM instructors
LIMIT 1;

COMMIT;