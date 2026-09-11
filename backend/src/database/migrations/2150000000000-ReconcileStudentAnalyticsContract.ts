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

      /*
       * Some production databases were bootstrapped with uq_flag_type as a
       * standalone UNIQUE INDEX rather than a table constraint. Dropping the
       * constraint above therefore leaves the index behind, and PostgreSQL then
       * refuses to create the canonical UNIQUE constraint because its backing
       * index wants the same relation name. Remove only that stale standalone
       * index before recreating the canonical constraint.
       */
      DO $$
      DECLARE
        existing_relation regclass := to_regclass('public.uq_flag_type');
        owning_constraint record;
        relation_kind "char";
      BEGIN
        IF existing_relation IS NOT NULL THEN
          /* If an unexpected constraint owns the index, detach it first. */
          FOR owning_constraint IN
            SELECT conrelid::regclass AS table_name, conname
            FROM pg_constraint
            WHERE conindid = existing_relation
          LOOP
            EXECUTE format(
              'ALTER TABLE %s DROP CONSTRAINT %I',
              owning_constraint.table_name,
              owning_constraint.conname
            );
          END LOOP;

          SELECT relkind
          INTO relation_kind
          FROM pg_class
          WHERE oid = to_regclass('public.uq_flag_type');

          IF relation_kind IN ('i', 'I') THEN
            DROP INDEX IF EXISTS public.uq_flag_type;
          END IF;
        END IF;
      END $$;

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
