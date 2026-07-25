-- =====================================================
-- Medical Learning Platform
-- Demo Data Seed
-- =====================================================
--
-- Contains:
-- • Additional Courses
-- • Additional Lectures
-- • Additional Topics
-- • Additional Resources
-- • Additional Questions
-- • Additional Flashcards
-- • Progress Samples
-- • Notifications
-- • Audit Logs
--
-- Run after:
-- 01_users_seed.sql
-- 02_academic_seed.sql
-- 03_question_bank_seed.sql
-- 04_tests_seed.sql
-- 05_flashcards_seed.sql
-- 06_student_progress_seed.sql
-- 07_audit_seed.sql
-- 08_notifications_seed.sql
-- =====================================================

BEGIN;

---------------------------------------------------------
-- ADDITIONAL COURSES
---------------------------------------------------------

INSERT INTO courses
(
    semester_id,
    course_code,
    course_name,
    slug,
    description,
    credit_hours,
    is_active,
    display_order
)
SELECT
    s.id,
    'MED201',
    'Biochemistry',
    'biochemistry',
    'Fundamentals of biochemical structures, enzymes, and metabolism.',
    4,
    TRUE,
    1
FROM semesters s
WHERE s.semester_number = 2;

INSERT INTO courses
(
    semester_id,
    course_code,
    course_name,
    slug,
    description,
    credit_hours,
    is_active,
    display_order
)
SELECT
    s.id,
    'MED202',
    'Pathology',
    'pathology',
    'Introduction to disease processes, cell injury, and tissue responses.',
    4,
    TRUE,
    2
FROM semesters s
WHERE s.semester_number = 2;

---------------------------------------------------------
-- ADDITIONAL WEEKS
---------------------------------------------------------

INSERT INTO weeks
(
    course_id,
    week_number,
    title,
    description,
    display_order
)
SELECT
    c.id,
    1,
    'Biochemistry Week 1',
    'Biomolecules and enzymes',
    1
FROM courses c
WHERE c.slug = 'biochemistry';

INSERT INTO weeks
(
    course_id,
    week_number,
    title,
    description,
    display_order
)
SELECT
    c.id,
    2,
    'Biochemistry Week 2',
    'Carbohydrate metabolism',
    2
FROM courses c
WHERE c.slug = 'biochemistry';

INSERT INTO weeks
(
    course_id,
    week_number,
    title,
    description,
    display_order
)
SELECT
    c.id,
    1,
    'Pathology Week 1',
    'Cell injury and adaptation',
    1
FROM courses c
WHERE c.slug = 'pathology';

---------------------------------------------------------
-- ADDITIONAL LECTURES
---------------------------------------------------------

INSERT INTO lectures
(
    week_id,
    lecture_number,
    title,
    description,
    estimated_duration_minutes,
    is_published,
    display_order
)
SELECT
    w.id,
    1,
    'Biomolecules',
    'Carbohydrates, proteins, lipids, and nucleic acids.',
    90,
    TRUE,
    1
FROM weeks w
JOIN courses c ON c.id = w.course_id
WHERE c.slug = 'biochemistry'
  AND w.week_number = 1;

INSERT INTO lectures
(
    week_id,
    lecture_number,
    title,
    description,
    estimated_duration_minutes,
    is_published,
    display_order
)
SELECT
    w.id,
    2,
    'Enzymes and Catalysis',
    'Enzyme structure, function, and inhibition.',
    75,
    TRUE,
    2
FROM weeks w
JOIN courses c ON c.id = w.course_id
WHERE c.slug = 'biochemistry'
  AND w.week_number = 1;

INSERT INTO lectures
(
    week_id,
    lecture_number,
    title,
    description,
    estimated_duration_minutes,
    is_published,
    display_order
)
SELECT
    w.id,
    1,
    'Carbohydrate Metabolism',
    'Glycolysis, glycogen metabolism, and regulation.',
    120,
    TRUE,
    1
