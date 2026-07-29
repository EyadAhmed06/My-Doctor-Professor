-- =====================================================
-- Medical Learning Platform
-- User Module
-- =====================================================
-- Description:
-- Defines the user hierarchy.
-- Execute after:
-- 00_extensions.sql
-- 01_enums.sql
-- =====================================================

-- =====================================================
-- Users
-- =====================================================

CREATE TABLE users (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    full_name VARCHAR(150) NOT NULL,

    email CITEXT NOT NULL UNIQUE,

    password_hash TEXT NOT NULL,

    phone_number VARCHAR(20) NOT NULL UNIQUE,

    date_of_birth DATE,

    gender gender,

    role role NOT NULL,

    status user_status NOT NULL DEFAULT 'PENDING_VERIFICATION',

    profile_picture_url TEXT,

    email_verified BOOLEAN NOT NULL DEFAULT FALSE,

    failed_login_attempts INTEGER NOT NULL DEFAULT 0,

    locked_until TIMESTAMP,

    last_login_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_failed_login_attempts
        CHECK (failed_login_attempts >= 0),

    CONSTRAINT chk_email_format
        CHECK (
            email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
        ),

    CONSTRAINT chk_phone_number
        CHECK (
            phone_number ~ '^\+?[0-9]{10,15}$'
        )

);

CREATE TABLE students (

    user_id UUID PRIMARY KEY,

    student_number VARCHAR(30) NOT NULL UNIQUE,

    current_semester INTEGER NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_current_semester
        CHECK (current_semester >= 1)

);

CREATE TABLE instructors (

    user_id UUID PRIMARY KEY,

    specialization VARCHAR(150),

    office_location VARCHAR(100),

    biography TEXT,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE

);

CREATE TABLE instructor_availability (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    instructor_id UUID NOT NULL,

    day_of_week SMALLINT NOT NULL,

    start_time TIME NOT NULL,

    end_time TIME NOT NULL,

    FOREIGN KEY (instructor_id)
        REFERENCES instructors(user_id)
        ON DELETE CASCADE,

    CONSTRAINT chk_day_of_week
        CHECK (day_of_week BETWEEN 1 AND 7),

    CONSTRAINT chk_time_range
        CHECK (start_time < end_time)

);

CREATE TABLE system_admins (

    user_id UUID PRIMARY KEY,

    employee_number VARCHAR(30) UNIQUE,

    is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE

);

CREATE TABLE auth_sessions (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL,

    refresh_token_hash TEXT NOT NULL,

    expires_at TIMESTAMP NOT NULL,

    revoked_at TIMESTAMP,

    last_used_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE

);

CREATE TABLE account_action_tokens (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    purpose VARCHAR(30) NOT NULL,
    token_digest CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

    CONSTRAINT chk_account_action_token_purpose
        CHECK (purpose IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET'))
);

CREATE INDEX idx_account_action_tokens_user_purpose
ON account_action_tokens(user_id, purpose);

CREATE INDEX idx_account_action_tokens_expiry
ON account_action_tokens(expires_at);

CREATE INDEX idx_auth_sessions_user
ON auth_sessions(user_id);

CREATE INDEX idx_auth_sessions_expiry
ON auth_sessions(expires_at);

CREATE INDEX idx_users_role
ON users(role);

CREATE INDEX idx_users_status
ON users(status);

CREATE INDEX idx_students_semester
ON students(current_semester);

CREATE INDEX idx_instructors_specialization
ON instructors(specialization);

CREATE INDEX idx_instructor_availability
ON instructor_availability(instructor_id);