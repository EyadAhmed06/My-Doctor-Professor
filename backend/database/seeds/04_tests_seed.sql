-- =====================================================
-- Medical Learning Platform
-- Tests Seed Data
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
-- TESTS
---------------------------------------------------------

INSERT INTO tests
(
    created_by,
    course_id,
    title,
    description,
    instructions,
    duration_minutes,
    total_marks,
    passing_marks,
    available_from,
    available_until,
    is_published
)

SELECT

    (SELECT user_id FROM instructors LIMIT 1),

    c.id,

    'Physiology Quiz 1',

    'Basic physiology concepts',

    'Answer all questions before submitting.',

    30,

    12,

    6,

    CURRENT_TIMESTAMP,

    CURRENT_TIMESTAMP + INTERVAL '7 days',

    TRUE

FROM courses c
WHERE c.slug='physiology';

---------------------------------------------------------
-- TEST QUESTIONS
---------------------------------------------------------

INSERT INTO test_questions
(
    test_id,
    question_id,
    question_order
)

SELECT

    t.id,

    q.id,

    1

FROM tests t
JOIN questions q
ON q.title='Homeostasis MCQ'

WHERE t.title='Physiology Quiz 1';

---------------------------------------------------------

INSERT INTO test_questions
(
    test_id,
    question_id,
    question_order
)

SELECT

    t.id,

    q.id,

    2

FROM tests t
JOIN questions q
ON q.title='Membrane Transport'

WHERE t.title='Physiology Quiz 1';

---------------------------------------------------------

INSERT INTO test_questions
(
    test_id,
    question_id,
    question_order
)

SELECT

    t.id,

    q.id,

    3

FROM tests t
JOIN questions q
ON q.title='Explain Homeostasis'

WHERE t.title='Physiology Quiz 1';

---------------------------------------------------------
-- TEST ATTEMPTS
---------------------------------------------------------

INSERT INTO test_attempts
(
    test_id,
    student_id,
    started_at,
    submitted_at,
    score,
    percentage,
    status
)

SELECT

    t.id,

    s.user_id,

    CURRENT_TIMESTAMP - INTERVAL '20 minutes',

    CURRENT_TIMESTAMP,

    9,

    75,

    'SUBMITTED'

FROM tests t
CROSS JOIN
(
    SELECT user_id
    FROM students
    LIMIT 1
) s

WHERE t.title='Physiology Quiz 1';

---------------------------------------------------------
-- STUDENT ANSWERS
---------------------------------------------------------

INSERT INTO student_answers
(
    attempt_id,
    question_id,
    selected_option_id,
    awarded_marks,
    is_correct
)

SELECT

    ta.id,

    q.id,

    (
        SELECT id
        FROM mcq_options
        WHERE question_id=q.id
        AND is_correct=TRUE
        LIMIT 1
    ),

    1,

    TRUE

FROM test_attempts ta
JOIN questions q
ON q.title='Homeostasis MCQ'

LIMIT 1;

---------------------------------------------------------

INSERT INTO student_answers
(
    attempt_id,
    question_id,
    selected_option_id,
    awarded_marks,
    is_correct
)

SELECT

    ta.id,

    q.id,

    (
        SELECT id
        FROM mcq_options
        WHERE question_id=q.id
        AND is_correct=TRUE
        LIMIT 1
    ),

    1,

    TRUE

FROM test_attempts ta
JOIN questions q
ON q.title='Membrane Transport'

LIMIT 1;

---------------------------------------------------------

INSERT INTO student_answers
(
    attempt_id,
    question_id,
    essay_answer,
    awarded_marks,
    is_correct
)

SELECT

    ta.id,

    q.id,

    'Homeostasis is the ability of the body to maintain a stable internal environment through various feedback mechanisms.',

    7,

    TRUE

FROM test_attempts ta
JOIN questions q
ON q.title='Explain Homeostasis'

LIMIT 1;

---------------------------------------------------------
-- QUESTION FLAGS
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
JOIN questions q
ON q.title='Explain Homeostasis'

LIMIT 1;

---------------------------------------------------------
-- QUESTION NOTES
---------------------------------------------------------

INSERT INTO question_notes
(
    student_id,
    question_id,
    note
)

SELECT

    s.user_id,

    q.id,

    'Remember to mention both positive and negative feedback in the exam.'

FROM
(
    SELECT user_id
    FROM students
    LIMIT 1
) s

JOIN questions q
ON q.title='Explain Homeostasis';

COMMIT;

---------------------------------------------------------
-- TEST ATTEMPT (IN PROGRESS)
---------------------------------------------------------

INSERT INTO test_attempts
(
    test_id,
    student_id,
    started_at,
    submitted_at,
    score,
    percentage,
    status
)

SELECT

    t.id,

    s.user_id,

    CURRENT_TIMESTAMP - INTERVAL '10 minutes',

    NULL,

    NULL,

    NULL,

    'IN_PROGRESS'

FROM tests t
CROSS JOIN
(
    SELECT user_id
    FROM students
    OFFSET 1
    LIMIT 1
) s

WHERE t.title='Physiology Quiz 1';

---------------------------------------------------------
-- AUTOSAVED ANSWER
---------------------------------------------------------

INSERT INTO student_answers
(
    attempt_id,
    question_id,
    selected_option_id,
    awarded_marks,
    is_correct
)

SELECT

    ta.id,

    q.id,

    (
        SELECT id
        FROM mcq_options
        WHERE question_id=q.id
        LIMIT 1
    ),

    NULL,

    NULL

FROM test_attempts ta
JOIN questions q
ON q.title='Homeostasis MCQ'

WHERE ta.status='IN_PROGRESS'

LIMIT 1;

---------------------------------------------------------
-- TEST ATTEMPT (EXPIRED)
---------------------------------------------------------

INSERT INTO test_attempts
(
    test_id,
    student_id,
    started_at,
    submitted_at,
    score,
    percentage,
    status
)

SELECT

    t.id,

    s.user_id,

    CURRENT_TIMESTAMP - INTERVAL '5 hours',

    NULL,

    NULL,

    NULL,

    'EXPIRED'

FROM tests t
CROSS JOIN
(
    SELECT user_id
    FROM students
    OFFSET 2
    LIMIT 1
) 

WHERE t.title='Physiology Quiz 1';

