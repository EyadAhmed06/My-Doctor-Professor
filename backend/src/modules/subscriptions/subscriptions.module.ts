import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bundle } from '../../common/entities/bundle.entity';
import { BundleAllowedPlan } from '../../common/entities/bundle-allowed-plan.entity';
import { BundleInstructor } from '../../common/entities/bundle-instructor.entity';
import { SubscriptionPlan } from '../../common/entities/subscription-plan.entity';
import { UserBundleUnlock } from '../../common/entities/user-bundle-unlock.entity';
import { UserPlanSubscription } from '../../common/entities/user-plan-subscription.entity';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [TypeOrmModule.forFeature([
    SubscriptionPlan,
    BundleAllowedPlan,
    UserPlanSubscription,
    UserBundleUnlock,
    Bundle,
    BundleInstructor,
  ])],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
