import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGlobalSubscriptionPlans1970000000000 implements MigrationInterface {
  name = 'AddGlobalSubscriptionPlans1970000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE unlock_reason AS ENUM ('purchase', 'plan_access');

      CREATE TABLE subscription_plans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        key varchar(30) NOT NULL,
        label varchar(100) NOT NULL,
        price_amount numeric(10,2),
        price_currency varchar(3) NOT NULL DEFAULT 'EGP',
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_subscription_plans_key UNIQUE (key),
        CONSTRAINT ck_subscription_plans_price CHECK (price_amount IS NULL OR price_amount > 0),
        CONSTRAINT ck_subscription_plans_currency CHECK (price_currency ~ '^[A-Z]{3}$')
      );

      INSERT INTO subscription_plans (key, label, price_amount) VALUES
        ('free', 'Free', NULL),
        ('normal', 'Normal', NULL),
        ('first_5_weeks', 'First 5 Weeks', NULL),
        ('last_5_weeks', 'Last 5 Weeks', NULL),
        ('max', 'Max', NULL);

      CREATE TABLE bundle_allowed_plans (
        bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
        plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (bundle_id, plan_id)
      );
      CREATE INDEX idx_bundle_allowed_plans_plan ON bundle_allowed_plans(plan_id);

      CREATE TABLE user_plan_subscriptions (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
        started_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_user_plan_subscriptions_plan ON user_plan_subscriptions(plan_id);

      CREATE TABLE user_bundle_unlocks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE RESTRICT,
        unlocked_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        unlock_reason unlock_reason NOT NULL,
        CONSTRAINT uq_user_bundle_unlocks UNIQUE (user_id, bundle_id)
      );
      CREATE INDEX idx_user_bundle_unlocks_bundle ON user_bundle_unlocks(bundle_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS user_bundle_unlocks;
      DROP TABLE IF EXISTS user_plan_subscriptions;
      DROP TABLE IF EXISTS bundle_allowed_plans;
      DROP TABLE IF EXISTS subscription_plans;
      DROP TYPE IF EXISTS unlock_reason;
    `);
  }
}
