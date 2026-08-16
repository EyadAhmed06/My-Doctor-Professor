import { DataSource, Repository } from 'typeorm';
import { Bundle } from '../../common/entities/bundle.entity';
import { BundleAllowedPlan } from '../../common/entities/bundle-allowed-plan.entity';
import { BundleInstructor } from '../../common/entities/bundle-instructor.entity';
import { SubscriptionPlan, SubscriptionPlanKey } from '../../common/entities/subscription-plan.entity';
import { UnlockReason, UserBundleUnlock } from '../../common/entities/user-bundle-unlock.entity';
import { UserPlanSubscription } from '../../common/entities/user-plan-subscription.entity';
import { SubscriptionsService } from './subscriptions.service';

const bundleId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

const planIds: Record<SubscriptionPlanKey, string> = {
  [SubscriptionPlanKey.FREE]: 'aaaaaaaa-0000-4000-8000-000000000001',
  [SubscriptionPlanKey.NORMAL]: 'aaaaaaaa-0000-4000-8000-000000000002',
  [SubscriptionPlanKey.FIRST_5_WEEKS]: 'aaaaaaaa-0000-4000-8000-000000000003',
  [SubscriptionPlanKey.LAST_5_WEEKS]: 'aaaaaaaa-0000-4000-8000-000000000004',
  [SubscriptionPlanKey.MAX]: 'aaaaaaaa-0000-4000-8000-000000000005',
};

