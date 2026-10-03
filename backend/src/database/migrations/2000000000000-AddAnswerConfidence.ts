import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAnswerConfidence2000000000000 implements MigrationInterface {
  name = 'AddAnswerConfidence2000000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE student_answers
      ADD COLUMN IF NOT EXISTS confidence_level varchar(12)
    `);
    await queryRunner.query(`
      ALTER TABLE student_answers
      DROP CONSTRAINT IF EXISTS chk_student_answer_confidence
    `);
    await queryRunner.query(`
      ALTER TABLE student_answers
      ADD CONSTRAINT chk_student_answer_confidence
      CHECK (confidence_level IS NULL OR confidence_level IN ('LOW', 'MEDIUM', 'HIGH'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE student_answers
      DROP CONSTRAINT IF EXISTS chk_student_answer_confidence
    `);
    await queryRunner.query(`
      ALTER TABLE student_answers
      DROP COLUMN IF EXISTS confidence_level
    `);
  }
}
