-- =====================================================
-- Medical Learning Platform
-- Flashcards Seed Data
-- =====================================================
--
-- Contains:
-- • Flashcard Decks
-- • Flashcards
-- • Student Flashcard Progress
--
-- =====================================================

BEGIN;

---------------------------------------------------------
-- Flashcard Deck 1
---------------------------------------------------------

INSERT INTO flashcard_decks
(
    course_id,
    lecture_id,
    created_by,
    title,
    description,
    is_published,
    display_order
)
SELECT
    c.id,
    l.id,
    i.user_id,
    'Anatomy Essentials',
    'Important anatomy flashcards.',
    TRUE,
    1
FROM courses c
JOIN weeks w
ON w.course_id = c.id
JOIN lectures l
ON l.week_id = w.id
CROSS JOIN instructors i
ORDER BY c.created_at, l.created_at
LIMIT 1;

---------------------------------------------------------
-- Flashcard Deck 2
---------------------------------------------------------

INSERT INTO flashcard_decks
(
    topic_id,
    created_by,
    title,
    description,
    is_published,
    display_order
)
SELECT
    t.id,
    i.user_id,
    'Clinical Concepts',
    'Clinical revision flashcards.',
    TRUE,
    2
FROM topics t
CROSS JOIN instructors i
ORDER BY t.created_at
LIMIT 1;

---------------------------------------------------------
-- Flashcards
---------------------------------------------------------

INSERT INTO flashcards
(
    deck_id,
    title,
    front_content,
    back_content,
    difficulty,
    explanation,
    hint,
    estimated_review_seconds,
    display_order,
    is_active
)

SELECT
    d.id,
    f.title,
    f.front_content,
    f.back_content,
    f.difficulty::question_difficulty,
    f.explanation,
    f.hint,
    f.review_seconds,
    f.display_order,
    TRUE

FROM flashcard_decks d

CROSS JOIN
(
    VALUES

    (
        'Heart Chambers',
        'How many chambers does the human heart have?',
        'Four chambers.',
        'EASY',
        'Two atria and two ventricles.',
        'Think about atria.',
        20,
        1
    ),

    (
        'Normal Temperature',
        'Normal human body temperature?',
        '37°C',
        'EASY',
        'Average normal body temperature.',
        'Measured in Celsius.',
        15,
        2
    ),

    (
        'Blood Circulation',
        'What is pulmonary circulation?',
        'Blood flow between the heart and lungs.',
        'MEDIUM',
        'Pulmonary circulation oxygenates blood.',
        'Starts at the right ventricle.',
        30,
        3
    )

) AS f
(
    title,
    front_content,
    back_content,
    difficulty,
    explanation,
    hint,
    review_seconds,
    display_order
);

---------------------------------------------------------
-- Student Flashcard Progress
---------------------------------------------------------

INSERT INTO student_flashcard_progress
(
    student_id,
    flashcard_id,
    times_reviewed,
    times_correct,
    times_incorrect,
    review_streak,
    last_reviewed_at,
    next_review_at,
    is_mastered,
    mastered_at,
    ease_factor,
    interval_days,
    created_by
)

SELECT

    s.user_id,

    fc.id,

    5,

    4,

    1,

    3,

    CURRENT_TIMESTAMP - INTERVAL '1 day',

    CURRENT_TIMESTAMP + INTERVAL '3 days',

    FALSE,

    NULL,

    2.50,

    3,

    i.user_id

FROM students s

CROSS JOIN flashcards fc

CROSS JOIN instructors i

LIMIT 5;

COMMIT;