-- =====================================================
-- Medical Learning Platform
-- Audit & Activity Logs Seed Data
-- =====================================================
--
-- Contains:
-- • Audit Logs
-- • User Activity Logs
--
-- =====================================================

BEGIN;

---------------------------------------------------------
-- INSTRUCTOR ACTIVITIES
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_type,
    entity_id,
    description,
    ip_address,
    user_agent,
    created_at
)

SELECT

    i.user_id,

    'CREATE',

    'QUESTION',

    q.id,

    'Created a new question in the question bank.',

    '192.168.1.10',

    'Chrome 138 - Windows',

    CURRENT_TIMESTAMP - INTERVAL '15 days'

FROM instructors i
JOIN questions q
ON q.title = 'Homeostasis MCQ'
LIMIT 1;

---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_type,
    entity_id,
    description,
    ip_address,
    user_agent,
    created_at
)

SELECT

    i.user_id,

    'CREATE',

    'FLASHCARD_DECK',

    d.id,

    'Created Homeostasis Flashcards.',

    '192.168.1.10',

    'Chrome 138 - Windows',

    CURRENT_TIMESTAMP - INTERVAL '10 days'

FROM instructors i
JOIN flashcard_decks d
ON d.title='Homeostasis Flashcards'
LIMIT 1;

---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_type,
    entity_id,
    description,
    ip_address,
    user_agent,
    created_at
)

SELECT

    i.user_id,

    'CREATE',

    'TEST',

    t.id,

    'Published Physiology Quiz 1.',

    '192.168.1.10',

    'Chrome 138 - Windows',

    CURRENT_TIMESTAMP - INTERVAL '7 days'

FROM instructors i
JOIN tests t
ON t.title='Physiology Quiz 1'
LIMIT 1;

---------------------------------------------------------
-- STUDENT ACTIVITIES
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_type,
    entity_id,
    description,
    ip_address,
    user_agent,
    created_at
)

SELECT

    s.user_id,

    'LOGIN',

    'USER',

    s.user_id,

    'Student logged in.',

    '192.168.1.20',

    'Edge - Windows',

    CURRENT_TIMESTAMP - INTERVAL '2 days'

FROM students s
LIMIT 1;

---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_type,
    entity_id,
    description,
    ip_address,
    user_agent,
    created_at
)

SELECT

    s.user_id,

    'START_TEST',

    'TEST',

    t.id,

    'Started Physiology Quiz 1.',

    '192.168.1.20',

    'Edge - Windows',

    CURRENT_TIMESTAMP - INTERVAL '90 minutes'

FROM students s
JOIN tests t
ON t.title='Physiology Quiz 1'
LIMIT 1;

---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_type,
    entity_id,
    description,
    ip_address,
    user_agent,
    created_at
)

SELECT

    s.user_id,

    'SUBMIT_TEST',

    'TEST',

    t.id,

    'Submitted Physiology Quiz 1.',

    '192.168.1.20',

    'Edge - Windows',

    CURRENT_TIMESTAMP - INTERVAL '60 minutes'

FROM students s
JOIN tests t
ON t.title='Physiology Quiz 1'
LIMIT 1;

---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_type,
    entity_id,
    description,
    ip_address,
    user_agent,
    created_at
)

SELECT

    s.user_id,

    'REVIEW_FLASHCARDS',

    'FLASHCARD_DECK',

    d.id,

    'Reviewed Homeostasis Flashcards.',

    '192.168.1.20',

    'Edge - Windows',

    CURRENT_TIMESTAMP - INTERVAL '30 minutes'

FROM students s
JOIN flashcard_decks d
ON d.title='Homeostasis Flashcards'
LIMIT 1;

---------------------------------------------------------
-- ADMIN ACTIVITIES
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_type,
    entity_id,
    description,
    ip_address,
    user_agent,
    created_at
)

SELECT

    a.user_id,

    'VIEW_REPORTS',

    'SYSTEM',

    NULL,

    'Viewed platform analytics dashboard.',

    '192.168.1.5',

    'Firefox - Linux',

    CURRENT_TIMESTAMP - INTERVAL '1 day'

FROM admins a
LIMIT 1;

---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_type,
    entity_id,
    description,
    ip_address,
    user_agent,
    created_at
)

SELECT

    a.user_id,

    'EXPORT_DATA',

    'SYSTEM',

    NULL,

    'Exported student performance report.',

    '192.168.1.5',

    'Firefox - Linux',

    CURRENT_TIMESTAMP - INTERVAL '3 hours'

FROM admins a
LIMIT 1;

COMMIT;

---------------------------------------------------------
-- PASSWORD RESET REQUEST
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_type,
    entity_id,
    description,
    ip_address,
    user_agent,
    created_at
)

SELECT

    s.user_id,

    'PASSWORD_RESET_REQUEST',

    'USER',

    s.user_id,

    'Requested a password reset.',

    '192.168.1.20',

    'Edge - Windows',

    CURRENT_TIMESTAMP - INTERVAL '5 days'

FROM students s
LIMIT 1;

---------------------------------------------------------
-- PASSWORD CHANGED
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_type,
    entity_id,
    description,
    ip_address,
    user_agent,
    created_at
)

SELECT

    s.user_id,

    'PASSWORD_CHANGED',

    'USER',

    s.user_id,

    'Successfully changed account password.',

    '192.168.1.20',

    'Edge - Windows',

    CURRENT_TIMESTAMP - INTERVAL '5 days' + INTERVAL '10 minutes'

FROM students s
LIMIT 1;

---------------------------------------------------------
-- PROFILE UPDATED
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_type,
    entity_id,
    description,
    ip_address,
    user_agent,
    created_at
)

SELECT

    s.user_id,

    'UPDATE_PROFILE',

    'USER',

    s.user_id,

    'Updated profile information.',

    '192.168.1.20',

    'Edge - Windows',

    CURRENT_TIMESTAMP - INTERVAL '2 days'

FROM students s
LIMIT 1;

---------------------------------------------------------
-- QUESTION BOOKMARKED
---------------------------------------------------------

INSERT INTO audit_logs
(
    user_id,
    action,
    entity_type,
    entity_id,
    description,
    ip_address,
    user_agent,
    created_at
)

SELECT

    s.user_id,

    'BOOKMARK_QUESTION',

    'QUESTION',

    q.id,

    'Bookmarked a question for later review.',

    '192.168.1.20',

    'Edge - Windows',

    CURRENT_TIMESTAMP - INTERVAL '45 minutes'

FROM students s
JOIN questions q
ON q.title = 'Homeostasis MCQ'
LIMIT 1;

