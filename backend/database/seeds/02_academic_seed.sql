-- =====================================================
-- Medical Learning Platform
-- Academic Structure Seed Data
-- =====================================================
--
-- Contains:
-- • Semesters
-- • Courses
-- • Weeks
-- • Lectures
-- • Topics
-- • Resources
--
-- =====================================================

BEGIN;

---------------------------------------------------------
-- SEMESTERS
---------------------------------------------------------

INSERT INTO semesters
(
    semester_number,
    title,
    description
)
VALUES

(1, 'Semester 1', 'First Academic Semester'),
(2, 'Semester 2', 'Second Academic Semester'),
(3, 'Semester 3', 'Third Academic Semester'),
(4, 'Semester 4', 'Fourth Academic Semester'),
(5, 'Semester 5', 'Fifth Academic Semester');

---------------------------------------------------------
-- COURSES
---------------------------------------------------------

INSERT INTO courses
(
    semester_id,
    course_code,
    course_name,
    slug,
    description,
    credit_hours,
    is_active
)
SELECT
    id,
    'MED101',
    'Physiology',
    'physiology',
    'Introduction to Human Physiology',
    4,
    TRUE
FROM semesters
WHERE semester_number = 1;

INSERT INTO courses
(
    semester_id,
    course_code,
    course_name,
    slug,
    description,
    credit_hours,
    is_active
)
SELECT
    id,
    'MED102',
    'Anatomy',
    'anatomy',
    'Introduction to Human Anatomy',
    4,
    TRUE
FROM semesters
WHERE semester_number = 1;

INSERT INTO courses
(
    semester_id,
    course_code,
    course_name,
    slug,
    description,
    credit_hours,
    is_active
)
SELECT
    id,
    'MED103',
    'Histology',
    'histology',
    'Introduction to Histology',
    3,
    TRUE
FROM semesters
WHERE semester_number = 1;

---------------------------------------------------------
-- WEEKS
---------------------------------------------------------

INSERT INTO weeks
(
    course_id,
    week_number,
    title,
    description
)
SELECT
    id,
    1,
    'Week 1',
    'Introduction'
FROM courses
WHERE slug = 'physiology';

INSERT INTO weeks
(
    course_id,
    week_number,
    title,
    description
)
SELECT
    id,
    2,
    'Week 2',
    'Cell Physiology'
FROM courses
WHERE slug = 'physiology';

INSERT INTO weeks
(
    course_id,
    week_number,
    title,
    description
)
SELECT
    id,
    1,
    'Week 1',
    'Introduction'
FROM courses
WHERE slug = 'anatomy';

---------------------------------------------------------
-- LECTURES
---------------------------------------------------------

INSERT INTO lectures
(
    week_id,
    lecture_number,
    title,
    description,
    estimated_duration_minutes
)
SELECT
    id,
    1,
    'Introduction to Physiology',
    'Overview of physiology',
    90
FROM weeks
WHERE title = 'Week 1'
AND course_id = (
    SELECT id
    FROM courses
    WHERE slug = 'physiology'
);

INSERT INTO lectures
(
    week_id,
    lecture_number,
    title,
    description,
    estimated_duration_minutes
)
SELECT
    id,
    1,
    'Cell Physiology',
    'Structure and function of cells',
    120
FROM weeks
WHERE title = 'Week 2'
AND course_id = (
    SELECT id
    FROM courses
    WHERE slug = 'physiology'
);

---------------------------------------------------------
-- TOPICS
---------------------------------------------------------

INSERT INTO topics
(
    lecture_id,
    topic_name,
    display_order
)
SELECT
    id,
    'Homeostasis',
    1
FROM lectures
WHERE title = 'Introduction to Physiology';

INSERT INTO topics
(
    lecture_id,
    topic_name,
    display_order
)
SELECT
    id,
    'Feedback Mechanisms',
    2
FROM lectures
WHERE title = 'Introduction to Physiology';

INSERT INTO topics
(
    lecture_id,
    topic_name,
    display_order
)
SELECT
    id,
    'Cell Membrane',
    1
FROM lectures
WHERE title = 'Cell Physiology';

INSERT INTO topics
(
    lecture_id,
    topic_name,
    display_order
)
SELECT
    id,
    'Membrane Transport',
    2
FROM lectures
WHERE title = 'Cell Physiology';

---------------------------------------------------------
-- RESOURCES
---------------------------------------------------------

INSERT INTO resources
(
    lecture_id,
    title,
    description,
    resource_type,
    resource_url,
    display_order
)
SELECT
    id,
    'Lecture Slides',
    'Introduction to Physiology Slides',
    'PDF',
    'https://example.com/physiology/week1/slides.pdf',
    1
FROM lectures
WHERE title = 'Introduction to Physiology';

INSERT INTO resources
(
    lecture_id,
    title,
    description,
    resource_type,
    resource_url,
    display_order
)
SELECT
    id,
    'Lecture Recording',
    'Recorded lecture',
    'VIDEO',
    'https://example.com/physiology/week1/video',
    2
FROM lectures
WHERE title = 'Introduction to Physiology';

INSERT INTO resources
(
    lecture_id,
    title,
    description,
    resource_type,
    resource_url,
    display_order
)
SELECT
    id,
    'Lecture Notes',
    'Cell Physiology Notes',
    'DOCUMENT',
    'https://example.com/physiology/week2/notes.pdf',
    1
FROM lectures
WHERE title = 'Cell Physiology';

COMMIT;