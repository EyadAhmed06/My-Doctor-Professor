BEGIN;

CREATE TABLE IF NOT EXISTS account_action_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose VARCHAR(30) NOT NULL,
    token_digest CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_account_action_token_purpose
        CHECK (purpose IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET'))
);

CREATE INDEX IF NOT EXISTS idx_account_action_tokens_user_purpose
    ON account_action_tokens(user_id, purpose);

CREATE INDEX IF NOT EXISTS idx_account_action_tokens_expiry
    ON account_action_tokens(expires_at);

CREATE TABLE IF NOT EXISTS email_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encrypted_payload TEXT NOT NULL,
    encryption_iv VARCHAR(24) NOT NULL,
    encryption_tag VARCHAR(32) NOT NULL,
    attempts SMALLINT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMP,
    sent_at TIMESTAMP,
    last_error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_email_outbox_attempts
        CHECK (attempts >= 0 AND attempts <= 5)
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_pending
    ON email_outbox(sent_at, next_attempt_at);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
    limit_key CHAR(64) PRIMARY KEY,
    window_started_at TIMESTAMP NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_auth_rate_limit_count
        CHECK (request_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_expiry
    ON auth_rate_limits(expires_at);

COMMIT;
