import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPersistentDeviceBindings2090000000000 implements MigrationInterface {
  name = 'AddPersistentDeviceBindings2090000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS device_bindings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        device_token_hash text NOT NULL,
        ip_address inet,
        user_agent text,
        bound_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at timestamp,
        released_at timestamp,
        released_by_admin_id uuid,
        CONSTRAINT device_bindings_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT device_bindings_released_by_admin_id_fkey
          FOREIGN KEY (released_by_admin_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_device_bindings_user
        ON device_bindings(user_id);
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_device_bindings_token_hash
        ON device_bindings(device_token_hash);
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_device_bindings_active_user
        ON device_bindings(user_id)
        WHERE released_at IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS device_bindings;');
  }
}
