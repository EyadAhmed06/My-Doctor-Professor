import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repairs the small set of schema objects the student dashboard reads on every load.
 *
 * Some long-lived/demo databases were originally bootstrapped from database/schemas and
 * later upgraded through migrations. That can leave the workspace scheduler contract only
 * partially installed while the rest of the application remains usable. The dashboard then
 * fails as a whole because its analytics query unconditionally reads study_plan_items.
 *
 * This migration is deliberately forward-only and idempotent: it preserves existing rows,
 * adds only missing objects/columns, and backfills timestamps from the closest available
 * historical value rather than deleting data.
 */
export class ReconcileStudentDashboardContract2160000000000
  implements MigrationInterface
{
  name = 'ReconcileStudentDashboardContract2160000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regtype('public.study_plan_item_type') IS NULL THEN
          CREATE TYPE study_plan_item_type AS ENUM (
            'QUESTIONS','FLASHCARDS','LECTURE','REVIEW','REST'
          );
        END IF;
        IF to_regtype('public.study_plan_item_status') IS NULL THEN
          CREATE TYPE study_plan_item_status AS ENUM (
            'PLANNED','COMPLETED','SKIPPED'
          );
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS student_study_plans (
        student_id uuid PRIMARY KEY,
        target_exam varchar(100),
        exam_date date,
        daily_question_target int NOT NULL DEFAULT 20,
        weekly_hours_target int NOT NULL DEFAULT 10,
        daily_flashcard_target int NOT NULL DEFAULT 20,
        preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
        generated_at timestamp,
        schedule_version int NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_study_plan_student
          FOREIGN KEY (student_id) REFERENCES students(user_id) ON DELETE CASCADE
      );

      ALTER TABLE student_study_plans
        ADD COLUMN IF NOT EXISTS target_exam varchar(100),
        ADD COLUMN IF NOT EXISTS exam_date date,
        ADD COLUMN IF NOT EXISTS daily_question_target int NOT NULL DEFAULT 20,
        ADD COLUMN IF NOT EXISTS weekly_hours_target int NOT NULL DEFAULT 10,
        ADD COLUMN IF NOT EXISTS daily_flashcard_target int NOT NULL DEFAULT 20,
        ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS generated_at timestamp,
        ADD COLUMN IF NOT EXISTS schedule_version int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;

      CREATE TABLE IF NOT EXISTS study_plan_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id uuid NOT NULL,
        scheduled_date date NOT NULL,
        item_type study_plan_item_type NOT NULL,
        status study_plan_item_status NOT NULL DEFAULT 'PLANNED',
        lecture_id uuid,
        target_count int,
        duration_minutes int NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        completed_at timestamp,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_study_plan_item_plan
          FOREIGN KEY (student_id) REFERENCES student_study_plans(student_id) ON DELETE CASCADE,
        CONSTRAINT fk_study_plan_item_lecture
          FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE SET NULL
      );

      ALTER TABLE study_plan_items
        ADD COLUMN IF NOT EXISTS scheduled_date date,
        ADD COLUMN IF NOT EXISTS item_type study_plan_item_type,
        ADD COLUMN IF NOT EXISTS status study_plan_item_status DEFAULT 'PLANNED',
        ADD COLUMN IF NOT EXISTS lecture_id uuid,
        ADD COLUMN IF NOT EXISTS target_count int,
        ADD COLUMN IF NOT EXISTS duration_minutes int,
        ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS completed_at timestamp,
        ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT CURRENT_TIMESTAMP;

      UPDATE study_plan_items
      SET scheduled_date = COALESCE(scheduled_date, CURRENT_DATE),
          item_type = COALESCE(item_type, 'REVIEW'::study_plan_item_type),
          status = COALESCE(status, 'PLANNED'::study_plan_item_status),
          duration_minutes = COALESCE(duration_minutes, 1),
          metadata = COALESCE(metadata, '{}'::jsonb),
          created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
          updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
      WHERE scheduled_date IS NULL
         OR item_type IS NULL
         OR status IS NULL
         OR duration_minutes IS NULL
         OR metadata IS NULL
         OR created_at IS NULL
         OR updated_at IS NULL;

      ALTER TABLE study_plan_items
        ALTER COLUMN scheduled_date SET NOT NULL,
        ALTER COLUMN item_type SET NOT NULL,
        ALTER COLUMN status SET DEFAULT 'PLANNED',
        ALTER COLUMN status SET NOT NULL,
        ALTER COLUMN duration_minutes SET NOT NULL,
        ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
        ALTER COLUMN metadata SET NOT NULL,
        ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
        ALTER COLUMN created_at SET NOT NULL,
        ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP,
        ALTER COLUMN updated_at SET NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_study_plan_items_student_date
        ON study_plan_items(student_id, scheduled_date);

      ALTER TABLE student_answers
        ADD COLUMN IF NOT EXISTS essay_answer text,
        ADD COLUMN IF NOT EXISTS answered_at timestamp;

      UPDATE student_answers
      SET answered_at = COALESCE(answered_at, created_at, CURRENT_TIMESTAMP)
      WHERE answered_at IS NULL;

      ALTER TABLE student_answers
        ALTER COLUMN answered_at SET DEFAULT CURRENT_TIMESTAMP,
        ALTER COLUMN answered_at SET NOT NULL;

      DO $$
      DECLARE missing_contract text;
      BEGIN
        WITH required(table_name, column_name) AS (
          VALUES
            ('student_answers','attempt_id'),
            ('student_answers','question_id'),
            ('student_answers','selected_option_id'),
            ('student_answers','essay_answer'),
            ('student_answers','is_correct'),
            ('student_answers','answered_at'),
            ('test_attempts','student_id'),
            ('test_attempts','test_id'),
            ('test_attempts','status'),
            ('test_attempts','score'),
            ('test_attempts','submitted_at'),
            ('test_attempts','created_at'),
            ('student_question_progress','student_id'),
            ('student_question_progress','bookmarked'),
            ('student_flashcard_progress','student_id'),
            ('student_flashcard_progress','times_reviewed'),
            ('student_flashcard_progress','is_mastered'),
            ('student_flashcard_progress','last_reviewed_at'),
            ('student_flashcard_progress','next_review_at'),
            ('student_lecture_progress','student_id'),
            ('student_lecture_progress','is_completed'),
            ('student_lecture_progress','time_spent_minutes'),
            ('student_lecture_progress','last_accessed_at'),
            ('student_topic_progress','student_id'),
            ('student_topic_progress','topic_id'),
            ('student_topic_progress','questions_attempted'),
            ('student_topic_progress','mastery_percentage'),
            ('study_plan_items','student_id'),
            ('study_plan_items','status'),
            ('study_plan_items','item_type'),
            ('study_plan_items','duration_minutes'),
            ('study_plan_items','completed_at'),
            ('essay_case_attempts','student_id'),
            ('essay_case_attempts','case_id'),
            ('essay_case_attempts','status'),
            ('essay_case_attempts','submitted_at'),
            ('essay_cases','id'),
            ('essay_cases','week_id'),
            ('essay_cases','is_published')
        ), missing AS (
          SELECT required.table_name || '.' || required.column_name AS name
          FROM required
          LEFT JOIN information_schema.columns column_info
            ON column_info.table_schema = current_schema()
           AND column_info.table_name = required.table_name
           AND column_info.column_name = required.column_name
          WHERE column_info.column_name IS NULL
        )
        SELECT string_agg(name, ', ' ORDER BY name) INTO missing_contract FROM missing;

        IF missing_contract IS NOT NULL THEN
          RAISE EXCEPTION 'Student dashboard schema contract is incomplete after reconciliation: %',
            missing_contract;
        END IF;
      END $$;
    `);
  }

  async down(): Promise<void> {
    // Forward-only reconciliation. Removing repaired columns/tables can destroy production data.
  }
}
