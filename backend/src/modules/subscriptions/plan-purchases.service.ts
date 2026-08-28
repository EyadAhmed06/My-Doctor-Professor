import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PlanPaymentMethod, PlanPurchase, PlanPurchaseStatus } from '../../common/entities/plan-purchase.entity';
import { PromoCode } from '../../common/entities/promo-code.entity';
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
    if (!plan.priceAmount || !plan.durationDays) throw new ConflictException('This plan does not have a price and duration configured yet');

    const basePrice = Number(plan.priceAmount);
    let promoId: string | null = null;
    let finalPrice = basePrice;
    if (dto.promo_code) {
      const promo = await this.promoCodes.validateForPlan(dto.promo_code, planId);
      finalPrice = this.promoCodes.computeDiscountedPrice(basePrice, promo);
      promoId = promo.id;
    }

    if (finalPrice <= 0) {
      const now = new Date();
      const purchase = await this.purchases.save(this.purchases.create({
        userId, planId, status: PlanPurchaseStatus.PAID, paymentMethod: PlanPaymentMethod.PROMOCODE,
        amountPaid: '0.00', currency: plan.priceCurrency, provider: null, providerReference: null,
        providerOrderId: null, providerTransactionId: null, promoCodeId: promoId, startsAt: now,
        endsAt: addDays(now, plan.durationDays),
      }));
      if (promoId) await this.promoCodes.incrementUsage(promoId);
      return { status: PlanPurchaseStatus.PAID, purchase, checkout_url: null };
    }

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const purchase = await this.purchases.save(this.purchases.create({
      userId, planId, status: PlanPurchaseStatus.PENDING,
      paymentMethod: dto.payment_method === 'card' ? PlanPaymentMethod.CARD : PlanPaymentMethod.FAWRY,
      amountPaid: finalPrice.toFixed(2), currency: plan.priceCurrency, provider: 'paymob',
      providerOrderId: null, providerTransactionId: null, promoCodeId: promoId,
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
      billing: { firstName: firstName || 'Student', lastName: rest.join(' ') || 'Student', email: user.email, phoneNumber: user.phoneNumber || '+20000000000' },
      notificationUrl: `${apiUrl}/webhooks/paymob`,
      redirectionUrl: `${frontendUrl}/subscription?purchase=${purchase.id}`,
    });

    purchase.providerReference = intention.clientSecret;
    purchase.providerOrderId = intention.orderId;
    await this.purchases.save(purchase);
    return { status: PlanPurchaseStatus.PENDING, purchase, checkout_url: intention.checkoutUrl };
  }

  async handlePaymobWebhook(transaction: Record<string, unknown>, receivedHmac: string | undefined): Promise<void> {
    if (!this.paymob.verifyWebhookSignature(transaction, receivedHmac)) throw new ForbiddenException('Invalid webhook signature');
    const purchaseId = this.extractPurchaseId(transaction);
    if (!purchaseId) return;
    const success = transaction.success === true;
    const pending = transaction.pending === true;
    if (pending && !success) return;

    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(PlanPurchase);
      const purchase = await repository.findOne({ where: { id: purchaseId }, relations: { plan: true }, lock: { mode: 'pessimistic_write' } });
      if (!purchase || purchase.status !== PlanPurchaseStatus.PENDING) return;
      this.assertWebhookContext(purchase, transaction);

      if (success) {
        const transactionId = this.scalar(transaction.id, 'transaction id');
        const duplicate = await repository.findOne({ where: { provider: 'paymob', providerTransactionId: transactionId } });
        if (duplicate && duplicate.id !== purchase.id) throw new ConflictException('Payment transaction was already used for another purchase');
        const now = new Date();
        purchase.status = PlanPurchaseStatus.PAID;
        purchase.startsAt = now;
        purchase.endsAt = addDays(now, purchase.plan.durationDays ?? 30);
        purchase.providerTransactionId = transactionId;
      } else {
        purchase.status = PlanPurchaseStatus.FAILED;
      }
      await repository.save(purchase);
      if (success && purchase.promoCodeId) await manager.increment(PromoCode, { id: purchase.promoCodeId }, 'usedCount', 1);
    });
  }

  private assertWebhookContext(purchase: PlanPurchase, transaction: Record<string, unknown>): void {
    const receivedOrderId = this.paymob.readSignedOrderId(transaction);
    if (!purchase.providerOrderId || !receivedOrderId || purchase.providerOrderId !== receivedOrderId) {
      throw new ForbiddenException('Payment webhook order does not match the purchase');
    }
    const amount = Number(transaction.amount_cents);
    const expectedAmount = Math.round(Number(purchase.amountPaid) * 100);
    if (!Number.isSafeInteger(amount) || amount !== expectedAmount) throw new ForbiddenException('Payment webhook amount does not match the purchase');
    const currency = typeof transaction.currency === 'string' ? transaction.currency.toUpperCase() : '';
    if (currency !== purchase.currency.toUpperCase()) throw new ForbiddenException('Payment webhook currency does not match the purchase');
    const expectedIntegration = this.paymob.expectedIntegrationId(purchase.paymentMethod === PlanPaymentMethod.CARD ? 'card' : 'fawry');
    const receivedIntegration = transaction.integration_id === undefined || transaction.integration_id === null ? null : String(transaction.integration_id);
    if (!expectedIntegration || receivedIntegration !== expectedIntegration) throw new ForbiddenException('Payment webhook integration does not match the purchase method');
  }

  private scalar(value: unknown, label: string): string {
    if (typeof value !== 'string' && typeof value !== 'number') throw new ForbiddenException(`Payment webhook ${label} is missing`);
    const normalized = String(value).trim();
    if (!normalized) throw new ForbiddenException(`Payment webhook ${label} is missing`);
    return normalized;
  }

  private extractPurchaseId(transaction: Record<string, unknown>): string | null {
    const order = transaction.order as Record<string, unknown> | undefined;
    const merchantOrderId = order?.merchant_order_id;
    if (typeof merchantOrderId === 'string' && merchantOrderId) return merchantOrderId;
    if (typeof transaction.special_reference === 'string' && transaction.special_reference) return transaction.special_reference;
    return null;
  }
}