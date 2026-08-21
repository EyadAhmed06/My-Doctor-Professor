-- =====================================================
-- Global subscription-plan bundle access layer.
-- Independent of the per-bundle First/Final plan tiers in 10n_bundles.sql —
-- this is a separate, parallel access path: platform-wide plans
-- (free/first_5_weeks/last_5_weeks/max) that instructors opt bundles
-- into via allowed_plans, with permanent lazy-unlock on first access.
--
-- Plans are one-time payments per period, not recurring subscriptions, and
-- plan periods run in parallel: buying a new plan never cancels or replaces
-- an existing active one, so a user can hold several active plans at once.
-- PlanPurchase is the source of truth for that; Free is never purchased —
-- it is treated as implicitly active for every user with no row at all.
--
-- Fresh installations apply this snapshot directly.
-- Legacy installations receive the same objects through TypeORM migrations.
-- =====================================================

CREATE TYPE unlock_reason AS ENUM ('purchase', 'plan_access');
CREATE TYPE plan_purchase_status AS ENUM ('pending', 'paid', 'failed', 'expired');
CREATE TYPE plan_payment_method AS ENUM ('card', 'fawry', 'promocode');
CREATE TYPE promo_discount_type AS ENUM ('percent', 'fixed', 'free');

CREATE TABLE subscription_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key varchar(30) NOT NULL,
    label varchar(100) NOT NULL,
    price_amount numeric(10,2),
    price_currency varchar(3) NOT NULL DEFAULT 'EGP',
    duration_days integer,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_subscription_plans_key UNIQUE (key),
    CONSTRAINT ck_subscription_plans_price CHECK (price_amount IS NULL OR price_amount > 0),
    CONSTRAINT ck_subscription_plans_currency CHECK (price_currency ~ '^[A-Z]{3}$'),
    CONSTRAINT ck_subscription_plans_duration CHECK (duration_days IS NULL OR duration_days > 0)
);

-- Free is never purchased (no duration — see module comment), so it has no duration_days.
INSERT INTO subscription_plans (key, label, price_amount, duration_days) VALUES
    ('free', 'Free', NULL, NULL),
    ('first_5_weeks', 'First 5 Weeks', NULL, 35),
    ('last_5_weeks', 'Last 5 Weeks', NULL, 35),
    ('max', 'Max', NULL, 30);

CREATE TABLE bundle_allowed_plans (
    bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
    plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (bundle_id, plan_id)
);
CREATE INDEX idx_bundle_allowed_plans_plan ON bundle_allowed_plans(plan_id);

CREATE TABLE user_bundle_unlocks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE RESTRICT,
    unlocked_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unlock_reason unlock_reason NOT NULL,
    CONSTRAINT uq_user_bundle_unlocks UNIQUE (user_id, bundle_id)
);
CREATE INDEX idx_user_bundle_unlocks_bundle ON user_bundle_unlocks(bundle_id);

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

-- No rows for a given promo_code_id = applies to every plan.
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
