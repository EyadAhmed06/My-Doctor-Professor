-- =====================================================
-- Medical Learning Platform
-- PostgreSQL Extensions
-- =====================================================
-- Description:
-- Enables all PostgreSQL extensions required by the project.
-- Execute this file before any other schema files.
-- =====================================================

-- =====================================================
-- UUID Generation
-- =====================================================
-- Used for generating UUID primary keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- Case-Insensitive Text (Optional)
-- =====================================================
-- Useful for emails, usernames, and future search features.
CREATE EXTENSION IF NOT EXISTS citext;