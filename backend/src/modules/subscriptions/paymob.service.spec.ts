import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { PaymobService } from './paymob.service';

const HMAC_SECRET = 'test-hmac-secret';

function service(overrides: Record<string, string> = {}): PaymobService {
  const values: Record<string, string> = {
    PAYMOB_HMAC_SECRET: HMAC_SECRET,
    ...overrides,
  };
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
  return new PaymobService(config);
}

// Same fixed, lexicographically-ordered field list PaymobService concatenates for verification.
const ORDERED_FIELDS: [string, string][] = [
  ['amount_cents', '10000'],
  ['created_at', '2026-08-17T10:00:00Z'],
  ['currency', 'EGP'],
  ['error_occured', 'false'],
  ['has_parent_transaction', 'false'],
  ['id', '555'],
  ['integration_id', '12345'],
  ['is_3d_secure', 'true'],
  ['is_auth', 'false'],
  ['is_capture', 'false'],
  ['is_refunded', 'false'],
  ['is_standalone_payment', 'true'],
  ['is_voided', 'false'],
  ['order.id', '999'],
  ['owner', '42'],
  ['pending', 'false'],
  ['source_data.pan', '1234'],
  ['source_data.sub_type', 'MasterCard'],
  ['source_data.type', 'card'],
  ['success', 'true'],
];

function buildTransaction(): Record<string, unknown> {
  return {
    amount_cents: 10000,
    created_at: '2026-08-17T10:00:00Z',
    currency: 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    id: 555,
    integration_id: 12345,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: 999 },
    owner: 42,
    pending: false,
    source_data: { pan: '1234', sub_type: 'MasterCard', type: 'card' },
    success: true,
  };
}

function computeExpectedHmac(): string {
  const concatenated = ORDERED_FIELDS.map(([, value]) => value).join('');
  return createHmac('sha512', HMAC_SECRET).update(concatenated).digest('hex');
}

describe('PaymobService.verifyWebhookSignature', () => {
  it('accepts a correctly computed HMAC-SHA512 signature', () => {
    const transaction = buildTransaction();
    const validHmac = computeExpectedHmac();
    expect(service().verifyWebhookSignature(transaction, validHmac)).toBe(true);
  });

  it('rejects a tampered payload even if the original hmac is replayed', () => {
    const transaction = buildTransaction();
    const validHmac = computeExpectedHmac();
    transaction.amount_cents = 1;
    expect(service().verifyWebhookSignature(transaction, validHmac)).toBe(false);
  });

  it('rejects a missing or empty hmac', () => {
    const transaction = buildTransaction();
    expect(service().verifyWebhookSignature(transaction, undefined)).toBe(false);
    expect(service().verifyWebhookSignature(transaction, '')).toBe(false);
  });
});

describe('PaymobService provider error handling', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not copy provider response bodies into application logs', async () => {
    const sensitiveBody = '{"email":"student@example.com","detail":"provider-internal-context"}';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 422,
      text: jest.fn().mockResolvedValue(sensitiveBody),
    } as unknown as Response);
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const subject = service({
      PAYMOB_API_KEY: 'api-key',
      PAYMOB_PUBLIC_KEY: 'public-key',
      PAYMOB_CARD_INTEGRATION_ID: '12345',
    });

    await expect(subject.createIntention({
      method: 'card',
      amountCents: 10000,
      currency: 'EGP',
      specialReference: 'purchase-1',
      itemName: 'Plan',
      billing: { firstName: 'Test', lastName: 'Student', email: 'student@example.com', phoneNumber: '+201000000000' },
      notificationUrl: 'https://api.example.com/webhooks/paymob',
      redirectionUrl: 'https://app.example.com/subscription',
    })).rejects.toThrow('Payment provider rejected the checkout request');

    const logged = log.mock.calls.flat().map(String).join(' ');
    expect(logged).toContain('HTTP 422');
    expect(logged).not.toContain('student@example.com');
    expect(logged).not.toContain('provider-internal-context');
  });
});