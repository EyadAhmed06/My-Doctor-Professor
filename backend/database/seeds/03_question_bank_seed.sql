-- =====================================================
-- Medical Learning Platform
-- Question Bank Seed Data
-- =====================================================
--
-- Contains:
-- • Questions
-- • MCQ Options
-- • Essay Configurations
-- • Tags
-- • Question Tags
--
-- =====================================================

BEGIN;

---------------------------------------------------------
-- Tags
---------------------------------------------------------

INSERT INTO tags (tag_name)
VALUES
('Easy'),
('Medium'),
('Hard'),
('Exam'),
('Clinical'),
('Revision'),
('Anatomy'),
('Physiology'),
('Pathology'),
('Pharmacology');

---------------------------------------------------------
-- Questions
---------------------------------------------------------

INSERT INTO questions
(
    topic_id,
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
    version,
    is_active,
    created_by
)

---------------------------------------------------------
-- MCQ 1
---------------------------------------------------------
SELECT
    t.id,
    'MCQ'::question_type,
    'Human Heart',
    'How many chambers does the human heart have?',
    'The human heart consists of two atria and two ventricles.',
    'Think about atria and ventricles.',
    'Anatomy Textbook',
    'EASY'::question_difficulty,
    30,
    1,
    TRUE,
    1,
    TRUE,
    i.user_id
FROM topics t
CROSS JOIN instructors i
WHERE t.topic_name='Overview'
LIMIT 1;

---------------------------------------------------------
-- MCQ 2
---------------------------------------------------------

INSERT INTO questions
(
    topic_id,
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
    version,
    is_active,
    created_by
)
SELECT
    t.id,
    'MCQ'::question_type,
    'Normal Body Temperature',
    'What is the normal human body temperature?',
    '37°C is considered the normal average body temperature.',
    'Measured in Celsius.',
    'Physiology Textbook',
    'EASY'::question_difficulty,
    30,
    1,
    TRUE,
    1,
    TRUE,
    i.user_id
FROM topics t
CROSS JOIN instructors i
WHERE t.topic_name='Key Concepts'
LIMIT 1;

---------------------------------------------------------
-- Essay Question
---------------------------------------------------------

INSERT INTO questions
(
    topic_id,
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
    version,
    is_active,
    created_by
)
SELECT
    t.id,
    'ESSAY'::question_type,
    'Describe Blood Circulation',
    'Explain the complete pathway of blood circulation through the human body.',
    NULL,
    'Think about pulmonary and systemic circulation.',
    'Guyton Physiology',
    'MEDIUM'::question_difficulty,
    600,
    10,
    TRUE,
    1,
    TRUE,
    i.user_id
FROM topics t
CROSS JOIN instructors i
WHERE t.topic_name='Clinical Applications'
LIMIT 1;

---------------------------------------------------------
-- MCQ Options
---------------------------------------------------------

INSERT INTO mcq_options
(question_id, option_text, is_correct, display_order)

SELECT
q.id,
v.option_text,
v.is_correct,
v.display_order

FROM questions q

JOIN
(
VALUES
(
'Human Heart',
'2',
FALSE,
1
),

(
'Human Heart',
'3',
FALSE,
2
),

(
'Human Heart',
'4',
TRUE,
3
),

(
'Human Heart',
'5',
FALSE,
4
),

(
'Normal Body Temperature',
'35°C',
FALSE,
1
),

(
'Normal Body Temperature',
'36°C',
FALSE,
2
),

(
'Normal Body Temperature',
'37°C',
TRUE,
3
),

(
'Normal Body Temperature',
'38°C',
FALSE,
4
)

) v
(
question_title,
option_text,
is_correct,
display_order
)

ON q.title=v.question_title;

---------------------------------------------------------
-- Essay Configuration
---------------------------------------------------------

INSERT INTO essay_configurations
(
question_id,
minimum_word_count,
maximum_word_count,
model_answer,
grading_rubric
)

SELECT

id,
150,
500,
'Students should describe pulmonary and systemic circulation in the correct order.',
'Correct sequence, terminology, completeness and clarity.'

FROM questions

WHERE question_type='ESSAY';

---------------------------------------------------------
-- Question Tags
---------------------------------------------------------

INSERT INTO question_tags
(
question_id,
tag_id
)

SELECT
q.id,
t.id

FROM questions q

JOIN tags t

ON
(
q.title='Human Heart'
AND t.tag_name='Anatomy'
)

OR
(
q.title='Normal Body Temperature'
AND t.tag_name='Physiology'
)

OR
(
q.title='Describe Blood Circulation'
AND t.tag_name='Clinical'
);

COMMIT;