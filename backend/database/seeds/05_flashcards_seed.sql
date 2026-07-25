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
-- FLASHCARD DECKS
---------------------------------------------------------

INSERT INTO flashcard_decks
(
    course_id,
    topic_id,
    lecture_id,
    created_by,
    title,
    description,
    is_published
)

SELECT

    c.id,

    t.id,

    l.id,

    (SELECT user_id FROM instructors LIMIT 1),

    'Homeostasis Flashcards',

    'Essential flashcards covering the fundamentals of homeostasis.',

    TRUE

FROM courses c
JOIN weeks w
ON w.course_id = c.id
JOIN lectures l
ON l.week_id = w.id
JOIN topics t
ON t.lecture_id = l.id

WHERE c.slug='physiology'
AND t.topic_name='Homeostasis';

---------------------------------------------------------

INSERT INTO flashcard_decks
(
    course_id,
    topic_id,
    lecture_id,
    created_by,
    title,
    description,
    is_published
)

SELECT

    c.id,

    t.id,

    l.id,

    (SELECT user_id FROM instructors LIMIT 1),

    'Membrane Transport Flashcards',

    'Review of membrane transport mechanisms.',

    TRUE

FROM courses c
JOIN weeks w
ON w.course_id=c.id
JOIN lectures l
ON l.week_id=w.id
JOIN topics t
ON t.lecture_id=l.id

WHERE c.slug='physiology'
AND t.topic_name='Membrane Transport';

---------------------------------------------------------
-- FLASHCARDS
---------------------------------------------------------

INSERT INTO flashcards
(
    deck_id,
    front_text,
    back_text,
    display_order
)

SELECT

    id,

    'What is homeostasis?',

    'The maintenance of a relatively stable internal environment despite external changes.',

    1

FROM flashcard_decks
WHERE title='Homeostasis Flashcards';

---------------------------------------------------------

INSERT INTO flashcards
(
    deck_id,
    front_text,
    back_text,
    display_order
)

SELECT

    id,

    'What is negative feedback?',

    'A control mechanism that reverses the initial stimulus to maintain stability.',

    2

FROM flashcard_decks
WHERE title='Homeostasis Flashcards';

---------------------------------------------------------

INSERT INTO flashcards
(
    deck_id,
    front_text,
    back_text,
    display_order
)

SELECT

    id,

    'Which transport mechanism requires ATP?',

    'Active transport.',

    1

FROM flashcard_decks
WHERE title='Membrane Transport Flashcards';

---------------------------------------------------------

INSERT INTO flashcards
(
    deck_id,
    front_text,
    back_text,
    display_order
)

SELECT

    id,

    'What is osmosis?',

    'The movement of water across a selectively permeable membrane from lower solute concentration to higher solute concentration.',

    2

FROM flashcard_decks
WHERE title='Membrane Transport Flashcards';

---------------------------------------------------------
-- STUDENT FLASHCARD PROGRESS
---------------------------------------------------------

INSERT INTO student_flashcard_progress
(
    student_id,
    flashcard_id,
    times_reviewed,
    mastery_level,
    last_reviewed_at
)

SELECT

    s.user_id,

    f.id,

    8,

    'MASTERED',

    CURRENT_TIMESTAMP - INTERVAL '1 day'

FROM

(
    SELECT user_id
    FROM students
    LIMIT 1
) s

JOIN flashcards f
ON f.front_text='What is homeostasis?';

---------------------------------------------------------

INSERT INTO student_flashcard_progress
(
    student_id,
    flashcard_id,
    times_reviewed,
    mastery_level,
    last_reviewed_at
)

SELECT

    s.user_id,

    f.id,

    5,

    'LEARNING',

    CURRENT_TIMESTAMP - INTERVAL '2 days'

FROM

(
    SELECT user_id
    FROM students
    LIMIT 1
) s

JOIN flashcards f
ON f.front_text='What is negative feedback?';

---------------------------------------------------------

INSERT INTO student_flashcard_progress
(
    student_id,
    flashcard_id,
    times_reviewed,
    mastery_level,
    last_reviewed_at
)

SELECT

    s.user_id,

    f.id,

    2,

    'NEW',

    CURRENT_TIMESTAMP - INTERVAL '7 days'

FROM

(
    SELECT user_id
    FROM students
    LIMIT 1
) s

JOIN flashcards f
ON f.front_text='Which transport mechanism requires ATP?';

COMMIT;

---------------------------------------------------------
-- FLASHCARD DECK (NOT STARTED)
---------------------------------------------------------

INSERT INTO flashcard_decks
(
    course_id,
    topic_id,
    lecture_id,
    created_by,
    title,
    description,
    is_published
)

SELECT

    c.id,

    t.id,

    l.id,

    (SELECT user_id FROM instructors LIMIT 1),

    'Cardiac Muscle Flashcards',

    'Flashcards covering the basic physiology of cardiac muscle.',

    TRUE

FROM courses c
JOIN weeks w
ON w.course_id = c.id
JOIN lectures l
ON l.week_id = w.id
JOIN topics t
ON t.lecture_id = l.id

WHERE c.slug = 'physiology'
LIMIT 1;

---------------------------------------------------------
-- FLASHCARDS
---------------------------------------------------------

INSERT INTO flashcards
(
    deck_id,
    front_text,
    back_text,
    display_order
)

SELECT

    id,

    'What is cardiac muscle?',

    'A specialized involuntary striated muscle found only in the heart.',

    1

FROM flashcard_decks
WHERE title = 'Cardiac Muscle Flashcards';

---------------------------------------------------------

INSERT INTO flashcards
(
    deck_id,
    front_text,
    back_text,
    display_order
)

SELECT

    id,

    'What is the function of intercalated discs?',

    'They electrically and mechanically connect cardiac muscle cells, allowing synchronized contraction.',

    2

FROM flashcard_decks
WHERE title = 'Cardiac Muscle Flashcards';

---------------------------------------------------------

INSERT INTO flashcards
(
    deck_id,
    front_text,
    back_text,
    display_order
)

SELECT

    id,

    'Why is cardiac muscle resistant to fatigue?',

    'Because it has abundant mitochondria and a continuous blood supply that supports aerobic metabolism.',

    3

FROM flashcard_decks
WHERE title = 'Cardiac Muscle Flashcards';