-- =====================================================
-- Medical Learning Platform
-- Student Progress Seed Data
-- =====================================================
--
-- Contains:
-- • Course Progress
-- • Lecture Progress
-- • Topic Progress
--
-- =====================================================

BEGIN;

---------------------------------------------------------
-- COURSE PROGRESS
---------------------------------------------------------

INSERT INTO student_course_progress
(
    student_id,
    course_id,
    completion_percentage,
    status,
    started_at,
    completed_at,
    last_accessed_at
)

SELECT

    s.user_id,

    c.id,

    65,

    'IN_PROGRESS',

    CURRENT_TIMESTAMP - INTERVAL '20 days',

    NULL,

    CURRENT_TIMESTAMP - INTERVAL '1 day'

FROM

(
    SELECT user_id
    FROM students
    LIMIT 1
) s

JOIN courses c
ON c.slug='physiology';

---------------------------------------------------------

INSERT INTO student_course_progress
(
    student_id,
    course_id,
    completion_percentage,
    status,
    started_at,
    completed_at,
    last_accessed_at
)

SELECT

    s.user_id,

    c.id,

    100,

    'COMPLETED',

    CURRENT_TIMESTAMP - INTERVAL '60 days',

    CURRENT_TIMESTAMP - INTERVAL '10 days',

    CURRENT_TIMESTAMP - INTERVAL '10 days'

FROM

(
    SELECT user_id
    FROM students
    LIMIT 1
) s

JOIN courses c
ON c.slug='anatomy';

---------------------------------------------------------
-- LECTURE PROGRESS
---------------------------------------------------------

INSERT INTO student_lecture_progress
(
    student_id,
    lecture_id,
    completion_percentage,
    status,
    started_at,
    completed_at,
    last_accessed_at
)

SELECT

    s.user_id,

    l.id,

    100,

    'COMPLETED',

    CURRENT_TIMESTAMP - INTERVAL '18 days',

    CURRENT_TIMESTAMP - INTERVAL '17 days',

    CURRENT_TIMESTAMP - INTERVAL '17 days'

FROM

(
    SELECT user_id
    FROM students
    LIMIT 1
) s

JOIN lectures l
ON l.title='Introduction to Physiology';

---------------------------------------------------------

INSERT INTO student_lecture_progress
(
    student_id,
    lecture_id,
    completion_percentage,
    status,
    started_at,
    completed_at,
    last_accessed_at
)

SELECT

    s.user_id,

    l.id,

    40,

    'IN_PROGRESS',

    CURRENT_TIMESTAMP - INTERVAL '2 days',

    NULL,

    CURRENT_TIMESTAMP - INTERVAL '4 hours'

FROM

(
    SELECT user_id
    FROM students
    LIMIT 1
) s

JOIN lectures l
ON l.title='Cell Physiology';

---------------------------------------------------------
-- TOPIC PROGRESS
---------------------------------------------------------

INSERT INTO student_topic_progress
(
    student_id,
    topic_id,
    completion_percentage,
    status,
    started_at,
    completed_at,
    last_accessed_at
)

SELECT

    s.user_id,

    t.id,

    100,

    'COMPLETED',

    CURRENT_TIMESTAMP - INTERVAL '18 days',

    CURRENT_TIMESTAMP - INTERVAL '17 days',

    CURRENT_TIMESTAMP - INTERVAL '17 days'

FROM

(
    SELECT user_id
    FROM students
    LIMIT 1
) s

JOIN topics t
ON t.topic_name='Homeostasis';

---------------------------------------------------------

INSERT INTO student_topic_progress
(
    student_id,
    topic_id,
    completion_percentage,
    status,
    started_at,
    completed_at,
    last_accessed_at
)

SELECT

    s.user_id,

    t.id,

    80,

    'IN_PROGRESS',

    CURRENT_TIMESTAMP - INTERVAL '2 days',

    NULL,

    CURRENT_TIMESTAMP - INTERVAL '4 hours'

FROM

(
    SELECT user_id
    FROM students
    LIMIT 1
) s

JOIN topics t
ON t.topic_name='Feedback Mechanisms';

---------------------------------------------------------

INSERT INTO student_topic_progress
(
    student_id,
    topic_id,
    completion_percentage,
    status,
    started_at,
    completed_at,
    last_accessed_at
)

SELECT

    s.user_id,

    t.id,

    20,

    'IN_PROGRESS',

    CURRENT_TIMESTAMP - INTERVAL '1 day',

    NULL,

    CURRENT_TIMESTAMP - INTERVAL '30 minutes'

FROM

(
    SELECT user_id
    FROM students
    LIMIT 1
) s

JOIN topics t
ON t.topic_name='Membrane Transport';

COMMIT;

---------------------------------------------------------
-- COURSE PROGRESS (NOT STARTED)
---------------------------------------------------------

INSERT INTO student_course_progress
(
    student_id,
    course_id,
    completion_percentage,
    status,
    started_at,
    completed_at,
    last_accessed_at
)

SELECT

    s.user_id,

    c.id,

    0,

    'NOT_STARTED',

    NULL,

    NULL,

    NULL

FROM
(
    SELECT user_id
    FROM students
    OFFSET 1
    LIMIT 1
) s

JOIN courses c
ON c.slug = 'physiology';

INSERT INTO student_course_progress
(
    student_id,
    course_id,
    completion_percentage,
    status,
    started_at,
    completed_at,
    last_accessed_at
)

SELECT

    s.user_id,

    c.id,

    0,

    'NOT_STARTED',

    NULL,

    NULL,

    NULL

FROM
(
    SELECT user_id
    FROM students
    OFFSET 1
    LIMIT 1
) s

JOIN courses c
ON c.slug = 'anatomy';

---------------------------------------------------------
-- LECTURE PROGRESS (NOT STARTED)
---------------------------------------------------------

INSERT INTO student_lecture_progress
(
    student_id,
    lecture_id,
    completion_percentage,
    status,
    started_at,
    completed_at,
    last_accessed_at
)

SELECT

    s.user_id,

    l.id,

    0,

    'NOT_STARTED',

    NULL,

    NULL,

    NULL

FROM
(
    SELECT user_id
    FROM students
    OFFSET 1
    LIMIT 1
) s

JOIN lectures l
ON l.title = 'Introduction to Physiology';

---------------------------------------------------------
-- TOPIC PROGRESS (NOT STARTED)
---------------------------------------------------------

INSERT INTO student_topic_progress
(
    student_id,
    topic_id,
    completion_percentage,
    status,
    started_at,
    completed_at,
    last_accessed_at
)

SELECT

    s.user_id,

    t.id,

    0,

    'NOT_STARTED',

    NULL,

    NULL,

    NULL

FROM
(
    SELECT user_id
    FROM students
    OFFSET 1
    LIMIT 1
) 

JOIN topics t
ON t.topic_name = 'Homeostasis';

