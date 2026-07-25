-- =====================================================
-- Medical Learning Platform
-- Student Progress Seed Data
-- =====================================================
--
-- Contains:
-- • Course Progress
-- • Lecture Progress
-- • Topic Progress
-- • Question Progress
--
-- =====================================================

BEGIN;

---------------------------------------------------------
-- Student Course Progress
---------------------------------------------------------

INSERT INTO student_course_progress
(
    student_id,
    course_id,
    completion_percentage,
    lectures_completed,
    total_lectures,
    average_score,
    last_accessed_at
)

SELECT

    s.user_id,

    c.id,

    65.50,

    5,

    8,

    84.25,

    CURRENT_TIMESTAMP

FROM students s

CROSS JOIN courses c

LIMIT 10;

---------------------------------------------------------
-- Student Lecture Progress
---------------------------------------------------------

INSERT INTO student_lecture_progress
(
    student_id,
    lecture_id,
    is_completed,
    completion_percentage,
    time_spent_minutes,
    last_accessed_at,
    completed_at
)

SELECT

    s.user_id,

    l.id,

    TRUE,

    100,

    95,

    CURRENT_TIMESTAMP,

    CURRENT_TIMESTAMP

FROM students s

CROSS JOIN lectures l

LIMIT 10;

---------------------------------------------------------
-- Student Topic Progress
---------------------------------------------------------

INSERT INTO student_topic_progress
(
    student_id,
    topic_id,
    questions_attempted,
    questions_correct,
    questions_incorrect,
    confidence_level,
    average_score,
    mastery_percentage,
    last_practiced_at
)

SELECT

    s.user_id,

    t.id,

    20,

    16,

    4,

    82.50,

    80,

    80,

    CURRENT_TIMESTAMP

FROM students s

CROSS JOIN topics t

LIMIT 10;

---------------------------------------------------------
-- Student Question Progress
---------------------------------------------------------

INSERT INTO student_question_progress
(
    student_id,
    question_id,
    attempts,
    correct_attempts,
    incorrect_attempts,
    last_answer_correct,
    bookmarked,
    last_attempted_at
)

SELECT

    s.user_id,

    q.id,

    3,

    2,

    1,

    TRUE,

    FALSE,

    CURRENT_TIMESTAMP

FROM students s

CROSS JOIN questions q

LIMIT 15;

---------------------------------------------------------
-- Simulate Some Bookmarks
---------------------------------------------------------

UPDATE student_question_progress

SET bookmarked = TRUE

WHERE id IN
(
    SELECT id
    FROM student_question_progress
    ORDER BY created_at
    LIMIT 5
);

---------------------------------------------------------
-- Completed Courses
---------------------------------------------------------

UPDATE student_course_progress

SET

    completion_percentage = 100,

    lectures_completed = total_lectures,

    completed_at = CURRENT_TIMESTAMP

WHERE id IN
(
    SELECT id
    FROM student_course_progress
    ORDER BY created_at
    LIMIT 2
);

---------------------------------------------------------
-- Mastered Topics
---------------------------------------------------------

UPDATE student_topic_progress

SET

    mastery_percentage = 100,

    confidence_level = 100,

    average_score = 98

WHERE id IN
(
    SELECT id
    FROM student_topic_progress
    ORDER BY created_at
    LIMIT 3
);

COMMIT;