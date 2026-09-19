-- =====================================================
-- Medical Learning Platform
-- Notifications Seed Data
-- =====================================================
--
-- Contains:
-- • System Notifications
-- • Course Notifications
-- • Lecture Notifications
-- • Flashcard Notifications
-- • Test Notifications
-- • Reminder Notifications
-- • Grade Notifications
-- • Announcement Notifications
-- • Achievement Notifications
-- • User Notifications
--
-- =====================================================

BEGIN;

---------------------------------------------------------
-- Notifications
---------------------------------------------------------

INSERT INTO notifications
(
    title,
    message,
    target_url,
    notification_type,
    created_by
)

---------------------------------------------------------
-- System Notification
---------------------------------------------------------
SELECT
    'Welcome to My Doctor Professor!',
    'Welcome to the platform. Start exploring your courses.',
    '/dashboard',
    'SYSTEM'::notification_type,
    id
FROM users
WHERE role = 'SYSTEM_ADMIN'
LIMIT 1;

---------------------------------------------------------
-- Course Notification
---------------------------------------------------------

INSERT INTO notifications
(
    title,
    message,
    target_url,
    notification_type,
    created_by
)
SELECT
    'New Course Available',
    'A new course has been published.',
    '/courses',
    'COURSE'::notification_type,
    user_id
FROM instructors
LIMIT 1;

---------------------------------------------------------
-- Lecture Notification
---------------------------------------------------------

INSERT INTO notifications
(
    title,
    message,
    target_url,
    notification_type,
    created_by
)
SELECT
    'New Lecture Published',
    'Lecture 2 is now available.',
    '/lectures',
    'LECTURE'::notification_type,
    user_id
FROM instructors
LIMIT 1;

---------------------------------------------------------
-- Flashcard Notification
---------------------------------------------------------

INSERT INTO notifications
(
    title,
    message,
    target_url,
    notification_type,
    created_by
)
SELECT
    'Flashcards Ready',
    'Your flashcard deck is now available.',
    '/flashcards',
    'FLASHCARD'::notification_type,
    user_id
FROM instructors
LIMIT 1;

---------------------------------------------------------
-- Test Notification
---------------------------------------------------------

INSERT INTO notifications
(
    title,
    message,
    target_url,
    notification_type,
    created_by
)
SELECT
    'New Quiz Available',
    'A new quiz has been published.',
    '/tests',
    'TEST'::notification_type,
    user_id
FROM instructors
LIMIT 1;

---------------------------------------------------------
-- Reminder Notification
---------------------------------------------------------

INSERT INTO notifications
(
    title,
    message,
    target_url,
    notification_type,
    created_by
)
SELECT
    'Study Reminder',
    'Remember to complete today''s study session.',
    '/dashboard',
    'REMINDER'::notification_type,
    user_id
FROM instructors
LIMIT 1;

---------------------------------------------------------
-- Grade Notification
---------------------------------------------------------

INSERT INTO notifications
(
    title,
    message,
    target_url,
    notification_type,
    created_by
)
SELECT
    'Quiz Graded',
    'Your quiz has been graded successfully.',
    '/grades',
    'GRADE'::notification_type,
    user_id
FROM instructors
LIMIT 1;

---------------------------------------------------------
-- Announcement Notification
---------------------------------------------------------

INSERT INTO notifications
(
    title,
    message,
    target_url,
    notification_type,
    created_by
)
SELECT
    'Platform Announcement',
    'Scheduled maintenance this weekend.',
    '/announcements',
    'ANNOUNCEMENT'::notification_type,
    id
FROM users
WHERE role = 'SYSTEM_ADMIN'
LIMIT 1;

---------------------------------------------------------
-- Achievement Notification
---------------------------------------------------------

INSERT INTO notifications
(
    title,
    message,
    target_url,
    notification_type,
    created_by
)
SELECT
    'Achievement Unlocked',
    'Congratulations! You completed your first course.',
    '/achievements',
    'ACHIEVEMENT'::notification_type,
    user_id
FROM instructors
LIMIT 1;

---------------------------------------------------------
-- Assign Notifications to Students
---------------------------------------------------------

INSERT INTO user_notifications
(
    notification_id,
    user_id,
    notification_status,
    read_at
)
SELECT
    n.id,
    s.user_id,
    CASE
        WHEN ROW_NUMBER() OVER (ORDER BY n.created_at) % 2 = 0
            THEN 'READ'::notification_status
        ELSE 'UNREAD'::notification_status
    END,
    CASE
        WHEN ROW_NUMBER() OVER (ORDER BY n.created_at) % 2 = 0
            THEN CURRENT_TIMESTAMP
        ELSE NULL
    END
FROM notifications n
CROSS JOIN students s;

COMMIT;