import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuestionFlagTypes2010000000000 implements MigrationInterface {
  name = 'AddQuestionFlagTypes2010000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE question_flags
      ADD COLUMN IF NOT EXISTS flag_type varchar(10) NOT NULL DEFAULT 'NORMAL'
    `);
    await queryRunner.query(`ALTER TABLE question_flags DROP CONSTRAINT IF EXISTS uq_flag`);
    await queryRunner.query(`ALTER TABLE question_flags DROP CONSTRAINT IF EXISTS uq_flag_type`);
    await queryRunner.query(`ALTER TABLE question_flags DROP CONSTRAINT IF EXISTS chk_question_flag_type`);
    await queryRunner.query(`
      ALTER TABLE question_flags
      ADD CONSTRAINT chk_question_flag_type CHECK (flag_type IN ('NORMAL', 'HARD'))
    `);
    await queryRunner.query(`
      ALTER TABLE question_flags
      ADD CONSTRAINT uq_flag_type UNIQUE (attempt_id, question_id, flag_type)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE question_flags DROP CONSTRAINT IF EXISTS uq_flag_type`);
    await queryRunner.query(`ALTER TABLE question_flags DROP CONSTRAINT IF EXISTS chk_question_flag_type`);
    await queryRunner.query(`ALTER TABLE question_flags DROP COLUMN IF EXISTS flag_type`);
    await queryRunner.query(`
      ALTER TABLE question_flags
      ADD CONSTRAINT uq_flag UNIQUE (attempt_id, question_id)
    `);
  }
}
