import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBundlePricingPayments1950000000000 implements MigrationInterface {
  name = 'AddBundlePricingPayments1950000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const paymentColumnAlreadyExisted = await queryRunner.hasColumn(
      'bundle_enrollments',
      'payment_status',
    );

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE bundle_payment_status AS ENUM (
          'NOT_REQUIRED',
          'PENDING',
          'PAID',
          'CANCELLED'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      ALTER TABLE bundles
        ADD COLUMN IF NOT EXISTS price_amount numeric(10,2),
        ADD COLUMN IF NOT EXISTS price_currency varchar(3) NOT NULL DEFAULT 'EGP';

      DO $$ BEGIN
        ALTER TABLE bundles
          ADD CONSTRAINT ck_bundle_price_positive
            CHECK (price_amount IS NULL OR price_amount > 0);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        ALTER TABLE bundles
          ADD CONSTRAINT ck_bundle_price_currency
            CHECK (price_currency ~ '^[A-Z]{3}$');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      ALTER TABLE bundle_enrollments
        ADD COLUMN IF NOT EXISTS payment_status bundle_payment_status NOT NULL DEFAULT 'NOT_REQUIRED',
        ADD COLUMN IF NOT EXISTS paid_at timestamp,
        ADD COLUMN IF NOT EXISTS payment_reference varchar(200);

      CREATE INDEX IF NOT EXISTS idx_bundle_enrollment_payment_status
        ON bundle_enrollments(bundle_id, payment_status);
    `);

    // Only migrate legacy paid-bundle enrollments when this migration introduced
    // the payment column. A pre-existing column means the schema/data was already
    // reconciled by an earlier SQL deployment and must not be revoked again.
    if (!paymentColumnAlreadyExisted) {
      await queryRunner.query(`
        UPDATE bundle_enrollments enrollment
        SET payment_status = 'PENDING',
            status = 'REVOKED',
            paid_at = NULL,
            payment_reference = NULL
        FROM bundles bundle
        WHERE bundle.id = enrollment.bundle_id
          AND bundle.is_free = FALSE;
      `);
    }
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
