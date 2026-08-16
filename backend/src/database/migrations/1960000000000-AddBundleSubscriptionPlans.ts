import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBundleSubscriptionPlans1960000000000 implements MigrationInterface {
  name = 'AddBundleSubscriptionPlans1960000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE bundle_plan AS ENUM ('FIRST','FINAL');
      CREATE TYPE bundle_plan_tier AS ENUM ('MCQ','MCQ_ESSAY');

      ALTER TABLE bundles
        ADD COLUMN first_plan_enabled boolean NOT NULL DEFAULT false,
        ADD COLUMN first_plan_price_mcq numeric(10,2),
        ADD COLUMN first_plan_price_mcq_essay numeric(10,2),
        ADD COLUMN final_plan_enabled boolean NOT NULL DEFAULT false,
        ADD COLUMN final_plan_price_mcq numeric(10,2),
        ADD COLUMN final_plan_price_mcq_essay numeric(10,2);

      ALTER TABLE bundles
        ADD CONSTRAINT ck_bundle_first_plan_price CHECK (
          first_plan_price_mcq IS NULL OR first_plan_price_mcq > 0
        ),
        ADD CONSTRAINT ck_bundle_first_plan_essay_price CHECK (
          first_plan_price_mcq_essay IS NULL OR first_plan_price_mcq_essay > 0
        ),
        ADD CONSTRAINT ck_bundle_final_plan_price CHECK (
          final_plan_price_mcq IS NULL OR final_plan_price_mcq > 0
        ),
        ADD CONSTRAINT ck_bundle_final_plan_essay_price CHECK (
          final_plan_price_mcq_essay IS NULL OR final_plan_price_mcq_essay > 0
        );

      CREATE TABLE bundle_plan_weeks (
        bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
        plan bundle_plan NOT NULL,
        week_id uuid NOT NULL REFERENCES weeks(id) ON DELETE RESTRICT,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (bundle_id, plan, week_id)
      );
      CREATE INDEX idx_bundle_plan_weeks_week ON bundle_plan_weeks(week_id);

      CREATE TABLE bundle_plan_grants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE RESTRICT,
        student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        plan bundle_plan NOT NULL,
        tier bundle_plan_tier NOT NULL DEFAULT 'MCQ',
        status bundle_enrollment_status NOT NULL DEFAULT 'ACTIVE',
        payment_status bundle_payment_status NOT NULL DEFAULT 'PENDING',
        paid_at timestamp,
        payment_reference varchar(200),
        expires_at timestamp,
        granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_bundle_plan_student UNIQUE (bundle_id, student_id, plan)
      );
      CREATE INDEX idx_bundle_plan_grants_student_status
        ON bundle_plan_grants(student_id, status);
      CREATE INDEX idx_bundle_plan_grants_payment_status
        ON bundle_plan_grants(bundle_id, payment_status);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS bundle_plan_grants;
      DROP TABLE IF EXISTS bundle_plan_weeks;

      ALTER TABLE bundles
        DROP CONSTRAINT IF EXISTS ck_bundle_final_plan_essay_price,
        DROP CONSTRAINT IF EXISTS ck_bundle_final_plan_price,
        DROP CONSTRAINT IF EXISTS ck_bundle_first_plan_essay_price,
        DROP CONSTRAINT IF EXISTS ck_bundle_first_plan_price,
        DROP COLUMN IF EXISTS final_plan_price_mcq_essay,
        DROP COLUMN IF EXISTS final_plan_price_mcq,
        DROP COLUMN IF EXISTS final_plan_enabled,
        DROP COLUMN IF EXISTS first_plan_price_mcq_essay,
        DROP COLUMN IF EXISTS first_plan_price_mcq,
        DROP COLUMN IF EXISTS first_plan_enabled;

      DROP TYPE IF EXISTS bundle_plan_tier;
      DROP TYPE IF EXISTS bundle_plan;
    `);
  }
}
