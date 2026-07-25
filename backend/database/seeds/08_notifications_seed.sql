-- =====================================================
-- Medical Learning Platform
-- Notifications Seed Data
-- =====================================================
--
-- Contains:
-- • Notifications
-- • User Notifications
--
-- =====================================================

BEGIN;

---------------------------------------------------------
-- 1) Welcome notification for all students
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
        'Welcome to My Doctor & Professor!',
        'Welcome to the platform. Start exploring your courses and begin learning.',
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
    CASE
        WHEN s.user_id = (SELECT user_id FROM students LIMIT 1)
        THEN 'READ'
        ELSE 'UNREAD'
    END,
    CASE
        WHEN s.user_id = (SELECT user_id FROM students LIMIT 1)
        THEN CURRENT_TIMESTAMP - INTERVAL '29 days'
        ELSE NULL
    END,
    CURRENT_TIMESTAMP - INTERVAL '30 days'
FROM new_notification
CROSS JOIN students s;

---------------------------------------------------------
-- 2) New course available
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
        'New Course Available',
        'Physiology has been published and is now available.',
        '/courses/physiology',
        'COURSE',
        (SELECT user_id FROM instructors LIMIT 1),
        CURRENT_TIMESTAMP - INTERVAL '20 days'
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
    CURRENT_TIMESTAMP - INTERVAL '19 days',
    CURRENT_TIMESTAMP - INTERVAL '20 days'
FROM new_notification
CROSS JOIN students s;

---------------------------------------------------------
-- 3) New lecture published
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
        'New Lecture Published',
        'Cell Physiology lecture has been published.',
        '/courses/physiology/weeks/2/lectures/cell-physiology',
        'LECTURE',
        (SELECT user_id FROM instructors LIMIT 1),
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

---------------------------------------------------------
-- 4) Flashcards added
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
        'Flashcards Added',
        'New flashcards are available for Homeostasis.',
        '/flashcards/decks/homeostasis-flashcards',
        'FLASHCARD',
        (SELECT user_id FROM instructors LIMIT 1),
        CURRENT_TIMESTAMP - INTERVAL '2 days'
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
    CURRENT_TIMESTAMP - INTERVAL '2 days'
FROM new_notification
CROSS JOIN students s;

---------------------------------------------------------
-- 5) New test available
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
        'New Test Available',
        'Physiology Quiz 1 is now available.',
        '/tests/physiology-quiz-1',
        'TEST',
        (SELECT user_id FROM instructors LIMIT 1),
        CURRENT_TIMESTAMP - INTERVAL '1 day'
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
    CURRENT_TIMESTAMP - INTERVAL '1 day'
FROM new_notification
CROSS JOIN students s;

---------------------------------------------------------
-- 6) Test reminder
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
        'Test Reminder',
        'Physiology Quiz 1 closes in 2 hours.',
        '/tests/physiology-quiz-1',
        'REMINDER',
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '2 hours'
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
    CURRENT_TIMESTAMP - INTERVAL '2 hours'
FROM new_notification
CROSS JOIN students s;

---------------------------------------------------------
-- 7) Test graded (for first student only)
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
        'Test Graded',
        'Your submission for Physiology Quiz 1 has been graded.',
        '/tests/physiology-quiz-1/results',
        'GRADE',
        (SELECT user_id FROM instructors LIMIT 1),
        CURRENT_TIMESTAMP - INTERVAL '90 minutes'
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
    CURRENT_TIMESTAMP - INTERVAL '80 minutes',
    CURRENT_TIMESTAMP - INTERVAL '90 minutes'
FROM new_notification
CROSS JOIN (
    SELECT user_id
    FROM students
    LIMIT 1
) s;

---------------------------------------------------------
-- 8) Course announcement
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
        'Course Announcement',
        'Dr. Ahmed uploaded additional study material for Week 2.',
        '/courses/physiology/weeks/2',
        'ANNOUNCEMENT',
        (SELECT user_id FROM instructors LIMIT 1),
        CURRENT_TIMESTAMP - INTERVAL '8 hours'
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
    CURRENT_TIMESTAMP - INTERVAL '8 hours'
FROM new_notification
CROSS JOIN students s;

---------------------------------------------------------
-- 9) Achievement unlocked (first student only)
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
        'Achievement Unlocked',
        'Congratulations! You completed your first course.',
        '/dashboard/achievements',
        'ACHIEVEMENT',
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '30 minutes'
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
    CURRENT_TIMESTAMP - INTERVAL '25 minutes',
    CURRENT_TIMESTAMP - INTERVAL '30 minutes'
FROM new_notification
CROSS JOIN (
    SELECT user_id
    FROM students
    LIMIT 1
) s;

COMMIT;