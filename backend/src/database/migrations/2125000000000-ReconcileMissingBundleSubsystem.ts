import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repairs deployments whose migration ledger says the historical bundle/payment
 * migrations ran while the actual bundle tables are missing. This migration is
 * intentionally ordered between the flashcard week-scope migration (212...) and
 * bundle-aware flashcard distribution (213...), so the latter can safely create
 * its bundle foreign key.
 *
 * The repair is additive/idempotent: healthy databases keep their existing
 * tables/data, while a deployment with a missing bundle subsystem gets the
 * current schema contract recreated.
 */
export class ReconcileMissingBundleSubsystem2125000000000 implements MigrationInterface {
  name = 'ReconcileMissingBundleSubsystem2125000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const bundlesExist = await queryRunner.hasTable('bundles');
    const enrollmentExists = await queryRunner.hasTable('bundle_enrollments');
    const plansExist = await queryRunner.hasTable('subscription_plans');
    const purchasesExist = await queryRunner.hasTable('plan_purchases');

    // A healthy database already has the complete historical base layer. The
    // later migrations remain the source of truth for its schema/data.
    if (bundlesExist && enrollmentExists && plansExist && purchasesExist) return;

    await queryRunner.query(`
      DO $$ BEGIN CREATE TYPE bundle_status AS ENUM ('DRAFT','PUBLISHED','ARCHIVED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE bundle_access_mode AS ENUM ('MANUAL','CODE','PUBLIC','SUBSCRIPTION');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE bundle_enrollment_status AS ENUM ('ACTIVE','EXPIRED','REVOKED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE bundle_enrollment_source AS ENUM ('MANUAL','CODE','PUBLIC','SUBSCRIPTION');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE bundle_payment_status AS ENUM ('NOT_REQUIRED','PENDING','PAID','CANCELLED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE bundle_plan AS ENUM ('FIRST','FINAL');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE bundle_plan_tier AS ENUM ('MCQ','MCQ_ESSAY');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE unlock_reason AS ENUM ('purchase','plan_access');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE plan_purchase_status AS ENUM ('pending','paid','failed','expired');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE plan_payment_method AS ENUM ('card','fawry','promocode');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE TYPE promo_discount_type AS ENUM ('percent','fixed','free');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bundles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title varchar(180) NOT NULL,
        slug varchar(180) NOT NULL,
        description text,
        academic_year integer NOT NULL,
        status bundle_status NOT NULL DEFAULT 'DRAFT',
        access_mode bundle_access_mode NOT NULL DEFAULT 'PUBLIC',
        is_free boolean NOT NULL DEFAULT TRUE,
        price_amount numeric(10,2),
        price_currency varchar(3) NOT NULL DEFAULT 'EGP',
        first_plan_enabled boolean NOT NULL DEFAULT FALSE,
        first_plan_price_mcq numeric(10,2),
        first_plan_price_mcq_essay numeric(10,2),
        final_plan_enabled boolean NOT NULL DEFAULT FALSE,
        final_plan_price_mcq numeric(10,2),
        final_plan_price_mcq_essay numeric(10,2),
        enrollment_code_hash text,
        available_from timestamp,
        available_until timestamp,
        created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT ck_bundle_academic_year CHECK (academic_year BETWEEN 1 AND 12),
        CONSTRAINT ck_bundle_availability CHECK (available_until IS NULL OR available_from IS NULL OR available_until > available_from),
        CONSTRAINT ck_bundle_price_positive CHECK (price_amount IS NULL OR price_amount > 0),
        CONSTRAINT ck_bundle_price_currency CHECK (price_currency ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_bundle_first_plan_price CHECK (first_plan_price_mcq IS NULL OR first_plan_price_mcq > 0),
        CONSTRAINT ck_bundle_first_plan_essay_price CHECK (first_plan_price_mcq_essay IS NULL OR first_plan_price_mcq_essay > 0),
        CONSTRAINT ck_bundle_final_plan_price CHECK (final_plan_price_mcq IS NULL OR final_plan_price_mcq > 0),
        CONSTRAINT ck_bundle_final_plan_essay_price CHECK (final_plan_price_mcq_essay IS NULL OR final_plan_price_mcq_essay > 0)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_bundles_slug ON bundles(slug);
      CREATE INDEX IF NOT EXISTS idx_bundles_year_status ON bundles(academic_year,status);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bundle_courses (
        bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
        course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (bundle_id,course_id)
      );
      CREATE INDEX IF NOT EXISTS idx_bundle_courses_course ON bundle_courses(course_id);

      CREATE TABLE IF NOT EXISTS bundle_weeks (
        bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
        week_id uuid NOT NULL REFERENCES weeks(id) ON DELETE RESTRICT,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (bundle_id,week_id)
      );
      CREATE INDEX IF NOT EXISTS idx_bundle_weeks_week ON bundle_weeks(week_id);

      CREATE TABLE IF NOT EXISTS bundle_tests (
        bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
        test_id uuid NOT NULL REFERENCES tests(id) ON DELETE RESTRICT,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (bundle_id,test_id)
      );
      CREATE INDEX IF NOT EXISTS idx_bundle_tests_test ON bundle_tests(test_id);

      CREATE TABLE IF NOT EXISTS bundle_instructors (
        bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
        instructor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (bundle_id,instructor_id)
      );
      CREATE INDEX IF NOT EXISTS idx_bundle_instructors_user ON bundle_instructors(instructor_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bundle_enrollments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE RESTRICT,
        student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        status bundle_enrollment_status NOT NULL DEFAULT 'ACTIVE',
        source bundle_enrollment_source NOT NULL,
        payment_status bundle_payment_status NOT NULL DEFAULT 'NOT_REQUIRED',
        paid_at timestamp,
        payment_reference varchar(200),
        starts_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at timestamp,
        granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_bundle_student UNIQUE(bundle_id,student_id),
        CONSTRAINT ck_bundle_enrollment_expiry CHECK (expires_at IS NULL OR expires_at > starts_at)
      );
      CREATE INDEX IF NOT EXISTS idx_bundle_enrollment_student_status ON bundle_enrollments(student_id,status);
      CREATE INDEX IF NOT EXISTS idx_bundle_enrollment_payment_status ON bundle_enrollments(bundle_id,payment_status);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bundle_plan_weeks (
        bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
        plan bundle_plan NOT NULL,
        week_id uuid NOT NULL REFERENCES weeks(id) ON DELETE RESTRICT,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (bundle_id,plan,week_id)
      );
      CREATE INDEX IF NOT EXISTS idx_bundle_plan_weeks_week ON bundle_plan_weeks(week_id);

      CREATE TABLE IF NOT EXISTS bundle_plan_grants (
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
        CONSTRAINT uq_bundle_plan_student UNIQUE(bundle_id,student_id,plan)
      );
      CREATE INDEX IF NOT EXISTS idx_bundle_plan_grants_student_status ON bundle_plan_grants(student_id,status);
      CREATE INDEX IF NOT EXISTS idx_bundle_plan_grants_payment_status ON bundle_plan_grants(bundle_id,payment_status);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        key varchar(30) NOT NULL,
        label varchar(100) NOT NULL,
        price_amount numeric(10,2),
        price_currency varchar(3) NOT NULL DEFAULT 'EGP',
        duration_days integer,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_subscription_plans_key UNIQUE(key),
        CONSTRAINT ck_subscription_plans_price CHECK (price_amount IS NULL OR price_amount > 0),
        CONSTRAINT ck_subscription_plans_currency CHECK (price_currency ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_subscription_plans_duration CHECK (duration_days IS NULL OR duration_days > 0)
      );

      INSERT INTO subscription_plans (key,label,price_amount,price_currency,duration_days) VALUES
        ('free','Free',NULL,'EGP',NULL),
        ('first_5_weeks','First 5 Weeks',NULL,'EGP',35),
        ('last_5_weeks','Last 5 Weeks',NULL,'EGP',35),
        ('max','Max',NULL,'EGP',30)
      ON CONFLICT (key) DO NOTHING;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bundle_allowed_plans (
        bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
        plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (bundle_id,plan_id)
      );
      CREATE INDEX IF NOT EXISTS idx_bundle_allowed_plans_plan ON bundle_allowed_plans(plan_id);

      CREATE TABLE IF NOT EXISTS user_bundle_unlocks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE RESTRICT,
        unlocked_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        unlock_reason unlock_reason NOT NULL,
        CONSTRAINT uq_user_bundle_unlocks UNIQUE(user_id,bundle_id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_bundle_unlocks_bundle ON user_bundle_unlocks(bundle_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS promo_codes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(50) NOT NULL,
        discount_type promo_discount_type NOT NULL,
        discount_value numeric(10,2) NOT NULL DEFAULT 0,
        max_uses integer,
        used_count integer NOT NULL DEFAULT 0,
        expires_at timestamp,
        is_active boolean NOT NULL DEFAULT TRUE,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_promo_codes_code UNIQUE(code),
        CONSTRAINT ck_promo_codes_max_uses CHECK (max_uses IS NULL OR max_uses > 0),
        CONSTRAINT ck_promo_codes_used_count CHECK (used_count >= 0),
        CONSTRAINT ck_promo_codes_discount_value CHECK (discount_value >= 0)
      );

      CREATE TABLE IF NOT EXISTS promo_code_plans (
        promo_code_id uuid NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
        plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (promo_code_id,plan_id)
      );
      CREATE INDEX IF NOT EXISTS idx_promo_code_plans_plan ON promo_code_plans(plan_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS plan_purchases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
        status plan_purchase_status NOT NULL DEFAULT 'pending',
        payment_method plan_payment_method NOT NULL,
        amount_paid numeric(10,2) NOT NULL DEFAULT 0,
        currency varchar(3) NOT NULL DEFAULT 'EGP',
        provider varchar(50),
        provider_reference varchar(200),
        provider_order_id varchar(100),
        provider_transaction_id varchar(100),
        promo_code_id uuid REFERENCES promo_codes(id) ON DELETE SET NULL,
        starts_at timestamp,
        ends_at timestamp,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT ck_plan_purchases_amount CHECK (amount_paid >= 0),
        CONSTRAINT ck_plan_purchases_currency CHECK (currency ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_plan_purchases_period CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
      );
      CREATE INDEX IF NOT EXISTS idx_plan_purchases_user_status ON plan_purchases(user_id,status);
      CREATE INDEX IF NOT EXISTS idx_plan_purchases_active_window ON plan_purchases(user_id,status,starts_at,ends_at);
      CREATE INDEX IF NOT EXISTS idx_plan_purchases_provider_reference ON plan_purchases(provider_reference);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_purchases_provider_order
        ON plan_purchases(provider,provider_order_id)
        WHERE provider IS NOT NULL AND provider_order_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_purchases_provider_transaction
        ON plan_purchases(provider,provider_transaction_id)
        WHERE provider IS NOT NULL AND provider_transaction_id IS NOT NULL;
    `);
  }

  public async down(): Promise<void> {
    // Forward-only repair. Dropping a reconstructed access/payment subsystem is
    // intentionally not supported because it could destroy newly-created data.
  }
}
