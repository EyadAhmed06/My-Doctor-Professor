-- =====================================================
-- Medical Learning Platform
-- Demo Data
-- =====================================================
--
-- Contains:
-- • Realistic Student Activity
-- • Test Attempts
-- • Flashcard Reviews
-- • Course Progress Updates
-- • Notification Reads
--
-- Execute Last
--
-- =====================================================

BEGIN;

---------------------------------------------------------
-- Simulate Additional Test Attempts
---------------------------------------------------------

UPDATE test_attempts
SET
    status = 'SUBMITTED'::test_attempt_status,
    score = ROUND((60 + random() * 40)::numeric,2),
    submitted_at = CURRENT_TIMESTAMP,
    last_activity_at = CURRENT_TIMESTAMP,
    auto_submitted = FALSE
WHERE status = 'NOT_STARTED'::test_attempt_status;

---------------------------------------------------------
-- Randomize Course Progress
---------------------------------------------------------

UPDATE student_course_progress
SET
    completion_percentage = ROUND((random() * 100)::numeric,2),
    average_score = ROUND((60 + random() * 40)::numeric,2),
    last_accessed_at = CURRENT_TIMESTAMP;

---------------------------------------------------------
-- Mark Completed Courses
---------------------------------------------------------

UPDATE student_course_progress
SET
    completion_percentage = 100,
    completed_at = CURRENT_TIMESTAMP
WHERE random() < 0.25;

---------------------------------------------------------
-- Randomize Lecture Progress
---------------------------------------------------------

UPDATE student_lecture_progress
SET
    completion_percentage = ROUND((random()*100)::numeric,2),
    time_spent_minutes = FLOOR(random()*120)::INTEGER + 10,
    last_accessed_at = CURRENT_TIMESTAMP;

UPDATE student_lecture_progress
SET
    is_completed = TRUE,
    completion_percentage = 100,
    completed_at = CURRENT_TIMESTAMP
WHERE random() < 0.40;

---------------------------------------------------------
-- Randomize Topic Mastery
---------------------------------------------------------

UPDATE student_topic_progress
SET
    questions_attempted = FLOOR(random()*50)::INTEGER + 5,
    questions_correct = FLOOR(random()*40)::INTEGER + 3,
    questions_incorrect = FLOOR(random()*10)::INTEGER,
    confidence_level = ROUND((50 + random()*50)::numeric,2),
    mastery_percentage = ROUND((random()*100)::numeric,2),
    average_score = ROUND((55 + random()*45)::numeric,2),
    last_practiced_at = CURRENT_TIMESTAMP;

---------------------------------------------------------
-- Randomize Question Progress
---------------------------------------------------------

UPDATE student_question_progress
SET
    attempts = FLOOR(random()*8)::INTEGER + 1,
    correct_attempts = FLOOR(random()*5)::INTEGER,
    incorrect_attempts = FLOOR(random()*3)::INTEGER,
    last_answer_correct = (random() > 0.35),
    last_attempted_at = CURRENT_TIMESTAMP;

---------------------------------------------------------
-- Bookmark More Questions
---------------------------------------------------------

UPDATE student_question_progress
SET bookmarked = TRUE
WHERE random() < 0.30;

---------------------------------------------------------
-- Flashcard Reviews
---------------------------------------------------------

UPDATE student_flashcard_progress
SET

    times_reviewed = FLOOR(random()*30)::INTEGER,

    times_correct = FLOOR(random()*20)::INTEGER,

    times_incorrect = FLOOR(random()*8)::INTEGER,

    review_streak = FLOOR(random()*10)::INTEGER,

    ease_factor = ROUND((1.30 + random()*1.70)::numeric,2),

    interval_days = FLOOR(random()*30)::INTEGER + 1,

    last_reviewed_at = CURRENT_TIMESTAMP,

    next_review_at = CURRENT_TIMESTAMP + ((FLOOR(random()*14)+1)::text || ' days')::INTERVAL;

---------------------------------------------------------
-- Master Some Flashcards
---------------------------------------------------------

UPDATE student_flashcard_progress
SET

    is_mastered = TRUE,

    mastered_at = CURRENT_TIMESTAMP

WHERE random() < 0.25;

---------------------------------------------------------
-- Read Some Notifications
---------------------------------------------------------

UPDATE user_notifications
SET

    notification_status = 'READ'::notification_status,

    read_at = CURRENT_TIMESTAMP

WHERE random() < 0.65;

---------------------------------------------------------
-- Recent Logins
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_name,
    entity_id,
    description,
    created_at
)

SELECT

    id,

    'LOGIN'::audit_action,

    'users',

    id,

    'User logged in.',

    CURRENT_TIMESTAMP

FROM users
WHERE random() < 0.50;

---------------------------------------------------------
-- Recent Logouts
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_name,
    entity_id,
    description,
    created_at
)

SELECT

    id,

    'LOGOUT'::audit_action,

    'users',

    id,

    'User logged out.',

    CURRENT_TIMESTAMP

FROM users
WHERE random() < 0.40;

COMMIT;