import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowFourOrFiveOptionPublishedMcqs2410000000000 implements MigrationInterface {
  name = 'AllowFourOrFiveOptionPublishedMcqs2410000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION assert_published_test_mcq_shape(target_test_id uuid)
      RETURNS void AS $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM test_questions tq
          JOIN questions q ON q.id = tq.question_id
          WHERE tq.test_id = target_test_id
            AND q.question_type = 'MCQ'
            AND (
              (SELECT COUNT(*) FROM mcq_options mo WHERE mo.question_id = q.id) NOT IN (4, 5)
              OR
              (SELECT COUNT(*) FROM mcq_options mo WHERE mo.question_id = q.id AND mo.is_correct = TRUE) <> 1
            )
        ) THEN
          RAISE EXCEPTION 'Published assessments require every MCQ to have four or five options and exactly one correct answer'
            USING ERRCODE = '23514';
        END IF;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION assert_published_test_mcq_shape(target_test_id uuid)
      RETURNS void AS $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM test_questions tq
          JOIN questions q ON q.id = tq.question_id
          WHERE tq.test_id = target_test_id
            AND q.question_type = 'MCQ'
            AND (
              (SELECT COUNT(*) FROM mcq_options mo WHERE mo.question_id = q.id) <> 5
              OR
              (SELECT COUNT(*) FROM mcq_options mo WHERE mo.question_id = q.id AND mo.is_correct = TRUE) <> 1
            )
        ) THEN
          RAISE EXCEPTION 'Published assessments require every MCQ to have exactly five options and exactly one correct answer'
            USING ERRCODE = '23514';
        END IF;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }
}
