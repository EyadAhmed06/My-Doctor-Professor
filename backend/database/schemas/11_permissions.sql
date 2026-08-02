-- =====================================================
-- Medical Learning Platform
-- Roles & Permissions
-- =====================================================
--
-- Contains:
-- • Database Roles
-- • Privileges
-- • Default Privileges
--
-- =====================================================

DO $
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mdp_admin') THEN
        CREATE ROLE mdp_admin;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mdp_backend') THEN
        CREATE ROLE mdp_backend;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mdp_readonly') THEN
        CREATE ROLE mdp_readonly;
    END IF;
END
$;

GRANT USAGE
ON SCHEMA public
TO mdp_backend;

GRANT USAGE
ON SCHEMA public
TO mdp_readonly;

GRANT

SELECT,
INSERT,
UPDATE,
DELETE

ON ALL TABLES IN SCHEMA public

TO mdp_backend;

GRANT

SELECT

ON ALL TABLES IN SCHEMA public

TO mdp_readonly;

GRANT

USAGE,
SELECT

ON ALL SEQUENCES IN SCHEMA public

TO mdp_backend;

GRANT

EXECUTE

ON ALL FUNCTIONS IN SCHEMA public

TO mdp_backend;

ALTER DEFAULT PRIVILEGES
IN SCHEMA public

GRANT

SELECT,
INSERT,
UPDATE,
DELETE

ON TABLES

TO mdp_backend;

ALTER DEFAULT PRIVILEGES
IN SCHEMA public

GRANT SELECT

ON TABLES

TO mdp_readonly;

ALTER DEFAULT PRIVILEGES
IN SCHEMA public

GRANT

USAGE,
SELECT

ON SEQUENCES

TO mdp_backend;

ALTER DEFAULT PRIVILEGES
IN SCHEMA public

GRANT EXECUTE

ON FUNCTIONS

TO mdp_backend;

