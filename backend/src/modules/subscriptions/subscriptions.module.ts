import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bundle } from '../../common/entities/bundle.entity';
import { BundleAllowedPlan } from '../../common/entities/bundle-allowed-plan.entity';
import { BundleInstructor } from '../../common/entities/bundle-instructor.entity';
import { PlanPurchase } from '../../common/entities/plan-purchase.entity';
import { PromoCodePlan } from '../../common/entities/promo-code-plan.entity';
import { PromoCode } from '../../common/entities/promo-code.entity';
import { SubscriptionPlan } from '../../common/entities/subscription-plan.entity';
import { UserBundleUnlock } from '../../common/entities/user-bundle-unlock.entity';
import { User } from '../users/entities/user.entity';
import { PaymobWebhookController } from './paymob-webhook.controller';
import { PaymobService } from './paymob.service';
import { PlansController, UserPlansController } from './plans.controller';
import { PlanPurchasesService } from './plan-purchases.service';
import { PromoCodesController } from './promo-codes.controller';
import { PromoCodesService } from './promo-codes.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [TypeOrmModule.forFeature([
    SubscriptionPlan,
    BundleAllowedPlan,
    PlanPurchase,
    PromoCode,
    PromoCodePlan,
    UserBundleUnlock,
    Bundle,
    BundleInstructor,
    User,
  ])],
  controllers: [
    SubscriptionsController,
    PlansController,
    UserPlansController,
    PaymobWebhookController,
    PromoCodesController,
  ],
  providers: [SubscriptionsService, PlanPurchasesService, PromoCodesService, PaymobService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