FROM weeks w
JOIN courses c ON c.id = w.course_id
WHERE c.slug = 'biochemistry'
  AND w.week_number = 2;

INSERT INTO lectures
(
    week_id,
    lecture_number,
    title,
    description,
    estimated_duration_minutes,
    is_published,
    display_order
)
SELECT
    w.id,
    1,
    'Cell Injury and Adaptation',
    'Reversible injury, necrosis, and apoptosis.',
    110,
    TRUE,
    1
FROM weeks w
JOIN courses c ON c.id = w.course_id
WHERE c.slug = 'pathology'
  AND w.week_number = 1;

---------------------------------------------------------
-- TOPICS
---------------------------------------------------------

INSERT INTO topics
(
    lecture_id,
    topic_name,
    description,
    display_order
)
SELECT
    l.id,
    'Nucleic Acids',
    'DNA and RNA structure and function.',
    1
FROM lectures l
WHERE l.title = 'Biomolecules';

INSERT INTO topics
(
    lecture_id,
    topic_name,
    description,
    display_order
)
SELECT
    l.id,
    'Proteins',
    'Protein structure and basic biochemical roles.',
    2
FROM lectures l
WHERE l.title = 'Biomolecules';

INSERT INTO topics
(
    lecture_id,
    topic_name,
    description,
    display_order
)
SELECT
    l.id,
    'Enzyme Kinetics',
    'How enzymes catalyse reactions and how inhibition works.',
    1
FROM lectures l
WHERE l.title = 'Enzymes and Catalysis';

INSERT INTO topics
(
    lecture_id,
    topic_name,
    description,
    display_order
)
SELECT
    l.id,
    'Carbohydrate Metabolism',
    'Major stages of glucose breakdown and regulation.',
    1
FROM lectures l
WHERE l.title = 'Carbohydrate Metabolism';

INSERT INTO topics
(
    lecture_id,
    topic_name,
    description,
    display_order
)
SELECT
    l.id,
    'Cell Injury',
    'General mechanisms of cellular injury and adaptation.',
    1
FROM lectures l
WHERE l.title = 'Cell Injury and Adaptation';

INSERT INTO topics
(
    lecture_id,
    topic_name,
    description,
    display_order
)
SELECT
    l.id,
    'Necrosis',
    'Uncontrolled cell death associated with inflammation.',
    2
FROM lectures l
WHERE l.title = 'Cell Injury and Adaptation';

INSERT INTO topics
(
    lecture_id,
    topic_name,
    description,
    display_order
)
SELECT
    l.id,
    'Apoptosis',
    'Programmed cell death and its physiological significance.',
    3
FROM lectures l
WHERE l.title = 'Cell Injury and Adaptation';

---------------------------------------------------------
-- RESOURCES
---------------------------------------------------------

INSERT INTO resources
(
    lecture_id,
    resource_name,
    resource_type,
    upload_status,
    file_url,
    file_size,
    description
)
SELECT
    l.id,
    'Biomolecules Slides',
    'PDF',
    'UPLOADED',
    'https://example.com/demo/biochemistry/biomolecules-slides.pdf',
    2457600,
    'Slides for the biomolecules lecture.'
FROM lectures l
WHERE l.title = 'Biomolecules';

INSERT INTO resources
(
    lecture_id,
    resource_name,
    resource_type,
    upload_status,
    file_url,
    file_size,
    description
)
SELECT
    l.id,
    'Enzyme Lecture Recording',
    'VIDEO',
    'UPLOADED',
    'https://example.com/demo/biochemistry/enzymes-recording.mp4',
    120000000,
    'Recorded video of the enzymes lecture.'
FROM lectures l
WHERE l.title = 'Enzymes and Catalysis';

INSERT INTO resources
(
    lecture_id,
    resource_name,
    resource_type,
    upload_status,
    file_url,
    file_size,
    description
)
SELECT
    l.id,
    'Pathology Notes',
    'PDF',
    'UPLOADED',
    'https://example.com/demo/pathology/cell-injury-notes.pdf',
    1843200,
    'Notes for cell injury and adaptation.'
