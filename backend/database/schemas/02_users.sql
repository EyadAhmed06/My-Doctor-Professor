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