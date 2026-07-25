-- =====================================================
-- Medical Learning Platform
-- Question Bank Seed Data
-- =====================================================
--
-- Contains:
-- • Question Tags
-- • MCQ Questions
-- • Essay Questions
-- • MCQ Options
-- • Essay Configurations
-- • Question Tags Mapping
--
-- =====================================================

BEGIN;

---------------------------------------------------------
-- QUESTION TAGS
---------------------------------------------------------

INSERT INTO question_tags (name)
VALUES
('Easy'),
('Medium'),
('Hard'),
('Important'),
('Revision'),
('Midterm'),
('Final'),
('Clinical'),
('Homeostasis'),
('Cell Membrane'),
('Membrane Transport');

---------------------------------------------------------
-- MCQ QUESTIONS
---------------------------------------------------------

INSERT INTO questions
(
    topic_id,
    created_by,
    question_type,
    title,
    question_text,
    explanation,
    hint,
    reference,
    difficulty,
    estimated_time_seconds,
    marks,
    is_question_bank,
    is_active
)

SELECT

    t.id,

    (
        SELECT user_id
        FROM instructors
        LIMIT 1
    ),

    'MCQ',

    'Homeostasis MCQ',

    'Which of the following best defines homeostasis?',

    'Homeostasis is the maintenance of a relatively stable internal environment despite changes in external conditions.',

    'Think about internal balance.',

    'Guyton & Hall Textbook of Medical Physiology',

    'EASY',

    60,

    1,

    TRUE,

    TRUE

FROM topics t
WHERE topic_name='Homeostasis';

---------------------------------------------------------

INSERT INTO questions
(
    topic_id,
    created_by,
    question_type,
    title,
    question_text,
    explanation,
    hint,
    reference,
    difficulty,
    estimated_time_seconds,
    marks,
    is_question_bank,
    is_active
)

SELECT

    t.id,

    (
        SELECT user_id
        FROM instructors
        LIMIT 1
    ),

    'MCQ',

    'Membrane Transport',

    'Which transport mechanism requires ATP?',

    'Active transport requires ATP because substances move against their concentration gradient.',

    'Think about concentration gradients.',

    'Guyton & Hall',

    'MEDIUM',

    75,

    1,

    TRUE,

    TRUE

FROM topics t
WHERE topic_name='Membrane Transport';

---------------------------------------------------------
-- ESSAY QUESTION
---------------------------------------------------------

INSERT INTO questions
(
    topic_id,
    created_by,
    question_type,
    title,
    question_text,
    explanation,
    hint,
    reference,
    difficulty,
    estimated_time_seconds,
    marks,
    is_question_bank,
    is_active
)

SELECT

    t.id,

    (
        SELECT user_id
        FROM instructors
        LIMIT 1
    ),

    'ESSAY',

    'Explain Homeostasis',

    'Explain the concept of homeostasis with suitable examples.',

    'A good answer should define homeostasis, explain positive and negative feedback mechanisms, and provide examples such as body temperature regulation.',

    'Mention feedback mechanisms.',

    'Guyton & Hall',

    'MEDIUM',

    600,

    10,

    TRUE,

    TRUE

FROM topics t
WHERE topic_name='Homeostasis';

---------------------------------------------------------
-- MCQ OPTIONS
---------------------------------------------------------

INSERT INTO mcq_options
(
    question_id,
    option_text,
    is_correct,
    display_order
)

SELECT

    q.id,

    'Maintaining a stable internal environment',

    TRUE,

    1

FROM questions q
WHERE q.title='Homeostasis MCQ';

INSERT INTO mcq_options
(
    question_id,
    option_text,
    is_correct,
    display_order
)

SELECT q.id,'Increasing body temperature',FALSE,2
FROM questions q
WHERE q.title='Homeostasis MCQ';

INSERT INTO mcq_options
(
    question_id,
    option_text,
    is_correct,
    display_order
)

SELECT q.id,'Producing ATP',FALSE,3
FROM questions q
WHERE q.title='Homeostasis MCQ';

INSERT INTO mcq_options
(
    question_id,
    option_text,
    is_correct,
    display_order
)

SELECT q.id,'Cell division',FALSE,4
FROM questions q
WHERE q.title='Homeostasis MCQ';

---------------------------------------------------------

INSERT INTO mcq_options
(
    question_id,
    option_text,
    is_correct,
    display_order
)

SELECT q.id,'Passive diffusion',FALSE,1
FROM questions q
WHERE q.title='Membrane Transport';

INSERT INTO mcq_options
(
    question_id,
    option_text,
    is_correct,
    display_order
)

SELECT q.id,'Facilitated diffusion',FALSE,2
FROM questions q
WHERE q.title='Membrane Transport';

INSERT INTO mcq_options
(
    question_id,
    option_text,
    is_correct,
    display_order
)

SELECT q.id,'Active transport',TRUE,3
FROM questions q
WHERE q.title='Membrane Transport';

INSERT INTO mcq_options
(
    question_id,
    option_text,
    is_correct,
    display_order
)

SELECT q.id,'Osmosis',FALSE,4
FROM questions q
WHERE q.title='Membrane Transport';

---------------------------------------------------------
-- ESSAY CONFIGURATION
---------------------------------------------------------

INSERT INTO essay_configurations
(
    question_id,
    recommended_word_count,
    maximum_score
)

SELECT

    id,

    300,

    10

FROM questions
WHERE title='Explain Homeostasis';

---------------------------------------------------------
-- QUESTION TAG RELATIONSHIPS
---------------------------------------------------------

INSERT INTO question_tag_mapping
(
    question_id,
    tag_id
)

SELECT

    q.id,

    t.id

FROM questions q
JOIN question_tags t
ON t.name='Easy'

WHERE q.title='Homeostasis MCQ';

---------------------------------------------------------

INSERT INTO question_tag_mapping
(
    question_id,
    tag_id
)

SELECT

    q.id,

    t.id

FROM questions q
JOIN question_tags t
ON t.name='Homeostasis'

WHERE q.title='Homeostasis MCQ';

---------------------------------------------------------

INSERT INTO question_tag_mapping
(
    question_id,
    tag_id
)

SELECT

    q.id,

    t.id

FROM questions q
JOIN question_tags t
ON t.name='Medium'

WHERE q.title='Explain Homeostasis';

---------------------------------------------------------

INSERT INTO question_tag_mapping
(
    question_id,
    tag_id
)

SELECT

    q.id,

    t.id

FROM questions q
JOIN question_tags t
ON t.name='Homeostasis'

WHERE q.title='Explain Homeostasis';

COMMIT;