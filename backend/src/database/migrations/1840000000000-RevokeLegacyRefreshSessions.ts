import { MigrationInterface, QueryRunner } from 'typeorm';

export class RevokeLegacyRefreshSessions1840000000000 implements MigrationInterface {
  name = 'RevokeLegacyRefreshSessions1840000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Earlier releases stored adaptive bcrypt hashes, which cannot participate
    // in a single-statement compare-and-swap. Revoke them once so every active
    // session after this deployment uses a deterministic SHA-256 token digest.
    await queryRunner.query(`
      UPDATE auth_sessions
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE revoked_at IS NULL
    `);
  }

  public async down(): Promise<void> {
    // Revoked authentication sessions must never be reactivated by rollback.
  }
}
