import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenAssessmentIdempotency2020000000000 implements MigrationInterface {
  name = 'HardenAssessmentIdempotency2020000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tests ADD COLUMN IF NOT EXISTS generation_key varchar(128)`);
    await queryRunner.query(`ALTER TABLE tests ADD COLUMN IF NOT EXISTS generation_fingerprint varchar(64)`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_tests_creator_generation_key
      ON tests (created_by, generation_key)
      WHERE generation_key IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_tests_creator_generation_key`);
    await queryRunner.query(`ALTER TABLE tests DROP COLUMN IF EXISTS generation_fingerprint`);
    await queryRunner.query(`ALTER TABLE tests DROP COLUMN IF EXISTS generation_key`);
  }
}
