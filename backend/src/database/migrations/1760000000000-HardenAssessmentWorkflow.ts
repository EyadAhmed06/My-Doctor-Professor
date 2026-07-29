import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenAssessmentWorkflow1760000000000 implements MigrationInterface {
  name = 'HardenAssessmentWorkflow1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ DECLARE constraint_name text;
      BEGIN
        SELECT tc.constraint_name INTO constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu USING (constraint_schema, constraint_name)
        WHERE tc.table_schema = current_schema() AND tc.table_name = 'tests'
          AND tc.constraint_type = 'FOREIGN KEY' AND ccu.column_name = 'created_by'
        LIMIT 1;
        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE tests DROP CONSTRAINT %I', constraint_name);
        END IF;
      END $$;
      ALTER TABLE tests ADD CONSTRAINT fk_tests_created_by_users
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;

      DO $$ DECLARE constraint_name text;
      BEGIN
        SELECT tc.constraint_name INTO constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu USING (constraint_schema, constraint_name)
        WHERE tc.table_schema = current_schema() AND tc.table_name = 'test_questions'
          AND tc.constraint_type = 'FOREIGN KEY' AND ccu.column_name = 'question_id'
        LIMIT 1;
        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE test_questions DROP CONSTRAINT %I', constraint_name);
        END IF;
      END $$;
      ALTER TABLE test_questions ADD CONSTRAINT fk_test_questions_question_restrict
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT;

      DO $$ DECLARE constraint_name text;
      BEGIN
        SELECT tc.constraint_name INTO constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu USING (constraint_schema, constraint_name)
        WHERE tc.table_schema = current_schema() AND tc.table_name = 'test_attempts'
          AND tc.constraint_type = 'FOREIGN KEY' AND ccu.column_name = 'test_id'
        LIMIT 1;
        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE test_attempts DROP CONSTRAINT %I', constraint_name);
        END IF;
      END $$;
      ALTER TABLE test_attempts ADD CONSTRAINT fk_test_attempts_test_restrict
        FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE RESTRICT;

      DO $ DECLARE table_name text; constraint_name text;
      BEGIN
        FOREACH target_table IN ARRAY ARRAY['student_answers', 'question_flags', 'question_notes']
        LOOP
          SELECT tc.constraint_name INTO constraint_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage ccu USING (constraint_schema, constraint_name)
          WHERE tc.table_schema = current_schema() AND tc.table_name = target_table
            AND tc.constraint_type = 'FOREIGN KEY' AND ccu.column_name = 'question_id'
          LIMIT 1;
          IF constraint_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', target_table, constraint_name);
          END IF;
          EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT fk_%s_question_restrict FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT',
            table_name, table_name
          );
          constraint_name := NULL;
        END LOOP;
      END $;

      ALTER TABLE student_answers
        ADD COLUMN IF NOT EXISTS feedback TEXT,
        ADD COLUMN IF NOT EXISTS graded_by UUID,
        ADD COLUMN IF NOT EXISTS graded_at TIMESTAMP;
      ALTER TABLE student_answers
        ADD CONSTRAINT fk_student_answers_graded_by
        FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL;
      WITH ranked_answers AS (
        SELECT id, row_number() OVER (
          PARTITION BY attempt_id, question_id
          ORDER BY answered_at DESC NULLS LAST, id DESC
        ) AS position
        FROM student_answers
      )
      DELETE FROM student_answers
      WHERE id IN (SELECT id FROM ranked_answers WHERE position > 1);
      ALTER TABLE student_answers
        ADD CONSTRAINT uq_attempt_question_answer UNIQUE (attempt_id, question_id);

      WITH ranked AS (
        SELECT id, row_number() OVER (
          PARTITION BY student_id, test_id ORDER BY started_at DESC NULLS LAST, created_at DESC
        ) AS position
        FROM test_attempts WHERE status = 'IN_PROGRESS'
      )
      UPDATE test_attempts SET status = 'EXPIRED', auto_submitted = TRUE,
        submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP)
      WHERE id IN (SELECT id FROM ranked WHERE position > 1);
      CREATE UNIQUE INDEX uq_active_student_test_attempt
        ON test_attempts(student_id, test_id) WHERE status = 'IN_PROGRESS';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_active_student_test_attempt;
      ALTER TABLE student_answers DROP CONSTRAINT IF EXISTS uq_attempt_question_answer;
      ALTER TABLE student_answers DROP CONSTRAINT IF EXISTS fk_student_answers_graded_by;
      ALTER TABLE student_answers DROP CONSTRAINT IF EXISTS fk_student_answers_question_restrict;
      ALTER TABLE student_answers ADD CONSTRAINT fk_student_answers_question
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;
      ALTER TABLE question_flags DROP CONSTRAINT IF EXISTS fk_question_flags_question_restrict;
      ALTER TABLE question_flags ADD CONSTRAINT fk_question_flags_question
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;
      ALTER TABLE question_notes DROP CONSTRAINT IF EXISTS fk_question_notes_question_restrict;
      ALTER TABLE question_notes ADD CONSTRAINT fk_question_notes_question
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;
      ALTER TABLE student_answers DROP COLUMN IF EXISTS graded_at;
      ALTER TABLE student_answers DROP COLUMN IF EXISTS graded_by;
      ALTER TABLE student_answers DROP COLUMN IF EXISTS feedback;
      ALTER TABLE test_attempts DROP CONSTRAINT IF EXISTS fk_test_attempts_test_restrict;
      ALTER TABLE test_attempts ADD CONSTRAINT fk_test_attempts_test
        FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE;
      ALTER TABLE test_questions DROP CONSTRAINT IF EXISTS fk_test_questions_question_restrict;
      ALTER TABLE test_questions ADD CONSTRAINT fk_test_questions_question
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;
      ALTER TABLE tests DROP CONSTRAINT IF EXISTS fk_tests_created_by_users;
      ALTER TABLE tests ADD CONSTRAINT fk_tests_created_by_instructors
        FOREIGN KEY (created_by) REFERENCES instructors(user_id) ON DELETE RESTRICT;
    `);
  }
}
