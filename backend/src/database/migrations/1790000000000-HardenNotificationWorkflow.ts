import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenNotificationWorkflow1790000000000 implements MigrationInterface {
  name = 'HardenNotificationWorkflow1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE user_notifications SET read_at=NULL
      WHERE notification_status='UNREAD';
      UPDATE user_notifications SET read_at=COALESCE(read_at,created_at,CURRENT_TIMESTAMP)
      WHERE notification_status='READ';
      ALTER TABLE user_notifications ADD CONSTRAINT chk_notification_read_state CHECK (
        (notification_status='UNREAD' AND read_at IS NULL)
        OR (notification_status='READ' AND read_at IS NOT NULL)
      );
      CREATE INDEX idx_user_notifications_inbox
        ON user_notifications(user_id,notification_status,created_at DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_user_notifications_inbox;
      ALTER TABLE user_notifications DROP CONSTRAINT IF EXISTS chk_notification_read_state;
    `);
  }
}
