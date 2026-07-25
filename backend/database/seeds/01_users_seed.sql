-- =====================================================
-- Medical Learning Platform
-- Users Seed Data
-- =====================================================
--
-- Contains:
-- • Administrators
-- • Instructors
-- • Students
--
-- =====================================================

BEGIN;

---------------------------------------------------------
-- Administrator
---------------------------------------------------------

INSERT INTO users
(
    full_name,
    email,
    password_hash,
    role,
    account_status,
    is_email_verified
)
VALUES
(
    'System Administrator',
    'admin@mydoctorprofessor.com',
    '$2b$12$REPLACE_WITH_BCRYPT_HASH',
    'ADMIN',
    'ACTIVE',
    TRUE
);

INSERT INTO administrators (user_id)
SELECT id
FROM users
WHERE email = 'admin@mydoctorprofessor.com';


---------------------------------------------------------
-- Instructors
---------------------------------------------------------

INSERT INTO users
(
    full_name,
    email,
    password_hash,
    role,
    account_status,
    is_email_verified
)
VALUES

(
    'Dr. Ahmed Hassan',
    'ahmed.hassan@mydoctorprofessor.com',
    '$2b$12$REPLACE_WITH_BCRYPT_HASH',
    'INSTRUCTOR',
    'ACTIVE',
    TRUE
),

(
    'Dr. Sarah Mohamed',
    'sarah.mohamed@mydoctorprofessor.com',
    '$2b$12$REPLACE_WITH_BCRYPT_HASH',
    'INSTRUCTOR',
    'ACTIVE',
    TRUE
),

(
    'Dr. Omar Ali',
    'omar.ali@mydoctorprofessor.com',
    '$2b$12$REPLACE_WITH_BCRYPT_HASH',
    'INSTRUCTOR',
    'ACTIVE',
    TRUE
);

INSERT INTO instructors (user_id)
SELECT id
FROM users
WHERE role = 'INSTRUCTOR';


---------------------------------------------------------
-- Students
---------------------------------------------------------

INSERT INTO users
(
    full_name,
    email,
    password_hash,
    role,
    account_status,
    is_email_verified
)
VALUES

('Student One','student1@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','STUDENT','ACTIVE',TRUE),
('Student Two','student2@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','STUDENT','ACTIVE',TRUE),
('Student Three','student3@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','STUDENT','ACTIVE',TRUE),
('Student Four','student4@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','STUDENT','ACTIVE',TRUE),
('Student Five','student5@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','STUDENT','ACTIVE',TRUE),
('Student Six','student6@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','STUDENT','ACTIVE',TRUE),
('Student Seven','student7@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','STUDENT','ACTIVE',TRUE),
('Student Eight','student8@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','STUDENT','ACTIVE',TRUE),
('Student Nine','student9@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','STUDENT','ACTIVE',TRUE),
('Student Ten','student10@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','STUDENT','ACTIVE',TRUE);

INSERT INTO students (user_id)
SELECT id
FROM users
WHERE role = 'STUDENT';

COMMIT;