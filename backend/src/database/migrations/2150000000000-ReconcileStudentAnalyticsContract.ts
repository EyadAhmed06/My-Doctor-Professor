import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reconciles columns consumed by the student analytics/review surfaces.
 *
 * Older databases can pre-date the feature migrations while still contain the
 * core assessment tables (for example when bootstrapped from database/schemas).
 * Keep this migration idempotent so an already-correct database is unchanged.
 */
export class ReconcileStudentAnalyticsContract2150000000000
  implements MigrationInterface
{
  name = 'ReconcileStudentAnalyticsContract2150000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE student_answers
        ADD COLUMN IF NOT EXISTS confidence_level varchar(12);

      ALTER TABLE student_answers
        DROP CONSTRAINT IF EXISTS chk_student_answer_confidence;
      ALTER TABLE student_answers
        ADD CONSTRAINT chk_student_answer_confidence
        CHECK (
          confidence_level IS NULL
          OR confidence_level IN ('LOW', 'MEDIUM', 'HIGH')
        );

      ALTER TABLE question_flags
        ADD COLUMN IF NOT EXISTS flag_type varchar(10) NOT NULL DEFAULT 'NORMAL';

      ALTER TABLE question_flags DROP CONSTRAINT IF EXISTS uq_flag;
      ALTER TABLE question_flags DROP CONSTRAINT IF EXISTS uq_flag_type;
      ALTER TABLE question_flags DROP CONSTRAINT IF EXISTS chk_question_flag_type;
      ALTER TABLE question_flags
        ADD CONSTRAINT chk_question_flag_type
        CHECK (flag_type IN ('NORMAL', 'HARD'));
      ALTER TABLE question_flags
        ADD CONSTRAINT uq_flag_type UNIQUE (attempt_id, question_id, flag_type);
    `);
  }

  async down(): Promise<void> {
    // Forward-only reconciliation: dropping these columns would break current
    // analytics/review code and could discard persisted student metadata.
  }
}
