-- =====================================================
-- Medical Learning Platform
-- Assessment Module Seed Data
-- =====================================================
--
-- Contains:
-- • Tests
-- • Test Questions
-- • Test Attempts
-- • Student Answers
-- • Question Flags
-- • Question Notes
--
-- =====================================================

BEGIN;

---------------------------------------------------------
-- Test 1
---------------------------------------------------------

INSERT INTO tests
(
    title,
    description,
    test_type,
    lecture_id,
    duration_minutes,
    total_marks,
    passing_marks,
    is_published,
    created_by
)
SELECT
    'Anatomy Quiz 1',
    'Basic anatomy lecture quiz.',
    'LECTURE'::test_type,
    l.id,
    20,
    2,
    1,
    TRUE,
    i.user_id
FROM lectures l
CROSS JOIN instructors i
ORDER BY l.created_at
LIMIT 1;

---------------------------------------------------------
-- Test 2
---------------------------------------------------------

INSERT INTO tests
(
    title,
    description,
    test_type,
    duration_minutes,
    total_marks,
    passing_marks,
    is_published,
    created_by
)
SELECT
    'Question Bank Practice',
    'Practice generated from the question bank.',
    'QUESTION_BANK'::test_type,
    30,
    12,
    6,
    TRUE,
    user_id
FROM instructors
LIMIT 1;

---------------------------------------------------------
-- Test Questions
---------------------------------------------------------

INSERT INTO test_questions
(
    test_id,
    question_id,
    display_order,
    marks,
    time_limit_seconds
)
SELECT
    t.id,
    q.id,
    ROW_NUMBER() OVER (ORDER BY q.created_at),
    q.marks,
    q.estimated_time_seconds
FROM tests t
CROSS JOIN questions q
WHERE t.title = 'Anatomy Quiz 1'
LIMIT 2;

INSERT INTO test_questions
(
    test_id,
    question_id,
    display_order,
    marks,
    time_limit_seconds
)
SELECT
    t.id,
    q.id,
    ROW_NUMBER() OVER (ORDER BY q.created_at),
    q.marks,
    q.estimated_time_seconds
FROM tests t
CROSS JOIN questions q
WHERE t.title = 'Question Bank Practice';

---------------------------------------------------------
-- Test Attempt
---------------------------------------------------------

INSERT INTO test_attempts
(
    student_id,
    test_id,
    test_mode,
    status,
    score,
    started_at,
    submitted_at,
    last_activity_at,
    auto_submitted
)
SELECT
    s.user_id,
    t.id,
    'TIMED'::test_mode,
    'SUBMITTED'::test_attempt_status,
    11,
    CURRENT_TIMESTAMP - INTERVAL '30 minutes',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    FALSE
FROM students s
CROSS JOIN tests t
WHERE t.title = 'Question Bank Practice'
LIMIT 1;

---------------------------------------------------------
-- MCQ Answers
---------------------------------------------------------

INSERT INTO student_answers
(
    attempt_id,
    question_id,
    selected_option_id,
    essay_answer,
    awarded_marks,
    is_correct,
    answered_at
)
SELECT
    ta.id,
    q.id,
    (
        SELECT mo.id
        FROM mcq_options mo
        WHERE mo.question_id = q.id
        AND mo.is_correct = TRUE
        LIMIT 1
    ),
    NULL,
    q.marks,
    TRUE,
    CURRENT_TIMESTAMP
FROM test_attempts ta
JOIN tests t
ON ta.test_id = t.id
JOIN questions q
ON q.question_type = 'MCQ'::question_type
WHERE t.title = 'Question Bank Practice'
LIMIT 2;

---------------------------------------------------------
-- Essay Answer
---------------------------------------------------------

INSERT INTO student_answers
(
    attempt_id,
    question_id,
    selected_option_id,
    essay_answer,
    awarded_marks,
    is_correct,
    answered_at
)
SELECT
    ta.id,
    q.id,
    NULL,
    'Pulmonary circulation carries blood between the heart and lungs, while systemic circulation delivers oxygenated blood to the body.',
    q.marks,
    TRUE,
    CURRENT_TIMESTAMP
FROM test_attempts ta
JOIN tests t
ON ta.test_id = t.id
JOIN questions q
ON q.question_type = 'ESSAY'::question_type
WHERE t.title = 'Question Bank Practice'
LIMIT 1;

---------------------------------------------------------
-- Question Flag
---------------------------------------------------------

INSERT INTO question_flags
(
    attempt_id,
    question_id
)
SELECT
    ta.id,
    q.id
FROM test_attempts ta
CROSS JOIN questions q
LIMIT 1;

---------------------------------------------------------
-- Question Note
---------------------------------------------------------

INSERT INTO question_notes
(
    attempt_id,
    question_id,
    note
)
SELECT
    ta.id,
    q.id,
    'Review this question before the final exam.'
FROM test_attempts ta
CROSS JOIN questions q
LIMIT 1;

COMMIT;