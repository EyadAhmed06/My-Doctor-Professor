import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAssessmentGenerationIdempotency1850000000000 implements MigrationInterface {
  name = 'AddAssessmentGenerationIdempotency1850000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tests
        ADD COLUMN IF NOT EXISTS generation_key VARCHAR(128),
        ADD COLUMN IF NOT EXISTS generation_fingerprint VARCHAR(64);

      CREATE UNIQUE INDEX IF NOT EXISTS uq_tests_creator_generation_key
        ON tests(created_by, generation_key)
        WHERE generation_key IS NOT NULL;
    `);
  }

  public async down(): Promise<void> {
    // Forward-only safety migration: keep persisted idempotency data intact.
  }
}
