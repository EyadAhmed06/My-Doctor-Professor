import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBundlePricingPayments1950000000000 implements MigrationInterface {
  name = 'AddBundlePricingPayments1950000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE bundle_payment_status AS ENUM (
        'NOT_REQUIRED',
        'PENDING',
        'PAID',
        'CANCELLED'
      );

      ALTER TABLE bundles
        ADD COLUMN price_amount numeric(10,2),
        ADD COLUMN price_currency varchar(3) NOT NULL DEFAULT 'EGP';

      ALTER TABLE bundles
        ADD CONSTRAINT ck_bundle_price_positive
          CHECK (price_amount IS NULL OR price_amount > 0),
        ADD CONSTRAINT ck_bundle_price_currency
          CHECK (price_currency ~ '^[A-Z]{3}$');

      ALTER TABLE bundle_enrollments
        ADD COLUMN payment_status bundle_payment_status NOT NULL DEFAULT 'NOT_REQUIRED',
        ADD COLUMN paid_at timestamp,
        ADD COLUMN payment_reference varchar(200);

      UPDATE bundle_enrollments enrollment
      SET payment_status = 'PENDING',
          status = 'REVOKED',
          paid_at = NULL,
          payment_reference = NULL
      FROM bundles bundle
      WHERE bundle.id = enrollment.bundle_id
        AND bundle.is_free = FALSE;

      CREATE INDEX idx_bundle_enrollment_payment_status
        ON bundle_enrollments(bundle_id, payment_status);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_bundle_enrollment_payment_status;

      ALTER TABLE bundle_enrollments
        DROP COLUMN IF EXISTS payment_reference,
        DROP COLUMN IF EXISTS paid_at,
        DROP COLUMN IF EXISTS payment_status;

      ALTER TABLE bundles
        DROP CONSTRAINT IF EXISTS ck_bundle_price_currency,
        DROP CONSTRAINT IF EXISTS ck_bundle_price_positive,
        DROP COLUMN IF EXISTS price_currency,
        DROP COLUMN IF EXISTS price_amount;

      DROP TYPE IF EXISTS bundle_payment_status;
    `);
  }
}