FROM lectures l
WHERE l.title = 'Cell Injury and Adaptation';

---------------------------------------------------------
-- ADDITIONAL QUESTIONS
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
    (SELECT user_id FROM instructors ORDER BY user_id LIMIT 1),
    'MCQ',
    'Nucleic Acids MCQ',
    'Which molecule carries genetic information?',
    'DNA is the main molecule that stores genetic information in most organisms.',
    'Think of the central dogma.',
    'Biochemistry lecture notes',
    'EASY',
    60,
    1,
    TRUE,
    TRUE
FROM topics t
WHERE t.topic_name = 'Nucleic Acids';

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
    (SELECT user_id FROM instructors ORDER BY user_id LIMIT 1),
    'MCQ',
    'Enzyme Kinetics MCQ',
    'What is the primary role of enzymes in biological reactions?',
    'Enzymes lower activation energy, making reactions proceed faster without being consumed.',
    'What do catalysts do?',
    'Biochemistry lecture notes',
    'MEDIUM',
    75,
    1,
    TRUE,
    TRUE
FROM topics t
WHERE t.topic_name = 'Enzyme Kinetics';

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
    (SELECT user_id FROM instructors ORDER BY user_id LIMIT 1),
    'ESSAY',
    'Explain Glycolysis',
    'Explain the steps of glycolysis and mention why it is important.',
    'A good answer should describe the energy investment phase, energy payoff phase, and the net ATP yield.',
    'Mention ATP and pyruvate.',
    'Biochemistry lecture notes',
    'MEDIUM',
    600,
    10,
    TRUE,
    TRUE
FROM topics t
WHERE t.topic_name = 'Carbohydrate Metabolism';

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
    (SELECT user_id FROM instructors ORDER BY user_id LIMIT 1),
    'MCQ',
    'Necrosis MCQ',
    'Which feature is most associated with necrosis?',
    'Necrosis is typically associated with inflammation and unregulated cell death.',
    'Think about inflammation.',
    'Pathology lecture notes',
    'EASY',
    60,
    1,
    TRUE,
    TRUE
FROM topics t
WHERE t.topic_name = 'Necrosis';

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
    (SELECT user_id FROM instructors ORDER BY user_id LIMIT 1),
    'ESSAY',
    'Differentiate Necrosis and Apoptosis',
    'Differentiate necrosis and apoptosis in terms of mechanism and outcome.',
    'A good answer should compare the process, inflammatory response, and physiological significance.',
    'One is programmed, the other is not.',
    'Pathology lecture notes',
    'HARD',
    900,
    10,
    TRUE,
    TRUE
FROM topics t
WHERE t.topic_name = 'Apoptosis';

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
    (SELECT user_id FROM instructors ORDER BY user_id LIMIT 1),
    'MCQ',
    'Cell Injury MCQ',
    'Which of the following is a reversible cell injury?',
    'Cell swelling is a classic example of reversible cell injury.',
    'Think about swelling.',
    'Pathology lecture notes',
    'MEDIUM',
    60,
    1,
    TRUE,
    TRUE
FROM topics t
WHERE t.topic_name = 'Cell Injury';

---------------------------------------------------------
-- MCQ OPTIONS
---------------------------------------------------------

INSERT INTO mcq_options (question_id, option_text, is_correct, display_order)
SELECT q.id, 'DNA', TRUE, 1
FROM questions q
WHERE q.title = 'Nucleic Acids MCQ';

INSERT INTO mcq_options (question_id, option_text, is_correct, display_order)
SELECT q.id, 'Lipids', FALSE, 2
FROM questions q
WHERE q.title = 'Nucleic Acids MCQ';

INSERT INTO mcq_options (question_id, option_text, is_correct, display_order)
SELECT q.id, 'Glucose', FALSE, 3
FROM questions q
WHERE q.title = 'Nucleic Acids MCQ';

INSERT INTO mcq_options (question_id, option_text, is_correct, display_order)
SELECT q.id, 'Amino acids', FALSE, 4
FROM questions q
WHERE q.title = 'Nucleic Acids MCQ';

