import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repairs historical databases whose migration ledger contains
 * AddStudentAchievements2040000000000 while the physical table is missing.
 *
 * The achievements endpoint is loaded from Study Plan and other student surfaces, so a
 * missing table turns an otherwise healthy student session into a 500. Keep this repair
 * forward-only and idempotent: create the canonical table when absent, validate an existing
 * table instead of guessing how to transform unknown partial data, and recreate only the
 * safe derived index.
 */
export class ReconcileStudentAchievements2165000000000
  implements MigrationInterface
{
  name = 'ReconcileStudentAchievements2165000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('student_achievements');

    if (!hasTable) {
      await queryRunner.query(`
        CREATE TABLE student_achievements (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          achievement_code varchar(80) NOT NULL,
          unlocked_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_student_achievement_code UNIQUE(student_id, achievement_code)
        )
      `);
    } else {
      const [contract] = await queryRunner.query(`
        WITH required(column_name) AS (
          VALUES
            ('id'),
            ('student_id'),
            ('achievement_code'),
            ('unlocked_at'),
            ('created_at')
        ), missing AS (
          SELECT required.column_name
          FROM required
          LEFT JOIN information_schema.columns column_info
            ON column_info.table_schema = current_schema()
           AND column_info.table_name = 'student_achievements'
           AND column_info.column_name = required.column_name
          WHERE column_info.column_name IS NULL
        )
        SELECT COALESCE(string_agg(column_name, ', ' ORDER BY column_name), '') AS missing
        FROM missing
      `) as Array<{ missing: string }>;

      if (contract?.missing) {
        throw new Error(
          `student_achievements is partially installed; missing columns: ${contract.missing}`,
        );
      }
    }

    // ON CONFLICT(student_id, achievement_code) in AchievementFeedbackService requires this
    // uniqueness contract. The original table constraint already owns an index with this name,
    // so IF NOT EXISTS is safe both for fresh and repaired databases.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_student_achievement_code
      ON student_achievements(student_id, achievement_code)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_student_achievements_unlocked
      ON student_achievements(student_id, unlocked_at DESC)
    `);

    const [verified] = await queryRunner.query(`
      SELECT
        to_regclass('public.student_achievements') IS NOT NULL AS table_exists,
        EXISTS (
          SELECT 1
          FROM pg_index index_info
          JOIN pg_class index_class ON index_class.oid = index_info.indexrelid
          JOIN pg_class table_class ON table_class.oid = index_info.indrelid
          WHERE table_class.relname = 'student_achievements'
            AND index_info.indisunique = TRUE
            AND pg_get_indexdef(index_info.indexrelid) LIKE '%(student_id, achievement_code)%'
        ) AS uniqueness_exists
    `) as Array<{ table_exists: boolean; uniqueness_exists: boolean }>;

    if (!verified?.table_exists || !verified?.uniqueness_exists) {
      throw new Error('student_achievements reconciliation did not establish the required contract');
    }
  }

  async down(): Promise<void> {
    // Forward-only reconciliation. Dropping this table would destroy achievement history.
  }
}
