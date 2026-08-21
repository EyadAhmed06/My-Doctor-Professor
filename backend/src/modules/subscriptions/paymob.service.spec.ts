import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PaymobService } from './paymob.service';

const HMAC_SECRET = 'test-hmac-secret';

function service(): PaymobService {
  const config = {
    get: (key: string) => (key === 'PAYMOB_HMAC_SECRET' ? HMAC_SECRET : undefined),
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
    transaction.amount_cents = 1; // attacker lowers the charged amount after the fact
    expect(service().verifyWebhookSignature(transaction, validHmac)).toBe(false);
  });

  it('rejects a missing or empty hmac', () => {
    const transaction = buildTransaction();
    expect(service().verifyWebhookSignature(transaction, undefined)).toBe(false);
    expect(service().verifyWebhookSignature(transaction, '')).toBe(false);
  });
});
