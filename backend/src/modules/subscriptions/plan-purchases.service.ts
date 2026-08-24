import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PlanPaymentMethod, PlanPurchase, PlanPurchaseStatus } from '../../common/entities/plan-purchase.entity';
import { SubscriptionPlan, SubscriptionPlanKey } from '../../common/entities/subscription-plan.entity';
import { User } from '../users/entities/user.entity';
import { CheckoutDto } from './dtos/subscription.dto';
import { PaymobService } from './paymob.service';
import { PromoCodesService } from './promo-codes.service';

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

@Injectable()
export class PlanPurchasesService {
  constructor(
    @InjectRepository(PlanPurchase) private readonly purchases: Repository<PlanPurchase>,
    @InjectRepository(SubscriptionPlan) private readonly plans: Repository<SubscriptionPlan>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly promoCodes: PromoCodesService,
    private readonly paymob: PaymobService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async checkout(userId: string, planId: string, dto: CheckoutDto) {
    const plan = await this.plans.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    if (plan.key === SubscriptionPlanKey.FREE) throw new BadRequestException('The Free plan is never purchased');
    if (!plan.priceAmount || !plan.durationDays) {
      throw new ConflictException('This plan does not have a price and duration configured yet');
    }

    const basePrice = Number(plan.priceAmount);
    let promoId: string | null = null;
    let finalPrice = basePrice;
    if (dto.promo_code) {
      const promo = await this.promoCodes.validateForPlan(dto.promo_code, planId);
      finalPrice = this.promoCodes.computeDiscountedPrice(basePrice, promo);
      promoId = promo.id;
    }

    // Full-discount short-circuit: skip Paymob entirely, grant immediately, no payment call made.
    if (finalPrice <= 0) {
      const now = new Date();
      const purchase = await this.purchases.save(this.purchases.create({
        userId,
        planId,
        status: PlanPurchaseStatus.PAID,
        paymentMethod: PlanPaymentMethod.PROMOCODE,
        amountPaid: '0.00',
        currency: plan.priceCurrency,
        provider: null,
        providerReference: null,
        promoCodeId: promoId,
        startsAt: now,
        endsAt: addDays(now, plan.durationDays),
      }));
      if (promoId) await this.promoCodes.incrementUsage(promoId);
      return { status: PlanPurchaseStatus.PAID, purchase, checkout_url: null };
    }

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // used_count is intentionally NOT incremented here — only once the webhook confirms payment,
    // so an abandoned checkout never burns a promo use.
    const purchase = await this.purchases.save(this.purchases.create({
      userId,
      planId,
      status: PlanPurchaseStatus.PENDING,
      paymentMethod: dto.payment_method === 'card' ? PlanPaymentMethod.CARD : PlanPaymentMethod.FAWRY,
      amountPaid: finalPrice.toFixed(2),
      currency: plan.priceCurrency,
      provider: 'paymob',
      promoCodeId: promoId,
    }));

    const apiUrl = (this.config.get<string>('API_URL') ?? '').replace(/\/+$/, '');
    const frontendUrl = (this.config.get<string>('FRONTEND_URL') ?? '').replace(/\/+$/, '');
    const [firstName, ...rest] = (user.fullName || 'Student').trim().split(/\s+/);

    const intention = await this.paymob.createIntention({
      method: dto.payment_method,
      amountCents: Math.round(finalPrice * 100),
      currency: plan.priceCurrency,
      specialReference: purchase.id,
      itemName: `${plan.label} plan`,
      billing: {
        firstName: firstName || 'Student',
        lastName: rest.join(' ') || 'Student',
        email: user.email,
        phoneNumber: user.phoneNumber || '+20000000000',
      },
      notificationUrl: `${apiUrl}/webhooks/paymob`,
      redirectionUrl: `${frontendUrl}/subscription?purchase=${purchase.id}`,
    });

    purchase.providerReference = intention.clientSecret;
    await this.purchases.save(purchase);

    return { status: PlanPurchaseStatus.PENDING, purchase, checkout_url: intention.checkoutUrl };
  }

  /** The only place a PlanPurchase transitions out of "pending". Signature-verified inside —
   * callers must not pre-trust the payload. Idempotent: re-delivery of the same webhook (Paymob
   * retries on non-2xx) is a silent no-op once the purchase has already left "pending". */
  async handlePaymobWebhook(transaction: Record<string, unknown>, receivedHmac: string | undefined): Promise<void> {
    if (!this.paymob.verifyWebhookSignature(transaction, receivedHmac)) {
      throw new ForbiddenException('Invalid webhook signature');
    }

    const purchaseId = this.extractPurchaseId(transaction);
    if (!purchaseId) return;

    const success = transaction.success === true;
    const pending = transaction.pending === true;
    if (pending && !success) return;

    const promoCodeId = await this.dataSource.transaction<string | null>(async (manager) => {
      const repository = manager.getRepository(PlanPurchase);
      const purchase = await repository.findOne({
        where: { id: purchaseId },
        relations: { plan: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!purchase || purchase.status !== PlanPurchaseStatus.PENDING) return null;

      if (success) {
        const now = new Date();
        purchase.status = PlanPurchaseStatus.PAID;
        purchase.startsAt = now;
        purchase.endsAt = addDays(now, purchase.plan.durationDays ?? 30);
        const transactionId = transaction.id;
        if (typeof transactionId === 'string' || typeof transactionId === 'number') {
          purchase.providerReference = String(transactionId);
        }
      } else {
        purchase.status = PlanPurchaseStatus.FAILED;
      }
      await repository.save(purchase);
      return success ? purchase.promoCodeId : null;
    });

    // Only the transaction that changed PENDING -> PAID reaches this increment.
    if (promoCodeId) await this.promoCodes.incrementUsage(promoCodeId);
  }

  private extractPurchaseId(transaction: Record<string, unknown>): string | null {
    if (typeof transaction.special_reference === 'string' && transaction.special_reference) {
      return transaction.special_reference;
    }
    const order = transaction.order as Record<string, unknown> | undefined;
    if (order && typeof order.merchant_order_id === 'string' && order.merchant_order_id) {
      return order.merchant_order_id;
    }
    return null;
  }
}