INSERT INTO mcq_options (question_id, option_text, is_correct, display_order)
SELECT q.id, 'Lower activation energy', TRUE, 1
FROM questions q
WHERE q.title = 'Enzyme Kinetics MCQ';

INSERT INTO mcq_options (question_id, option_text, is_correct, display_order)
SELECT q.id, 'Store genetic information', FALSE, 2
FROM questions q
WHERE q.title = 'Enzyme Kinetics MCQ';

INSERT INTO mcq_options (question_id, option_text, is_correct, display_order)
SELECT q.id, 'Produce ATP directly', FALSE, 3
FROM questions q
WHERE q.title = 'Enzyme Kinetics MCQ';

INSERT INTO mcq_options (question_id, option_text, is_correct, display_order)
SELECT q.id, 'Form membranes', FALSE, 4
FROM questions q
WHERE q.title = 'Enzyme Kinetics MCQ';

INSERT INTO mcq_options (question_id, option_text, is_correct, display_order)
SELECT q.id, 'Inflammation is commonly present', TRUE, 1
FROM questions q
WHERE q.title = 'Necrosis MCQ';

INSERT INTO mcq_options (question_id, option_text, is_correct, display_order)
SELECT q.id, 'Always physiologic', FALSE, 2
FROM questions q
WHERE q.title = 'Necrosis MCQ';

INSERT INTO mcq_options (question_id, option_text, is_correct, display_order)
SELECT q.id, 'Requires no membrane damage', FALSE, 3
FROM questions q
WHERE q.title = 'Necrosis MCQ';

INSERT INTO mcq_options (question_id, option_text, is_correct, display_order)
SELECT q.id, 'Is the same as apoptosis', FALSE, 4
FROM questions q
WHERE q.title = 'Necrosis MCQ';

INSERT INTO mcq_options (question_id, option_text, is_correct, display_order)
SELECT q.id, 'Cell swelling', TRUE, 1
FROM questions q
WHERE q.title = 'Cell Injury MCQ';

INSERT INTO mcq_options (question_id, option_text, is_correct, display_order)
SELECT q.id, 'Nuclear fragmentation', FALSE, 2
FROM questions q
WHERE q.title = 'Cell Injury MCQ';

INSERT INTO mcq_options (question_id, option_text, is_correct, display_order)
SELECT q.id, 'Membrane rupture', FALSE, 3
FROM questions q
WHERE q.title = 'Cell Injury MCQ';

INSERT INTO mcq_options (question_id, option_text, is_correct, display_order)
SELECT q.id, 'DNA laddering', FALSE, 4
FROM questions q
WHERE q.title = 'Cell Injury MCQ';

---------------------------------------------------------
-- ESSAY CONFIGURATIONS
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
    q.id,
    250,
    500,
    'Glycolysis is the cytoplasmic pathway that breaks glucose into pyruvate through an investment phase and a payoff phase, producing net ATP and NADH.',
    'Should define glycolysis, describe its stages, mention net ATP yield, and explain why it is important.'
FROM questions q
WHERE q.title = 'Explain Glycolysis';

INSERT INTO essay_configurations
(
    question_id,
    minimum_word_count,
    maximum_word_count,
    model_answer,
    grading_rubric
)
SELECT
    q.id,
    300,
    600,
    'Necrosis is uncontrolled cell death associated with inflammation and membrane rupture, while apoptosis is programmed cell death that is energy-dependent and usually non-inflammatory.',
    'Should compare mechanism, inflammation, membrane integrity, and biological significance.'
FROM questions q
WHERE q.title = 'Differentiate Necrosis and Apoptosis';

---------------------------------------------------------
-- QUESTION TAGS
---------------------------------------------------------

INSERT INTO question_tags (question_id, tag_id)
SELECT q.id, t.id
FROM questions q
JOIN tags t ON t.tag_name = 'Important'
WHERE q.title IN ('Nucleic Acids MCQ', 'Enzyme Kinetics MCQ', 'Necrosis MCQ', 'Cell Injury MCQ');

