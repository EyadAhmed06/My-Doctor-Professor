-- =====================================================
-- Medical Learning Platform
-- Notification Module
-- =====================================================
--
-- Contains:
-- • Notifications
-- • User Notifications
--
-- =====================================================

CREATE TABLE notifications (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    title VARCHAR(200) NOT NULL,

    message TEXT NOT NULL,

    target_url TEXT,

    notification_type notification_type NOT NULL,

    created_by UUID,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE SET NULL

);

CREATE TABLE user_notifications (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    notification_id UUID NOT NULL,

    user_id UUID NOT NULL,

    notification_status notification_status
        NOT NULL DEFAULT 'UNREAD',

    read_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (notification_id)
        REFERENCES notifications(id)
        ON DELETE CASCADE,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_notification_user
        UNIQUE(notification_id, user_id)

);

CREATE INDEX idx_notifications_type
ON notifications(notification_type);

CREATE INDEX idx_notifications_creator
ON notifications(created_by);

CREATE INDEX idx_user_notifications_user
ON user_notifications(user_id);

CREATE INDEX idx_user_notifications_notification
ON user_notifications(notification_id);

CREATE INDEX idx_user_notifications_status
ON user_notifications(notification_status);