function seededPlans(): SubscriptionPlan[] {
  return (Object.keys(planIds) as SubscriptionPlanKey[]).map((key) => ({
    id: planIds[key],
    key,
    label: key,
    priceAmount: null,
    priceCurrency: 'EGP',
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

/** In-memory stand-ins for the repositories the service depends on. Mirrors the lightweight
 * jest-mock style already used in bundles.service.spec.ts, but stateful enough to model
 * find/findOne/exists/save across the three required scenarios. */
function build() {
  const plans = seededPlans();
  const allowedPlans: BundleAllowedPlan[] = [];
  const subscriptions = new Map<string, UserPlanSubscription>();
  const unlocks: UserBundleUnlock[] = [];
  const bundle = { id: bundleId, title: 'Cardiology' } as Bundle;

  const plansRepo = {
    find: jest.fn(async () => plans),
    findOne: jest.fn(async ({ where }: { where: Partial<SubscriptionPlan> }) => {
      if (where.id) return plans.find((item) => item.id === where.id) ?? null;
      if (where.key) return plans.find((item) => item.key === where.key) ?? null;
      return null;
    }),
  } as unknown as Repository<SubscriptionPlan>;

  const allowedPlansRepo = {
    exists: jest.fn(async ({ where }: { where: { bundleId: string; planId: string } }) =>
      allowedPlans.some((item) => item.bundleId === where.bundleId && item.planId === where.planId)),
    find: jest.fn(async ({ where }: { where: { bundleId: string } }) =>
      allowedPlans.filter((item) => item.bundleId === where.bundleId)),
  } as unknown as Repository<BundleAllowedPlan>;

  const subscriptionsRepo = {
    findOne: jest.fn(async ({ where }: { where: { userId: string } }) => {
      const subscription = subscriptions.get(where.userId);
      if (!subscription) return null;
      return { ...subscription, plan: plans.find((item) => item.id === subscription.planId) } as UserPlanSubscription;
    }),
    create: jest.fn((value: Partial<UserPlanSubscription>) => value as UserPlanSubscription),
    save: jest.fn(async (value: UserPlanSubscription) => {
      subscriptions.set(value.userId, value);
      return value;
    }),
  } as unknown as Repository<UserPlanSubscription>;

  const unlocksRepo = {
    findOne: jest.fn(async ({ where }: { where: { userId: string; bundleId: string } }) =>
      unlocks.find((item) => item.userId === where.userId && item.bundleId === where.bundleId) ?? null),
    create: jest.fn((value: Partial<UserBundleUnlock>) => value as UserBundleUnlock),
    save: jest.fn(async (value: UserBundleUnlock) => {
      unlocks.push(value);
      return value;
    }),
  } as unknown as Repository<UserBundleUnlock>;

  const bundlesRepo = {
    findOne: jest.fn(async () => bundle),
    find: jest.fn(async () => [bundle]),
  } as unknown as Repository<Bundle>;

  const bundleInstructorsRepo = {
    exists: jest.fn(async () => false),
  } as unknown as Repository<BundleInstructor>;

  function allow(planKey: SubscriptionPlanKey) {
    allowedPlans.push({ bundleId, planId: planIds[planKey] } as BundleAllowedPlan);
  }

  function setPlan(key: SubscriptionPlanKey) {
    subscriptions.set(userId, { userId, planId: planIds[key] } as UserPlanSubscription);
  }

  const service = new SubscriptionsService(
    plansRepo,
    allowedPlansRepo,
    subscriptionsRepo,
    unlocksRepo,
    bundlesRepo,
    bundleInstructorsRepo,
    {} as DataSource,
  );

  return { service, allow, setPlan, unlocks };
}

describe('SubscriptionsService access resolution', () => {
  it('a Free-plan user without purchase cannot access a Max-only bundle', async () => {
    const { service, allow, setPlan } = build();
    allow(SubscriptionPlanKey.MAX);
    setPlan(SubscriptionPlanKey.FREE);

    expect(await service.canAccessBundle(userId, bundleId)).toBe(false);
    const opened = await service.openBundle(userId, bundleId);
    expect(opened.accessible).toBe(false);
  });

  it('a user who accessed a bundle on one plan keeps access after switching plans', async () => {
    const { service, allow, setPlan, unlocks } = build();
    allow(SubscriptionPlanKey.FIRST_5_WEEKS);
    setPlan(SubscriptionPlanKey.FIRST_5_WEEKS);

    const firstOpen = await service.openBundle(userId, bundleId);
    expect(firstOpen.accessible).toBe(true);
    expect(unlocks).toHaveLength(1);
    expect(unlocks[0].unlockReason).toBe(UnlockReason.PLAN_ACCESS);

    // Switch to a plan that would NOT independently grant access to this bundle.
    setPlan(SubscriptionPlanKey.NORMAL);

    expect(await service.canAccessBundle(userId, bundleId)).toBe(true);
    const secondOpen = await service.openBundle(userId, bundleId);
    expect(secondOpen.accessible).toBe(true);
    expect(unlocks).toHaveLength(1); // no duplicate row written on re-open
  });

  it('purchasing a bundle grants immediate, permanent access regardless of plan', async () => {
    const { service, setPlan, unlocks } = build();
    setPlan(SubscriptionPlanKey.FREE); // no allowed_plans grant this bundle to Free at all

    expect(await service.canAccessBundle(userId, bundleId)).toBe(false);

    const purchase = await service.purchaseBundle(userId, bundleId);
    expect(purchase.unlockReason).toBe(UnlockReason.PURCHASE);
    expect(unlocks).toHaveLength(1);

    expect(await service.canAccessBundle(userId, bundleId)).toBe(true);

    // Switching plans afterwards changes nothing — access came from the permanent unlock row.
    setPlan(SubscriptionPlanKey.NORMAL);
    expect(await service.canAccessBundle(userId, bundleId)).toBe(true);

    // Purchasing again is idempotent — no duplicate row, no reason change.
    await service.purchaseBundle(userId, bundleId);
    expect(unlocks).toHaveLength(1);
  });

  it('canAccessBundle never writes an unlock row — only openBundle/purchaseBundle do', async () => {
    const { service, allow, setPlan, unlocks } = build();
    allow(SubscriptionPlanKey.MAX);
    setPlan(SubscriptionPlanKey.MAX);

    expect(await service.canAccessBundle(userId, bundleId)).toBe(true);
    expect(unlocks).toHaveLength(0);
  });
});
