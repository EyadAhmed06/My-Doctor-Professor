import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Bundle, BundleStatus } from '../../common/entities/bundle.entity';
import { BundleAllowedPlan } from '../../common/entities/bundle-allowed-plan.entity';
import { BundleInstructor } from '../../common/entities/bundle-instructor.entity';
import { SubscriptionPlan, SubscriptionPlanKey } from '../../common/entities/subscription-plan.entity';
import { UnlockReason, UserBundleUnlock } from '../../common/entities/user-bundle-unlock.entity';
import { UserPlanSubscription } from '../../common/entities/user-plan-subscription.entity';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { UpdatePlanDto } from './dtos/subscription.dto';

type AccessResolution =
  | { accessible: true; alreadyUnlocked: true; reason?: undefined }
  | { accessible: true; alreadyUnlocked: false; reason: UnlockReason.PLAN_ACCESS }
  | { accessible: false; alreadyUnlocked: false; reason?: undefined };

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(SubscriptionPlan) private readonly plans: Repository<SubscriptionPlan>,
    @InjectRepository(BundleAllowedPlan) private readonly allowedPlans: Repository<BundleAllowedPlan>,
    @InjectRepository(UserPlanSubscription) private readonly subscriptions: Repository<UserPlanSubscription>,
    @InjectRepository(UserBundleUnlock) private readonly unlocks: Repository<UserBundleUnlock>,
    @InjectRepository(Bundle) private readonly bundles: Repository<Bundle>,
    @InjectRepository(BundleInstructor) private readonly bundleInstructors: Repository<BundleInstructor>,
    private readonly dataSource: DataSource,
  ) {}

  listPlans() {
    return this.plans.find({ order: { createdAt: 'ASC' } });
  }

  async updatePlan(planId: string, dto: UpdatePlanDto) {
    const plan = await this.plans.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    if (dto.label !== undefined) plan.label = dto.label.trim();
    if (dto.price_amount !== undefined) plan.priceAmount = dto.price_amount === null ? null : dto.price_amount.toFixed(2);
    if (dto.price_currency !== undefined) plan.priceCurrency = dto.price_currency.toUpperCase();
    return this.plans.save(plan);
  }

  /** The user's current active plan. Falls back to "free" if no row exists yet (defensive — every
   * account-creation path writes one, but this keeps access resolution correct even if that ever drifts). */
  async myPlan(userId: string): Promise<SubscriptionPlan> {
    const subscription = await this.subscriptions.findOne({ where: { userId }, relations: { plan: true } });
    if (subscription) return subscription.plan;
    return this.requirePlanByKey(SubscriptionPlanKey.FREE);
  }

  async changePlan(userId: string, planId: string): Promise<SubscriptionPlan> {
    const plan = await this.plans.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    let subscription = await this.subscriptions.findOne({ where: { userId } });
    if (!subscription) subscription = this.subscriptions.create({ userId, planId });
    else subscription.planId = planId;
    await this.subscriptions.save(subscription);
    return plan;
  }

  async allowedPlansFor(bundleId: string) {
    await this.requireBundle(bundleId);
    return this.allowedPlans.find({ where: { bundleId }, relations: { plan: true }, order: { plan: { createdAt: 'ASC' } } });
  }

  async setAllowedPlans(bundleId: string, actor: AuthenticatedUser, planIds: string[]) {
    await this.assertManager(bundleId, actor);
    const uniqueIds = [...new Set(planIds)];
    if (uniqueIds.length) {
      const found = await this.plans.count({ where: { id: In(uniqueIds) } });
      if (found !== uniqueIds.length) throw new BadRequestException('One or more plan ids are invalid');
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(BundleAllowedPlan, { bundleId });
      if (uniqueIds.length) {
        await manager.save(BundleAllowedPlan, uniqueIds.map((planId) => manager.create(BundleAllowedPlan, { bundleId, planId })));
      }
    });
    return this.allowedPlansFor(bundleId);
  }

  /** Catalog listing: every published bundle is always visible; only the `accessible` flag differs per user. */
  async listBundlesForStudent(userId: string) {
    const bundles = await this.bundles.find({ where: { status: BundleStatus.PUBLISHED }, order: { createdAt: 'DESC' } });
    return Promise.all(bundles.map(async (bundle) => ({
      ...bundle,
      accessible: await this.canAccessBundle(userId, bundle.id),
    })));
  }

  /** Single reusable access check. Pure read — never writes an unlock row. Use this everywhere content
   * gating needs a yes/no answer (catalog badges, guards, previews). */
  async canAccessBundle(userId: string, bundleId: string): Promise<boolean> {
    const result = await this.resolveAccess(userId, bundleId);
    return result.accessible;
  }

  /** Call this — and only this — from the "open bundle" / "view bundle content" endpoint. Runs the same
   * resolution as canAccessBundle, and lazily persists the permanent unlock row the moment access is
   * actually exercised via plan membership. Never call this from a plan-change endpoint. */
  async openBundle(userId: string, bundleId: string): Promise<{ accessible: boolean }> {
    await this.requireBundle(bundleId);
    const result = await this.resolveAccess(userId, bundleId);
    if (result.accessible && !result.alreadyUnlocked) {
      await this.unlocks.save(this.unlocks.create({ userId, bundleId, unlockReason: result.reason }));
    }
    return { accessible: result.accessible };
  }

  /** Direct purchase: always grants immediate, permanent access regardless of plan. Idempotent — purchasing
   * a bundle the user already has access to (any reason) is a no-op, since access is already forever. */
  async purchaseBundle(userId: string, bundleId: string): Promise<UserBundleUnlock> {
    await this.requireBundle(bundleId);
    const existing = await this.unlocks.findOne({ where: { userId, bundleId } });
    if (existing) return existing;
    return this.unlocks.save(this.unlocks.create({ userId, bundleId, unlockReason: UnlockReason.PURCHASE }));
  }

  private async resolveAccess(userId: string, bundleId: string): Promise<AccessResolution> {
    const existing = await this.unlocks.findOne({ where: { userId, bundleId } });
    if (existing) return { accessible: true, alreadyUnlocked: true };

    const plan = await this.myPlan(userId);
    if (plan.key === SubscriptionPlanKey.MAX) {
      return { accessible: true, alreadyUnlocked: false, reason: UnlockReason.PLAN_ACCESS };
    }

    const allowed = await this.allowedPlans.exists({ where: { bundleId, planId: plan.id } });
    if (allowed) return { accessible: true, alreadyUnlocked: false, reason: UnlockReason.PLAN_ACCESS };

    return { accessible: false, alreadyUnlocked: false };
  }

  private async assertManager(bundleId: string, actor: AuthenticatedUser) {
    await this.requireBundle(bundleId);
    if (actor.role === UserRole.SYSTEM_ADMIN) return;
    if (actor.role !== UserRole.INSTRUCTOR || !await this.bundleInstructors.exists({
      where: { bundleId, instructorId: actor.userId },
    })) {
      throw new ForbiddenException('You do not manage this bundle');
    }
  }

  private async requireBundle(bundleId: string) {
    const bundle = await this.bundles.findOne({ where: { id: bundleId } });
    if (!bundle) throw new NotFoundException('Bundle not found');
    return bundle;
  }

  private async requirePlanByKey(key: SubscriptionPlanKey) {
    const plan = await this.plans.findOne({ where: { key } });
    if (!plan) throw new NotFoundException(`Subscription plan "${key}" is not seeded`);
    return plan;
  }
}
