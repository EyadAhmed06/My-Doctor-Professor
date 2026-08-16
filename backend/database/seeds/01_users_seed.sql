-- =====================================================
-- Medical Learning Platform
-- Users Seed Data
-- =====================================================
--
-- Contains:
-- • System Administrator
-- • Instructors
-- • Students
--
-- =====================================================

BEGIN;

---------------------------------------------------------
-- System Administrator
---------------------------------------------------------

INSERT INTO users
(
    full_name,
    email,
    password_hash,
    phone_number,
    role,
    status,
    email_verified
)
VALUES
(
    'System Administrator',
    'admin@mydoctorprofessor.com',
    '$2b$12$REPLACE_WITH_BCRYPT_HASH',
    '+201000000001',
    'SYSTEM_ADMIN',
    'ACTIVE',
    TRUE
);

INSERT INTO system_admins
(
    user_id,
    employee_number,
    is_super_admin
)
SELECT
    id,
    'EMP-0001',
    TRUE
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
    phone_number,
    gender,
    role,
    status,
    email_verified
)
VALUES
(
    'Dr. Ahmed Hassan',
    'ahmed.hassan@mydoctorprofessor.com',
    '$2b$12$REPLACE_WITH_BCRYPT_HASH',
    '+201000000002',
    'MALE',
    'INSTRUCTOR',
    'ACTIVE',
    TRUE
),
(
    'Dr. Sarah Mohamed',
    'sarah.mohamed@mydoctorprofessor.com',
    '$2b$12$REPLACE_WITH_BCRYPT_HASH',
    '+201000000003',
    'FEMALE',
    'INSTRUCTOR',
    'ACTIVE',
    TRUE
),
(
    'Dr. Omar Ali',
    'omar.ali@mydoctorprofessor.com',
    '$2b$12$REPLACE_WITH_BCRYPT_HASH',
    '+201000000004',
    'MALE',
    'INSTRUCTOR',
    'ACTIVE',
    TRUE
);

INSERT INTO instructors
(
    user_id,
    specialization,
    office_location,
    biography
)
SELECT
    id,
    'General Medicine',
    'Medical Building',
    'Experienced medical instructor.'
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
    phone_number,
    gender,
    role,
    status,
    email_verified
)
VALUES
('Student One','student1@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','+201000000101','MALE','STUDENT','ACTIVE',TRUE),
('Student Two','student2@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','+201000000102','FEMALE','STUDENT','ACTIVE',TRUE),
('Student Three','student3@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','+201000000103','MALE','STUDENT','ACTIVE',TRUE),
('Student Four','student4@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','+201000000104','FEMALE','STUDENT','ACTIVE',TRUE),
('Student Five','student5@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','+201000000105','MALE','STUDENT','ACTIVE',TRUE),
('Student Six','student6@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','+201000000106','FEMALE','STUDENT','ACTIVE',TRUE),
('Student Seven','student7@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','+201000000107','MALE','STUDENT','ACTIVE',TRUE),
('Student Eight','student8@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','+201000000108','FEMALE','STUDENT','ACTIVE',TRUE),
('Student Nine','student9@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','+201000000109','MALE','STUDENT','ACTIVE',TRUE),
('Student Ten','student10@example.com','$2b$12$REPLACE_WITH_BCRYPT_HASH','+201000000110','FEMALE','STUDENT','ACTIVE',TRUE);

INSERT INTO students
(
    user_id,
    student_number,
    current_semester
)
SELECT
    id,
    'STD-' || LPAD(ROW_NUMBER() OVER (ORDER BY full_name)::TEXT,4,'0'),
    1
FROM users
WHERE role = 'STUDENT';

COMMIT;