import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMcqOptionExplanations1990000000000 implements MigrationInterface {
  name = 'AddMcqOptionExplanations1990000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mcq_options
      ADD COLUMN IF NOT EXISTS explanation text
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mcq_options
      DROP COLUMN IF EXISTS explanation
    `);
  }
}