INSERT INTO question_tags (question_id, tag_id)
SELECT q.id, t.id
FROM questions q
JOIN tags t ON t.tag_name = 'Revision'
WHERE q.title IN ('Explain Glycolysis', 'Differentiate Necrosis and Apoptosis');

INSERT INTO question_tags (question_id, tag_id)
SELECT q.id, t.id
FROM questions q
JOIN tags t ON t.tag_name = 'Clinical'
WHERE q.title IN ('Necrosis MCQ', 'Differentiate Necrosis and Apoptosis');

INSERT INTO question_tags (question_id, tag_id)
SELECT q.id, t.id
FROM questions q
JOIN tags t ON t.tag_name = 'Medium'
WHERE q.title IN ('Enzyme Kinetics MCQ', 'Explain Glycolysis', 'Cell Injury MCQ');

INSERT INTO question_tags (question_id, tag_id)
SELECT q.id, t.id
FROM questions q
JOIN tags t ON t.tag_name = 'Hard'
WHERE q.title = 'Differentiate Necrosis and Apoptosis';

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
    is_published,
    display_order
)
SELECT
    c.id,
    t.id,
    l.id,
    (SELECT user_id FROM instructors ORDER BY user_id LIMIT 1),
    'Biochemistry Essentials',
    'Core flashcards for biochemistry fundamentals.',
    TRUE,
    1
FROM courses c
JOIN lectures l
    ON l.title = 'Biomolecules'
JOIN topics t
    ON t.lecture_id = l.id
WHERE c.slug = 'biochemistry'
  AND t.topic_name = 'Nucleic Acids';

INSERT INTO flashcard_decks
(
    course_id,
    topic_id,
    lecture_id,
    created_by,
    title,
    description,
    is_published,
    display_order
)
SELECT
    c.id,
    t.id,
    l.id,
    (SELECT user_id FROM instructors ORDER BY user_id LIMIT 1),
    'Pathology Essentials',
    'Core flashcards for cell injury and death.',
    TRUE,
    2
FROM courses c
JOIN lectures l
    ON l.title = 'Cell Injury and Adaptation'
JOIN topics t
    ON t.lecture_id = l.id
WHERE c.slug = 'pathology'
  AND t.topic_name = 'Cell Injury';

---------------------------------------------------------
-- FLASHCARDS
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
    display_order,
    is_active
)
SELECT
    d.id,
    'DNA',
    'What molecule carries genetic information?',
    'DNA carries hereditary information in most organisms.',
    'EASY',
    'DNA stores the genetic blueprint used for replication and transcription.',
    'Think about the central dogma.',
    1,
    TRUE
FROM flashcard_decks d
WHERE d.title = 'Biochemistry Essentials';

INSERT INTO flashcards
(
    deck_id,
    title,
    front_content,
    back_content,
    difficulty,
    explanation,
    hint,
    display_order,
    is_active
)
SELECT
    d.id,
    'Enzymes',
    'What is the main function of enzymes?',
    'They lower activation energy and speed up reactions.',
    'MEDIUM',
    'Enzymes are biological catalysts that do not get consumed in the reaction.',
    'What do catalysts do?',
    2,
    TRUE
FROM flashcard_decks d
WHERE d.title = 'Biochemistry Essentials';

INSERT INTO flashcards
(
    deck_id,
    title,
    front_content,
    back_content,
    difficulty,
    explanation,
    hint,
    display_order,
    is_active
)
SELECT
    d.id,
    'Glycolysis',
    'Where does glycolysis occur?',
    'In the cytoplasm.',
    'MEDIUM',
    'Glycolysis is the initial pathway of glucose breakdown and occurs in the cytoplasm.',
    'Think of the cell compartment outside the mitochondria.',
    3,
    TRUE
FROM flashcard_decks d
WHERE d.title = 'Biochemistry Essentials';

