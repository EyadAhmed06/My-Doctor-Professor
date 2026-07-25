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

-- =====================================================
-- Semesters
-- =====================================================

INSERT INTO semesters
(
    semester_number,
    title,
    description
)
VALUES
(
    1,
    'Semester 1',
    'Foundation medical sciences.'
),
(
    2,
    'Semester 2',
    'Pre-clinical medical sciences.'
);

-- =====================================================
-- Courses
-- =====================================================

INSERT INTO courses
(
    semester_id,
    course_code,
    course_name,
    slug,
    description,
    credit_hours,
    display_order
)
SELECT
    s.id,
    c.course_code,
    c.course_name,
    c.slug,
    c.description,
    c.credit_hours,
    c.display_order
FROM semesters s
JOIN
(
    VALUES
    (
        1,
        'ANAT101',
        'Human Anatomy',
        'human-anatomy',
        'Introduction to Human Anatomy.',
        5,
        1
    ),
    (
        1,
        'PHYS101',
        'Human Physiology',
        'human-physiology',
        'Introduction to Human Physiology.',
        5,
        2
    ),
    (
        2,
        'PATH201',
        'General Pathology',
        'general-pathology',
        'Introduction to General Pathology.',
        4,
        1
    ),
    (
        2,
        'PHAR201',
        'Pharmacology',
        'pharmacology',
        'Introduction to Pharmacology.',
        4,
        2
    )
) AS c
(
    semester_number,
    course_code,
    course_name,
    slug,
    description,
    credit_hours,
    display_order
)
ON s.semester_number = c.semester_number;

-- =====================================================
-- Weeks
-- =====================================================

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
    w.week_number,
    w.title,
    w.description,
    w.display_order
FROM courses c
CROSS JOIN
(
    VALUES
    (
        1,
        'Week 1',
        'Introduction',
        1
    ),
    (
        2,
        'Week 2',
        'Core Concepts',
        2
    )
) AS w
(
    week_number,
    title,
    description,
    display_order
);

-- =====================================================
-- Lectures
-- =====================================================

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
    l.lecture_number,
    l.title,
    l.description,
    l.estimated_duration_minutes,
    TRUE,
    l.display_order
FROM weeks w
CROSS JOIN
(
    VALUES
    (
        1,
        'Lecture 1',
        'Introduction',
        90,
        1
    ),
    (
        2,
        'Lecture 2',
        'Detailed Concepts',
        120,
        2
    )
) AS l
(
    lecture_number,
    title,
    description,
    estimated_duration_minutes,
    display_order
);

-- =====================================================
-- Topics
-- =====================================================

INSERT INTO topics
(
    lecture_id,
    topic_name,
    description,
    display_order
)
SELECT
    l.id,
    t.topic_name,
    t.description,
    t.display_order
FROM lectures l
CROSS JOIN
(
    VALUES
    (
        'Overview',
        'General overview of the lecture.',
        1
    ),
    (
        'Key Concepts',
        'Main concepts discussed.',
        2
    ),
    (
        'Clinical Applications',
        'Clinical relevance.',
        3
    )
) AS t
(
    topic_name,
    description,
    display_order
);

-- =====================================================
-- Resources
-- =====================================================

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
    r.resource_name,
    r.resource_type::resource_type,
    'UPLOADED'::upload_status,
    r.file_url,
    r.file_size,
    r.description
FROM lectures l
CROSS JOIN
(
    VALUES
    (
        'Lecture Slides',
        'PDF',
        'https://example.com/resources/slides.pdf',
        2500000,
        'Lecture presentation slides.'
    ),
    (
        'Lecture Recording',
        'VIDEO',
        'https://example.com/resources/video.mp4',
        150000000,
        'Recorded lecture.'
    )
) AS r
(
    resource_name,
    resource_type,
    file_url,
    file_size,
    description
);

COMMIT;