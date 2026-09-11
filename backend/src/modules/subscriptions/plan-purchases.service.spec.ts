import { ConfigService } from '@nestjs/config';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PlanPaymentMethod, PlanPurchase, PlanPurchaseStatus } from '../../common/entities/plan-purchase.entity';
import { PromoCode, PromoDiscountType } from '../../common/entities/promo-code.entity';
import { SubscriptionPlan, SubscriptionPlanKey } from '../../common/entities/subscription-plan.entity';
import { User } from '../users/entities/user.entity';
import { PlanPurchasesService } from './plan-purchases.service';
import { PaymobService } from './paymob.service';
import { PromoCodesService } from './promo-codes.service';

const userId = '22222222-2222-4222-8222-222222222222';
const planId = 'aaaaaaaa-0000-4000-8000-000000000003';

function plan(overrides: Partial<SubscriptionPlan> = {}): SubscriptionPlan {
  return {
    id: planId,
    key: SubscriptionPlanKey.FIRST_5_WEEKS,
    label: 'First 5 Weeks',
    priceAmount: '100.00',
    priceCurrency: 'EGP',
    durationDays: 35,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function build() {
  const purchases: PlanPurchase[] = [];

  const purchasesRepo = {
    create: jest.fn((value: Partial<PlanPurchase>) => ({ id: `purchase-${purchases.length + 1}`, ...value } as PlanPurchase)),
    save: jest.fn(async (value: PlanPurchase) => {
      const index = purchases.findIndex((item) => item.id === value.id);
      if (index === -1) purchases.push(value);
      else purchases[index] = value;
      return value;
    }),
    findOne: jest.fn(async ({ where }: { where: Partial<PlanPurchase> }) => {
      if (where.id) {
        const found = purchases.find((item) => item.id === where.id);
        return found ? { ...found, plan: plan() } : null;
      }
      if (where.provider && where.providerTransactionId) {
        const found = purchases.find((item) =>
          item.provider === where.provider && item.providerTransactionId === where.providerTransactionId,
        );
        return found ? { ...found, plan: plan() } : null;
      }
      return null;
    }),
  } as unknown as Repository<PlanPurchase>;

  const plansRepo = { findOne: jest.fn(async () => plan()) } as unknown as Repository<SubscriptionPlan>;
  const usersRepo = {
    findOne: jest.fn(async () => ({ id: userId, fullName: 'Test Student', email: 'student@example.com', phoneNumber: '+201000000000' } as User)),
  } as unknown as Repository<User>;

  const promoCodes = {
    validateForPlan: jest.fn(),
    computeDiscountedPrice: jest.fn(),
    incrementUsage: jest.fn(async () => undefined),
  };

  const paymob = {
    createIntention: jest.fn(),
    verifyWebhookSignature: jest.fn(() => true),
    readSignedOrderId: jest.fn((transaction: Record<string, unknown>) => {
      const order = transaction.order as Record<string, unknown> | undefined;
      const value = order?.id;
      return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
    }),
    expectedIntegrationId: jest.fn((method: 'card' | 'fawry') => method === 'card' ? 'card-int' : 'fawry-int'),
  };

  const config = { get: jest.fn(() => '') } as unknown as ConfigService;
  const manager = {
    getRepository: jest.fn(() => purchasesRepo),
    increment: jest.fn(async () => undefined),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn(async (work: (manager: EntityManager) => Promise<unknown>) => work(manager)),
  } as unknown as DataSource;

  const service = new PlanPurchasesService(
    purchasesRepo,
    plansRepo,
    usersRepo,
    promoCodes as unknown as PromoCodesService,
    paymob as unknown as PaymobService,
    config,
    dataSource,
  );

  return { service, purchases, promoCodes, paymob };
}

function confirmedWebhook(purchase: PlanPurchase, overrides: Record<string, unknown> = {}) {
  return {
    order: { id: purchase.providerOrderId, merchant_order_id: purchase.id },
    amount_cents: 10000,
    currency: 'EGP',
    integration_id: purchase.paymentMethod === PlanPaymentMethod.CARD ? 'card-int' : 'fawry-int',
    pending: false,
    success: true,
    id: 987,
    ...overrides,
  };
}

describe('PlanPurchasesService.checkout', () => {
  it('a 100%-off promo code grants access immediately with no Paymob call made', async () => {
    const { service, purchases, promoCodes } = build();
    const promo = { id: 'promo-1', discountType: PromoDiscountType.FREE, discountValue: '0' } as PromoCode;
    promoCodes.validateForPlan.mockResolvedValue(promo);
    promoCodes.computeDiscountedPrice.mockReturnValue(0);

    const result = await service.checkout(userId, planId, { payment_method: 'card', promo_code: 'FREEBIE' });

    expect(result.status).toBe(PlanPurchaseStatus.PAID);
    expect(result.checkout_url).toBeNull();
    expect(result.purchase).not.toHaveProperty('providerReference');
    expect(purchases).toHaveLength(1);
    expect(purchases[0].paymentMethod).toBe(PlanPaymentMethod.PROMOCODE);
    expect(purchases[0].amountPaid).toBe('0.00');
    expect(purchases[0].startsAt).not.toBeNull();
    expect(purchases[0].endsAt).not.toBeNull();
    expect(promoCodes.incrementUsage).toHaveBeenCalledWith('promo-1');
  });

  it('a Fawry checkout stays pending until a matching signed webhook confirms it', async () => {
    const { service, purchases, paymob } = build();
    paymob.createIntention.mockResolvedValue({
      clientSecret: 'cs_test_123',
      checkoutUrl: 'https://accept.paymob.com/unifiedcheckout/?...',
      orderId: '999',
    });

    const result = await service.checkout(userId, planId, { payment_method: 'fawry' });

    expect(result.status).toBe(PlanPurchaseStatus.PENDING);
    expect(result.purchase).not.toHaveProperty('providerReference');
    expect(purchases[0].providerOrderId).toBe('999');
    expect(purchases[0].providerReference).toBe('cs_test_123');

    await service.handlePaymobWebhook({
      order: { id: 999, merchant_order_id: purchases[0].id },
      pending: true,
      success: false,
    }, 'any-hmac');
    expect(purchases[0].status).toBe(PlanPurchaseStatus.PENDING);

    await service.handlePaymobWebhook(confirmedWebhook(purchases[0]), 'any-hmac');
    expect(purchases[0].status).toBe(PlanPurchaseStatus.PAID);
    expect(purchases[0].startsAt).not.toBeNull();
    expect(purchases[0].endsAt).not.toBeNull();
    expect(purchases[0].providerTransactionId).toBe('987');
    expect(purchases[0].providerReference).toBe('cs_test_123');
  });

  it('rejects a signed webhook whose amount does not match the created purchase', async () => {
    const { service, purchases, paymob } = build();
    paymob.createIntention.mockResolvedValue({ clientSecret: 'cs_amount', checkoutUrl: 'https://checkout', orderId: '1001' });
    await service.checkout(userId, planId, { payment_method: 'card' });

    await expect(service.handlePaymobWebhook(
      confirmedWebhook(purchases[0], { amount_cents: 1 }),
      'valid-hmac',
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(purchases[0].status).toBe(PlanPurchaseStatus.PENDING);
  });

  it('rejects a signed webhook whose currency does not match the purchase', async () => {
    const { service, purchases, paymob } = build();
    paymob.createIntention.mockResolvedValue({ clientSecret: 'cs_currency', checkoutUrl: 'https://checkout', orderId: '1002' });
    await service.checkout(userId, planId, { payment_method: 'card' });

    await expect(service.handlePaymobWebhook(
      confirmedWebhook(purchases[0], { currency: 'USD' }),
      'valid-hmac',
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(purchases[0].status).toBe(PlanPurchaseStatus.PENDING);
  });

  it('rejects a signed webhook for a different Paymob order', async () => {
    const { service, purchases, paymob } = build();
    paymob.createIntention.mockResolvedValue({ clientSecret: 'cs_order', checkoutUrl: 'https://checkout', orderId: '1003' });
    await service.checkout(userId, planId, { payment_method: 'card' });

    await expect(service.handlePaymobWebhook(
      confirmedWebhook(purchases[0], { order: { id: 'different', merchant_order_id: purchases[0].id } }),
      'valid-hmac',
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(purchases[0].status).toBe(PlanPurchaseStatus.PENDING);
  });

  it('rejects a signed webhook from the wrong payment integration', async () => {
    const { service, purchases, paymob } = build();
    paymob.createIntention.mockResolvedValue({ clientSecret: 'cs_integration', checkoutUrl: 'https://checkout', orderId: '1004' });
    await service.checkout(userId, planId, { payment_method: 'card' });

    await expect(service.handlePaymobWebhook(
      confirmedWebhook(purchases[0], { integration_id: 'fawry-int' }),
      'valid-hmac',
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(purchases[0].status).toBe(PlanPurchaseStatus.PENDING);
  });

  it('does not allow one provider transaction id to fulfill two purchases', async () => {
    const { service, purchases, paymob } = build();
    paymob.createIntention
      .mockResolvedValueOnce({ clientSecret: 'cs_first', checkoutUrl: 'https://checkout', orderId: '2001' })
      .mockResolvedValueOnce({ clientSecret: 'cs_second', checkoutUrl: 'https://checkout', orderId: '2002' });
    await service.checkout(userId, planId, { payment_method: 'card' });
    await service.checkout(userId, planId, { payment_method: 'card' });

    await service.handlePaymobWebhook(confirmedWebhook(purchases[0], { id: 555 }), 'valid-hmac');
    await expect(service.handlePaymobWebhook(confirmedWebhook(purchases[1], { id: 555 }), 'valid-hmac'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(purchases[1].status).toBe(PlanPurchaseStatus.PENDING);
  });

  it('an invalid webhook signature is rejected before business context is trusted', async () => {
    const { service, purchases, paymob } = build();
    paymob.createIntention.mockResolvedValue({ clientSecret: 'cs_test_456', checkoutUrl: 'https://checkout', orderId: '3001' });
    paymob.verifyWebhookSignature.mockReturnValue(false);

    await service.checkout(userId, planId, { payment_method: 'card' });
    await expect(service.handlePaymobWebhook({ order: { merchant_order_id: purchases[0].id }, success: true }, 'forged-hmac'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(purchases[0].status).toBe(PlanPurchaseStatus.PENDING);
  });
});