INSERT INTO flashcards
(
    deck_id,
    title,
    front_content,
    back_content,
    difficulty,
    explanation,
    hint,
    display_order,
    is_active
)
SELECT
    d.id,
    'Necrosis',
    'Which type of cell death is associated with inflammation?',
    'Necrosis.',
    'EASY',
    'Necrosis is uncontrolled cell death and usually causes inflammation.',
    'Think of membrane rupture.',
    1,
    TRUE
FROM flashcard_decks d
WHERE d.title = 'Pathology Essentials';

INSERT INTO flashcards
(
    deck_id,
    title,
    front_content,
    back_content,
    difficulty,
    explanation,
    hint,
    display_order,
    is_active
)
SELECT
    d.id,
    'Apoptosis',
    'Which type of cell death is programmed and non-inflammatory?',
    'Apoptosis.',
    'MEDIUM',
    'Apoptosis is a controlled, energy-dependent process that typically does not trigger inflammation.',
    'Think of programmed cell death.',
    2,
    TRUE
FROM flashcard_decks d
WHERE d.title = 'Pathology Essentials';

INSERT INTO flashcards
(
    deck_id,
    title,
    front_content,
    back_content,
    difficulty,
    explanation,
    hint,
    display_order,
    is_active
)
SELECT
    d.id,
    'Cell Swelling',
    'What is a classic reversible cell injury?',
    'Cell swelling.',
    'MEDIUM',
    'Cell swelling is a typical early reversible change in injured cells.',
    'Think of water moving into the cell.',
    3,
    TRUE
FROM flashcard_decks d
WHERE d.title = 'Pathology Essentials';

---------------------------------------------------------
-- STUDENT FLASHCARD PROGRESS
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
    interval_days
)
SELECT
    s.user_id,
    f.id,
    8,
    7,
    1,
    4,
    CURRENT_TIMESTAMP - INTERVAL '1 day',
    CURRENT_TIMESTAMP + INTERVAL '2 days',
    TRUE,
    CURRENT_TIMESTAMP - INTERVAL '1 day',
    2.50,
    14
FROM (
    SELECT user_id
    FROM students
    ORDER BY user_id
    LIMIT 1
) s
JOIN flashcards f
    ON f.title = 'DNA';

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
    interval_days
)
SELECT
    s.user_id,
    f.id,
    5,
    4,
    1,
    2,
    CURRENT_TIMESTAMP - INTERVAL '2 days',
    CURRENT_TIMESTAMP + INTERVAL '1 day',
    FALSE,
    NULL,
    2.10,
    7
FROM (
    SELECT user_id
    FROM students
    ORDER BY user_id
    LIMIT 1
) s
JOIN flashcards f
    ON f.title = 'Enzymes';

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
    interval_days
)
SELECT
    s.user_id,
    f.id,
    2,
    1,
    1,
    0,
    CURRENT_TIMESTAMP - INTERVAL '5 days',
    CURRENT_TIMESTAMP + INTERVAL '3 days',
    FALSE,
    NULL,
    1.90,
    4
FROM (
    SELECT user_id
    FROM students
    ORDER BY user_id
    LIMIT 1
) s
JOIN flashcards f
    ON f.title = 'Necrosis';

---------------------------------------------------------
-- STUDENT PROGRESS
---------------------------------------------------------

INSERT INTO student_course_progress
(
    student_id,
    course_id,
    completion_percentage,
    lectures_completed,
    total_lectures,
    average_score,
    last_accessed_at,
    completed_at
)
SELECT
    s.user_id,
    c.id,
    45,
    2,
    4,
    78.25,
    CURRENT_TIMESTAMP - INTERVAL '6 hours',
    NULL
FROM (
    SELECT user_id
    FROM students
    ORDER BY user_id
    LIMIT 1
) s
JOIN courses c
    ON c.slug = 'biochemistry';

