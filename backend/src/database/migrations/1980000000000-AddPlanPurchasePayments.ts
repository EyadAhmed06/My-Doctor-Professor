import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces the single "current plan" concept (user_plan_subscriptions) with parallel,
 * time-boxed PlanPurchase rows: plans are one-time payments per period, not recurring
 * subscriptions, and a user can hold several active plans at once. Free stays a plan
 * users are never charged for and is treated as implicitly active for everyone — no
 * PlanPurchase row is ever created for it (see SubscriptionsService.getActivePlanIds).
 * Also adds the Paymob (card + Fawry) checkout layer and internal promo codes.
 */
export class AddPlanPurchasePayments1980000000000 implements MigrationInterface {
  name = 'AddPlanPurchasePayments1980000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscription_plans ADD COLUMN duration_days integer;
      ALTER TABLE subscription_plans ADD CONSTRAINT ck_subscription_plans_duration CHECK (duration_days IS NULL OR duration_days > 0);
      UPDATE subscription_plans SET duration_days = 35 WHERE key IN ('first_5_weeks', 'last_5_weeks');
      UPDATE subscription_plans SET duration_days = 30 WHERE key = 'max';

      DROP TABLE IF EXISTS user_plan_subscriptions;

      CREATE TYPE plan_purchase_status AS ENUM ('pending', 'paid', 'failed', 'expired');
      CREATE TYPE plan_payment_method AS ENUM ('card', 'fawry', 'promocode');
      CREATE TYPE promo_discount_type AS ENUM ('percent', 'fixed', 'free');

      CREATE TABLE promo_codes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(50) NOT NULL,
        discount_type promo_discount_type NOT NULL,
        discount_value numeric(10,2) NOT NULL DEFAULT 0,
        max_uses integer,
        used_count integer NOT NULL DEFAULT 0,
        expires_at timestamp,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_promo_codes_code UNIQUE (code),
        CONSTRAINT ck_promo_codes_max_uses CHECK (max_uses IS NULL OR max_uses > 0),
        CONSTRAINT ck_promo_codes_used_count CHECK (used_count >= 0),
        CONSTRAINT ck_promo_codes_discount_value CHECK (discount_value >= 0)
      );

      CREATE TABLE promo_code_plans (
        promo_code_id uuid NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
        plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (promo_code_id, plan_id)
      );
      CREATE INDEX idx_promo_code_plans_plan ON promo_code_plans(plan_id);

      CREATE TABLE plan_purchases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
        status plan_purchase_status NOT NULL DEFAULT 'pending',
        payment_method plan_payment_method NOT NULL,
        amount_paid numeric(10,2) NOT NULL DEFAULT 0,
        currency varchar(3) NOT NULL DEFAULT 'EGP',
        provider varchar(50),
        provider_reference varchar(200),
        promo_code_id uuid REFERENCES promo_codes(id) ON DELETE SET NULL,
        starts_at timestamp,
        ends_at timestamp,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT ck_plan_purchases_amount CHECK (amount_paid >= 0),
        CONSTRAINT ck_plan_purchases_currency CHECK (currency ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_plan_purchases_period CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
      );
      CREATE INDEX idx_plan_purchases_user_status ON plan_purchases(user_id, status);
      CREATE INDEX idx_plan_purchases_active_window ON plan_purchases(user_id, status, starts_at, ends_at);
      CREATE INDEX idx_plan_purchases_provider_reference ON plan_purchases(provider_reference);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS plan_purchases;
      DROP TABLE IF EXISTS promo_code_plans;
      DROP TABLE IF EXISTS promo_codes;
      DROP TYPE IF EXISTS promo_discount_type;
      DROP TYPE IF EXISTS plan_payment_method;
      DROP TYPE IF EXISTS plan_purchase_status;

      CREATE TABLE user_plan_subscriptions (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
        started_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_user_plan_subscriptions_plan ON user_plan_subscriptions(plan_id);

      ALTER TABLE subscription_plans DROP CONSTRAINT IF EXISTS ck_subscription_plans_duration;
      ALTER TABLE subscription_plans DROP COLUMN IF EXISTS duration_days;
    `);
  }
}
