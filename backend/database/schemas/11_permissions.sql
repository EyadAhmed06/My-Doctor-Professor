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

DO $roles$
BEGIN
    BEGIN
        CREATE ROLE mdp_admin NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        CREATE ROLE mdp_backend NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        CREATE ROLE mdp_readonly NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END
$roles$;

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

