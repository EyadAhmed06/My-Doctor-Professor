import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAssessmentAnnotations2230000000000 implements MigrationInterface {
  name = 'AddAssessmentAnnotations2230000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS assessment_annotations (
        attempt_id uuid PRIMARY KEY REFERENCES test_attempts(id) ON DELETE CASCADE,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        revision integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT assessment_annotations_revision_nonnegative CHECK (revision >= 0),
        CONSTRAINT assessment_annotations_payload_object CHECK (jsonb_typeof(payload) = 'object')
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS assessment_annotations');
  }
}
