-- =====================================================
-- Medical Learning Platform
-- PostgreSQL ENUM Definitions
-- =====================================================
-- Description:
-- Defines all ENUM types used throughout the database.
-- Execute this file after 00_extensions.sql.
-- =====================================================

-- =====================================================
-- User Module
-- =====================================================

CREATE TYPE role AS ENUM (
    'STUDENT',
    'INSTRUCTOR',
    'SYSTEM_ADMIN'
);

CREATE TYPE user_status AS ENUM (
    'ACTIVE',
    'PENDING_VERIFICATION',
    'SUSPENDED',
    'DEACTIVATED'
);

CREATE TYPE gender AS ENUM (
    'MALE',
    'FEMALE'
);

-- =====================================================
-- Academic Module
-- =====================================================

CREATE TYPE resource_type AS ENUM (
    'PDF',
    'VIDEO',
    'IMAGE',
    'LINK'
);

CREATE TYPE upload_status AS ENUM (
    'UPLOADED',
    'PROCESSING',
    'COMPLETED',
    'FAILED'
);

-- =====================================================
-- Question Bank Module
-- =====================================================

CREATE TYPE question_type AS ENUM (
    'MCQ',
    'ESSAY'
);

CREATE TYPE question_difficulty AS ENUM (
    'EASY',
    'MEDIUM',
    'HARD'
);

-- =====================================================
-- Assessment Module
-- =====================================================

CREATE TYPE test_mode AS ENUM (
    'TIMED',
    'TUTOR'
);

CREATE TYPE test_type AS ENUM (
    'LECTURE',
    'WEEK',
    'COURSE',
    'CUSTOM',
    'QUESTION_BANK'
);

CREATE TYPE test_attempt_status AS ENUM (
    'NOT_STARTED',
    'IN_PROGRESS',
    'SUBMITTED',
    'EXPIRED'
);

-- =====================================================
-- Notification Module
-- =====================================================

CREATE TYPE notification_type AS ENUM (
    'SYSTEM',
    'COURSE',
    'LECTURE',
    'FLASHCARD',
    'TEST',
    'REMINDER',
    'GRADE',
    'ANNOUNCEMENT',
    'ACHIEVEMENT'
);

CREATE TYPE notification_status AS ENUM (
    'UNREAD',
    'READ'
);

-- =====================================================
-- Audit Module
-- =====================================================

CREATE TYPE audit_action AS ENUM (

    -- Authentication
    'LOGIN',
    'LOGOUT',
    'PASSWORD_RESET_REQUEST',
    'PASSWORD_CHANGED',

    -- General CRUD
    'CREATE',
    'UPDATE',
    'DELETE',

    -- User Profile
    'UPDATE_PROFILE',

    -- Tests
    'START_TEST',
    'SUBMIT_TEST',
    'AUTO_SUBMIT_TEST',

    -- Questions
    'BOOKMARK_QUESTION',
    'REMOVE_BOOKMARK',

    -- Flashcards
    'REVIEW_FLASHCARDS',

    -- Reports & Analytics
    'VIEW_REPORTS',
    'EXPORT_DATA'

);