INSERT INTO student_course_progress
(
    student_id,
    course_id,
    completion_percentage,
    lectures_completed,
    total_lectures,
    average_score,
    last_accessed_at,
    completed_at
)
SELECT
    s.user_id,
    c.id,
    20,
    1,
    2,
    64.50,
    CURRENT_TIMESTAMP - INTERVAL '1 day',
    NULL
FROM (
    SELECT user_id
    FROM students
    ORDER BY user_id
    LIMIT 1
) s
JOIN courses c
    ON c.slug = 'pathology';

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
    CURRENT_TIMESTAMP - INTERVAL '1 day',
    CURRENT_TIMESTAMP - INTERVAL '1 day'
FROM (
    SELECT user_id
    FROM students
    ORDER BY user_id
    LIMIT 1
) s
JOIN lectures l
    ON l.title = 'Biomolecules';

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
    FALSE,
    60,
    48,
    CURRENT_TIMESTAMP - INTERVAL '4 hours',
    NULL
FROM (
    SELECT user_id
    FROM students
    ORDER BY user_id
    LIMIT 1
) s
JOIN lectures l
    ON l.title = 'Enzymes and Catalysis';

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
    12,
    10,
    2,
    85.00,
    83.33,
    88.00,
    CURRENT_TIMESTAMP - INTERVAL '1 day'
FROM (
    SELECT user_id
    FROM students
    ORDER BY user_id
    LIMIT 1
) s
JOIN topics t
    ON t.topic_name = 'Nucleic Acids';

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
    9,
    7,
    2,
    78.00,
    77.78,
    81.00,
    CURRENT_TIMESTAMP - INTERVAL '2 hours'
FROM (
    SELECT user_id
    FROM students
    ORDER BY user_id
    LIMIT 1
) s
JOIN topics t
    ON t.topic_name = 'Cell Injury';

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
    4,
    4,
    0,
    TRUE,
    TRUE,
    CURRENT_TIMESTAMP - INTERVAL '1 day'
FROM (
    SELECT user_id
    FROM students
    ORDER BY user_id
    LIMIT 1
) s
JOIN questions q
    ON q.title = 'Nucleic Acids MCQ';

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
    FALSE,
    FALSE,
    CURRENT_TIMESTAMP - INTERVAL '3 hours'
FROM (
    SELECT user_id
    FROM students
    ORDER BY user_id
    LIMIT 1
) s
JOIN questions q
    ON q.title = 'Necrosis MCQ';

---------------------------------------------------------
-- ZERO-PROGRESS ROWS FOR SECOND STUDENT
---------------------------------------------------------

INSERT INTO student_course_progress
(
    student_id,
    course_id,
    completion_percentage,
    lectures_completed,
    total_lectures,
    average_score,
    last_accessed_at,
    completed_at
)
SELECT
    s.user_id,
    c.id,
    0,
    0,
    4,
    NULL,
    NULL,
    NULL
FROM (
    SELECT user_id
    FROM students
    ORDER BY user_id
    OFFSET 1
    LIMIT 1
) s
JOIN courses c
    ON c.slug = 'biochemistry';

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
    0,
    0,
    0,
    NULL,
    NULL,
    0,
    NULL
FROM (
    SELECT user_id
    FROM students
    ORDER BY user_id
    OFFSET 1
    LIMIT 1
) s
JOIN topics t
    ON t.topic_name = 'Nucleic Acids';

---------------------------------------------------------
-- NOTIFICATIONS
---------------------------------------------------------

WITH new_notification AS (
    INSERT INTO notifications
    (
        title,
        message,
        target_url,
        notification_type,
        created_by,
        created_at
    )
    VALUES
    (
        'New Demo Course Available',
        'Biochemistry has been added to Semester 2.',
        '/courses/biochemistry',
        'ANNOUNCEMENT',
        (SELECT user_id FROM instructors ORDER BY user_id LIMIT 1),
        CURRENT_TIMESTAMP - INTERVAL '3 days'
    )
    RETURNING id
)
INSERT INTO user_notifications
(
    notification_id,
    user_id,
    notification_status,
    read_at,
    created_at
)
SELECT
    new_notification.id,
    s.user_id,
    'UNREAD',
    NULL,
    CURRENT_TIMESTAMP - INTERVAL '3 days'
