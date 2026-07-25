-- =====================================================
-- Medical Learning Platform
-- Audit Module
-- =====================================================
--
-- Contains:
-- • Audit Logs
--
-- =====================================================

CREATE TABLE audit_logs (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID,

    action audit_action NOT NULL,

    entity_name VARCHAR(100) NOT NULL,

    entity_id UUID,

    description TEXT,

    old_values JSONB,

    new_values JSONB,

    ip_address INET,

    user_agent TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE SET NULL

);

CREATE INDEX idx_audit_user
ON audit_logs(user_id);

CREATE INDEX idx_audit_action
ON audit_logs(action);

CREATE INDEX idx_audit_entity
ON audit_logs(entity_name);

CREATE INDEX idx_audit_created
ON audit_logs(created_at);

