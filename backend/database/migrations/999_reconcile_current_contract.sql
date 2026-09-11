-- Final compatibility reconciliation for installations upgraded from the Eyad baseline.
-- This migration is intentionally idempotent and must sort after earlier forward migrations.

CREATE TABLE IF NOT EXISTS auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    refresh_token_hash TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT auth_sessions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
ON auth_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry
ON auth_sessions(expires_at);

UPDATE test_attempts
SET auto_submitted = FALSE
WHERE auto_submitted IS NULL;

ALTER TABLE test_attempts
    ALTER COLUMN auto_submitted SET DEFAULT FALSE,
    ALTER COLUMN auto_submitted SET NOT NULL;

-- Foreign-key hardening belongs to the ordered TypeORM migrations 176-178.
-- Keeping it here would run the same transition twice before those migrations
-- are entered in TypeORM's migration ledger.