FROM new_notification
CROSS JOIN students s;

WITH new_notification AS (
    INSERT INTO notifications
    (
        title,
        message,
        target_url,
        notification_type,
        created_by,
        created_at
    )
    VALUES
    (
        'Revision Reminder',
        'A revision session for Biochemistry is scheduled for tomorrow.',
        '/courses/biochemistry',
        'REMINDER',
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '12 hours'
    )
    RETURNING id
)
INSERT INTO user_notifications
(
    notification_id,
    user_id,
    notification_status,
    read_at,
    created_at
)
SELECT
    new_notification.id,
    s.user_id,
    CASE
        WHEN s.user_id = (SELECT user_id FROM students ORDER BY user_id LIMIT 1)
        THEN 'READ'
        ELSE 'UNREAD'
    END,
    CASE
        WHEN s.user_id = (SELECT user_id FROM students ORDER BY user_id LIMIT 1)
        THEN CURRENT_TIMESTAMP - INTERVAL '11 hours'
        ELSE NULL
    END,
    CURRENT_TIMESTAMP - INTERVAL '12 hours'
FROM new_notification
CROSS JOIN students s;

WITH new_notification AS (
    INSERT INTO notifications
    (
        title,
        message,
        target_url,
        notification_type,
        created_by,
        created_at
    )
    VALUES
    (
        'Welcome to the Demo Area',
        'Explore the extra demo content to test the platform features.',
        '/dashboard',
        'SYSTEM',
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '30 days'
    )
    RETURNING id
)
INSERT INTO user_notifications
(
    notification_id,
    user_id,
    notification_status,
    read_at,
    created_at
)
SELECT
    new_notification.id,
    s.user_id,
    'READ',
    CURRENT_TIMESTAMP - INTERVAL '29 days',
    CURRENT_TIMESTAMP - INTERVAL '30 days'
FROM new_notification
CROSS JOIN (
    SELECT user_id
    FROM students
    ORDER BY user_id
    LIMIT 3
) s;

---------------------------------------------------------
-- AUDIT LOGS
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_name,
    entity_id,
    description,
    ip_address,
    user_agent,
    created_at
)
SELECT
    i.user_id,
    'CREATE',
    'course',
    c.id,
    'Created the Biochemistry course.',
    '192.168.1.10',
    'Chrome on Windows',
    CURRENT_TIMESTAMP - INTERVAL '3 days'
FROM instructors i
JOIN courses c
    ON c.slug = 'biochemistry'
LIMIT 1;

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_name,
    entity_id,
    description,
    ip_address,
    user_agent,
    created_at
)
SELECT
    i.user_id,
    'CREATE',
    'flashcard_deck',
    d.id,
    'Created the Biochemistry Essentials flashcard deck.',
    '192.168.1.10',
    'Chrome on Windows',
    CURRENT_TIMESTAMP - INTERVAL '2 days'
FROM instructors i
JOIN flashcard_decks d
    ON d.title = 'Biochemistry Essentials'
LIMIT 1;

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_name,
    entity_id,
    description,
    ip_address,
    user_agent,
    created_at
)
SELECT
    s.user_id,
    'LOGIN',
    'user',
    s.user_id,
    'Student logged in to the platform.',
    '192.168.1.20',
    'Edge on Windows',
    CURRENT_TIMESTAMP - INTERVAL '1 day'
FROM students s
ORDER BY s.user_id
LIMIT 1;

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_name,
    entity_id,
    description,
    ip_address,
    user_agent,
    created_at
)
SELECT
    i.user_id,
    'UPDATE',
    'question',
    q.id,
    'Updated question wording and explanation.',
    '192.168.1.10',
    'Chrome on Windows',
    CURRENT_TIMESTAMP - INTERVAL '6 hours'
FROM instructors i
JOIN questions q
    ON q.title = 'Necrosis MCQ'
LIMIT 1;

COMMIT;