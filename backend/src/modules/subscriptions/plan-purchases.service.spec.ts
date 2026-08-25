import { ConfigService } from '@nestjs/config';
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
    findOne: jest.fn(async ({ where }: { where: { id: string } }) => {
      const found = purchases.find((item) => item.id === where.id);
      return found ? { ...found, plan: plan() } : null;
    }),
  } as unknown as Repository<PlanPurchase>;

  const plansRepo = {
    findOne: jest.fn(async () => plan()),
  } as unknown as Repository<SubscriptionPlan>;

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
  };

  const config = { get: jest.fn(() => '') } as unknown as ConfigService;

  const manager = {
    getRepository: jest.fn(() => purchasesRepo),
    increment: jest.fn(async () => undefined),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn(async (work: (manager: EntityManager) => Promise<unknown>) =>
      work(manager)),
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

describe('PlanPurchasesService.checkout', () => {
  it('a 100%-off promo code grants access immediately with no Paymob call made', async () => {
    const { service, purchases, promoCodes } = build();
    const promo = { id: 'promo-1', discountType: PromoDiscountType.FREE, discountValue: '0' } as PromoCode;
    promoCodes.validateForPlan.mockResolvedValue(promo);
    promoCodes.computeDiscountedPrice.mockReturnValue(0);

    const result = await service.checkout(userId, planId, { payment_method: 'card', promo_code: 'FREEBIE' });

    expect(result.status).toBe(PlanPurchaseStatus.PAID);
    expect(result.checkout_url).toBeNull();
    expect(purchases).toHaveLength(1);
    expect(purchases[0].paymentMethod).toBe(PlanPaymentMethod.PROMOCODE);
    expect(purchases[0].amountPaid).toBe('0.00');
    expect(purchases[0].startsAt).not.toBeNull();
    expect(purchases[0].endsAt).not.toBeNull();
    expect(promoCodes.incrementUsage).toHaveBeenCalledWith('promo-1');
  });

  it('a Fawry checkout stays pending until the webhook confirms it — possibly much later', async () => {
    const { service, purchases, paymob } = build();
    paymob.createIntention.mockResolvedValue({ clientSecret: 'cs_test_123', checkoutUrl: 'https://accept.paymob.com/unifiedcheckout/?...' });

    const result = await service.checkout(userId, planId, { payment_method: 'fawry' });

    expect(result.status).toBe(PlanPurchaseStatus.PENDING);
    expect(result.checkout_url).toContain('unifiedcheckout');
    expect(purchases).toHaveLength(1);
    expect(purchases[0].status).toBe(PlanPurchaseStatus.PENDING);
    expect(purchases[0].paymentMethod).toBe(PlanPaymentMethod.FAWRY);
    expect(purchases[0].startsAt).toBeUndefined();
    expect(purchases[0].endsAt).toBeUndefined();

    // Time passes — the customer pays at a Fawry kiosk hours or days later. Paymob's first callback
    // for Fawry can carry pending:true — that must NOT move the purchase out of "pending".
    await service.handlePaymobWebhook({ special_reference: purchases[0].id, pending: true, success: false }, 'any-hmac');
    expect(purchases[0].status).toBe(PlanPurchaseStatus.PENDING);

    // The confirming callback finally arrives.
    await service.handlePaymobWebhook({ special_reference: purchases[0].id, pending: false, success: true, id: 987 }, 'any-hmac');
    expect(purchases[0].status).toBe(PlanPurchaseStatus.PAID);
    expect(purchases[0].startsAt).not.toBeNull();
    expect(purchases[0].endsAt).not.toBeNull();
    expect(purchases[0].providerReference).toBe('987');
  });

  it('an invalid webhook signature is rejected and never changes purchase status', async () => {
    const { service, purchases, paymob } = build();
    paymob.createIntention.mockResolvedValue({ clientSecret: 'cs_test_456', checkoutUrl: 'https://accept.paymob.com/unifiedcheckout/?...' });
    paymob.verifyWebhookSignature.mockReturnValue(false);

    await service.checkout(userId, planId, { payment_method: 'card' });
    const purchaseId = purchases[0].id;

    await expect(
      service.handlePaymobWebhook({ special_reference: purchaseId, success: true }, 'forged-hmac'),
    ).rejects.toThrow();
    expect(purchases[0].status).toBe(PlanPurchaseStatus.PENDING);
  });
});
