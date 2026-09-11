import { ConflictException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Bundle } from '../../common/entities/bundle.entity';
import { BundleAllowedPlan } from '../../common/entities/bundle-allowed-plan.entity';
import { BundleInstructor } from '../../common/entities/bundle-instructor.entity';
import { PlanPurchase, PlanPaymentMethod, PlanPurchaseStatus } from '../../common/entities/plan-purchase.entity';
import { SubscriptionPlan, SubscriptionPlanKey } from '../../common/entities/subscription-plan.entity';
import { UnlockReason, UserBundleUnlock } from '../../common/entities/user-bundle-unlock.entity';
import { SubscriptionsService } from './subscriptions.service';

const bundleId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

const planIds: Record<SubscriptionPlanKey, string> = {
  [SubscriptionPlanKey.FREE]: 'aaaaaaaa-0000-4000-8000-000000000001',
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
    durationDays: key === SubscriptionPlanKey.FREE ? null : 35,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** In-memory stand-ins for the repositories the service depends on. Mirrors the lightweight
 * jest-mock style already used elsewhere, but stateful enough to model find/findOne/exists/save
 * across the required scenarios. */
function build() {
  const plans = seededPlans();
  const allowedPlans: BundleAllowedPlan[] = [];
  const planPurchases: PlanPurchase[] = [];
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
    find: jest.fn(async ({ where }: { where: { bundleId: string } }) =>
      allowedPlans.filter((item) => item.bundleId === where.bundleId)),
  } as unknown as Repository<BundleAllowedPlan>;

  const purchasesRepo = {
    find: jest.fn(async ({ where }: { where: { userId: string; status: PlanPurchaseStatus } }) =>
      planPurchases
        .filter((item) => item.userId === where.userId && item.status === where.status)
        .map((item) => ({ ...item, plan: plans.find((plan) => plan.id === item.planId) }))),
  } as unknown as Repository<PlanPurchase>;

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

  /** Adds a PAID PlanPurchase whose active window is relative to now (defaults: already started,
   * not yet ended). Pass a negative `startedDaysAgo`/negative `endsInDays` to model past windows. */
  function grantPaidPlan(planKey: SubscriptionPlanKey, options: { startedDaysAgo?: number; endsInDays?: number } = {}) {
    const now = new Date();
    planPurchases.push({
      id: `purchase-${planPurchases.length + 1}`,
      userId,
      planId: planIds[planKey],
      status: PlanPurchaseStatus.PAID,
      paymentMethod: PlanPaymentMethod.CARD,
      amountPaid: '100.00',
      currency: 'EGP',
      startsAt: addDays(now, -(options.startedDaysAgo ?? 1)),
      endsAt: addDays(now, options.endsInDays ?? 34),
    } as PlanPurchase);
  }

  const service = new SubscriptionsService(
    plansRepo,
    allowedPlansRepo,
    purchasesRepo,
    unlocksRepo,
    bundlesRepo,
    bundleInstructorsRepo,
    {} as DataSource,
  );

  return { service, allow, grantPaidPlan, unlocks };
}

describe('SubscriptionsService access resolution', () => {
  it('a Free-plan user without purchase cannot access a Max-only bundle', async () => {
    const { service, allow } = build();
    allow(SubscriptionPlanKey.MAX);

    expect(await service.canAccessBundle(userId, bundleId)).toBe(false);
    const opened = await service.openBundle(userId, bundleId);
    expect(opened.accessible).toBe(false);
  });

  it('a user who accessed a bundle on one active plan keeps access after that plan later expires', async () => {
    const { service, allow, grantPaidPlan, unlocks } = build();
    allow(SubscriptionPlanKey.FIRST_5_WEEKS);
    grantPaidPlan(SubscriptionPlanKey.FIRST_5_WEEKS);

    const firstOpen = await service.openBundle(userId, bundleId);
    expect(firstOpen.accessible).toBe(true);
    expect(unlocks).toHaveLength(1);
    expect(unlocks[0].unlockReason).toBe(UnlockReason.PLAN_ACCESS);

    // The permanent unlock row is independent of plan state from here on.
    expect(await service.canAccessBundle(userId, bundleId)).toBe(true);
    const secondOpen = await service.openBundle(userId, bundleId);
    expect(secondOpen.accessible).toBe(true);
    expect(unlocks).toHaveLength(1); // no duplicate row written on re-open
  });

  it('a user with two overlapping active plans gets access to bundles allowed by either one', async () => {
    const { service, allow, grantPaidPlan } = build();
    allow(SubscriptionPlanKey.LAST_5_WEEKS); // this bundle only allows Last 5 Weeks
    grantPaidPlan(SubscriptionPlanKey.FIRST_5_WEEKS); // user actually holds First 5 Weeks...
    grantPaidPlan(SubscriptionPlanKey.LAST_5_WEEKS); // ...and Last 5 Weeks, at the same time

    expect(await service.canAccessBundle(userId, bundleId)).toBe(true);
  });

  it('an expired PlanPurchase stays locked and direct browser purchase cannot create an unlock', async () => {
    const { service, allow, grantPaidPlan, unlocks } = build();
    allow(SubscriptionPlanKey.FIRST_5_WEEKS);
    grantPaidPlan(SubscriptionPlanKey.FIRST_5_WEEKS, {
      startedDaysAgo: 40,
      endsInDays: -5,
    });

    expect(await service.canAccessBundle(userId, bundleId)).toBe(false);
    await expect(service.purchaseBundle(userId, bundleId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(unlocks).toHaveLength(0);
    expect(await service.canAccessBundle(userId, bundleId)).toBe(false);
  });

  it('canAccessBundle never writes an unlock row — only openBundle/purchaseBundle do', async () => {
    const { service, allow, grantPaidPlan, unlocks } = build();
    allow(SubscriptionPlanKey.MAX);
    grantPaidPlan(SubscriptionPlanKey.MAX);

    expect(await service.canAccessBundle(userId, bundleId)).toBe(true);
    expect(unlocks).toHaveLength(0);
  });
});
