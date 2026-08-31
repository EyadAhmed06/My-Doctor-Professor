import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceSingleActiveStudentSession2080000000000 implements MigrationInterface {
  name = 'EnforceSingleActiveStudentSession2080000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Reclaim expired unrevoked sessions so they do not hold unique slots.
    await queryRunner.query(`
      UPDATE auth_sessions
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE revoked_at IS NULL AND expires_at <= CURRENT_TIMESTAMP;
    `);

    // 2. Backfill: If any user currently has multiple active unrevoked sessions,
    // keep only their newest session and revoke older duplicates to ensure the unique index builds.
    await queryRunner.query(`
      WITH ranked_sessions AS (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
        FROM auth_sessions
        WHERE revoked_at IS NULL
      )
      UPDATE auth_sessions
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE id IN (
        SELECT id FROM ranked_sessions WHERE rn > 1
      );
    `);

    // 3. Add ip_address and user_agent columns for session auditing.
    await queryRunner.query(`
      ALTER TABLE auth_sessions
        ADD COLUMN IF NOT EXISTS ip_address inet,
        ADD COLUMN IF NOT EXISTS user_agent text;
    `);

    // 4. Create partial unique index on active (unrevoked) sessions per user.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_sessions_active_user
        ON auth_sessions(user_id)
        WHERE revoked_at IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_auth_sessions_active_user;`);
    await queryRunner.query(`ALTER TABLE auth_sessions DROP COLUMN IF EXISTS user_agent;`);
    await queryRunner.query(`ALTER TABLE auth_sessions DROP COLUMN IF EXISTS ip_address;`);
  }
}
