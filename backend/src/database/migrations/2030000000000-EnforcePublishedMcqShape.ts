import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforcePublishedMcqShape2030000000000 implements MigrationInterface {
  name = 'EnforcePublishedMcqShape2030000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION enforce_test_mcq_shape_on_publish()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.is_published = TRUE THEN
          PERFORM assert_published_test_mcq_shape(NEW.id);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_tests_mcq_shape ON tests;
      CREATE TRIGGER trg_tests_mcq_shape
      BEFORE UPDATE OF is_published ON tests
      FOR EACH ROW
      WHEN (NEW.is_published = TRUE)
      EXECUTE FUNCTION enforce_test_mcq_shape_on_publish();
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION enforce_test_question_mcq_shape()
      RETURNS trigger AS $$
      DECLARE
        target_test uuid;
        published boolean;
      BEGIN
        target_test := COALESCE(NEW.test_id, OLD.test_id);
        SELECT is_published INTO published FROM tests WHERE id = target_test;
        IF published = TRUE THEN
          PERFORM assert_published_test_mcq_shape(target_test);
        END IF;
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_test_questions_mcq_shape ON test_questions;
      CREATE CONSTRAINT TRIGGER trg_test_questions_mcq_shape
      AFTER INSERT OR UPDATE OR DELETE ON test_questions
      DEFERRABLE INITIALLY IMMEDIATE
      FOR EACH ROW
      EXECUTE FUNCTION enforce_test_question_mcq_shape();
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION enforce_option_mcq_shape_for_published_tests()
      RETURNS trigger AS $$
      DECLARE
        target_question uuid;
      BEGIN
        target_question := COALESCE(NEW.question_id, OLD.question_id);
        IF EXISTS (
          SELECT 1
          FROM test_questions tq
          JOIN tests t ON t.id = tq.test_id
          WHERE tq.question_id = target_question AND t.is_published = TRUE
        ) THEN
          PERFORM assert_published_test_mcq_shape(tq.test_id)
          FROM test_questions tq
          JOIN tests t ON t.id = tq.test_id
          WHERE tq.question_id = target_question AND t.is_published = TRUE;
        END IF;
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_mcq_options_published_shape ON mcq_options;
      CREATE CONSTRAINT TRIGGER trg_mcq_options_published_shape
      AFTER INSERT OR UPDATE OR DELETE ON mcq_options
      DEFERRABLE INITIALLY IMMEDIATE
      FOR EACH ROW
      EXECUTE FUNCTION enforce_option_mcq_shape_for_published_tests();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_mcq_options_published_shape ON mcq_options`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_test_questions_mcq_shape ON test_questions`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_tests_mcq_shape ON tests`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS enforce_option_mcq_shape_for_published_tests()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS enforce_test_question_mcq_shape()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS enforce_test_mcq_shape_on_publish()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS assert_published_test_mcq_shape(uuid)`);
  }
}
