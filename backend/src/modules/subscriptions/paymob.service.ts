import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

const HMAC_FIELDS = [
  'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id',
  'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment',
  'is_voided', 'order.id', 'owner', 'pending', 'source_data.pan', 'source_data.sub_type',
  'source_data.type', 'success',
] as const;

export interface PaymobIntentionResult {
  clientSecret: string;
  checkoutUrl: string;
  orderId: string;
}

export interface PaymobBillingData {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
}

@Injectable()
export class PaymobService {
  private readonly logger = new Logger(PaymobService.name);
  private readonly apiKey: string;
  private readonly publicKey: string;
  private readonly hmacSecret: string;
  private readonly baseUrl: string;
  private readonly cardIntegrationId: string;
  private readonly fawryIntegrationId: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('PAYMOB_API_KEY') ?? '';
    this.publicKey = this.config.get<string>('PAYMOB_PUBLIC_KEY') ?? '';
    this.hmacSecret = this.config.get<string>('PAYMOB_HMAC_SECRET') ?? '';
    this.baseUrl = (this.config.get<string>('PAYMOB_BASE_URL') ?? 'https://accept.paymob.com').replace(/\/+$/, '');
    this.cardIntegrationId = this.config.get<string>('PAYMOB_CARD_INTEGRATION_ID') ?? '';
    this.fawryIntegrationId = this.config.get<string>('PAYMOB_FAWRY_INTEGRATION_ID') ?? '';
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey && this.publicKey && this.hmacSecret);
  }

  async createIntention(params: {
    method: 'card' | 'fawry';
    amountCents: number;
    currency: string;
    specialReference: string;
    itemName: string;
    billing: PaymobBillingData;
    notificationUrl: string;
    redirectionUrl: string;
  }): Promise<PaymobIntentionResult> {
    if (!this.isConfigured) throw new ServiceUnavailableException('Payment provider is not configured yet');
    const integrationId = params.method === 'card' ? this.cardIntegrationId : this.fawryIntegrationId;
    if (!integrationId) throw new ServiceUnavailableException(`Paymob integration id for "${params.method}" is not configured`);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/intention/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Token ${this.apiKey}` },
        body: JSON.stringify({
          amount: params.amountCents,
          currency: params.currency,
          payment_methods: [Number.isFinite(Number(integrationId)) ? Number(integrationId) : integrationId],
          items: [{ name: params.itemName, amount: params.amountCents, quantity: 1 }],
          billing_data: {
            first_name: params.billing.firstName || 'NA',
            last_name: params.billing.lastName || 'NA',
            email: params.billing.email,
            phone_number: params.billing.phoneNumber || '+20000000000',
          },
          special_reference: params.specialReference,
          notification_url: params.notificationUrl,
          redirection_url: params.redirectionUrl,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (cause) {
      this.logger.error(`Paymob intention request failed: ${cause instanceof Error ? cause.name : 'network error'}`);
      throw new ServiceUnavailableException('Payment provider is temporarily unavailable');
    }

    if (!response.ok) {
      this.logger.error(`Paymob intention creation rejected with HTTP ${response.status}`);
      throw new BadGatewayException('Payment provider rejected the checkout request');
    }

    const data = await response.json() as { client_secret?: string; intention_order_id?: string | number };
    if (!data.client_secret || data.intention_order_id === undefined || data.intention_order_id === null) {
      throw new BadGatewayException('Payment provider returned an unexpected response');
    }
    return {
      clientSecret: data.client_secret,
      orderId: String(data.intention_order_id),
      checkoutUrl: `${this.baseUrl}/unifiedcheckout/?publicKey=${encodeURIComponent(this.publicKey)}&clientSecret=${encodeURIComponent(data.client_secret)}`,
    };
  }

  verifyWebhookSignature(transaction: Record<string, unknown>, receivedHmac: string | undefined): boolean {
    if (!this.hmacSecret || !receivedHmac) return false;
    const concatenated = HMAC_FIELDS.map((path) => this.stringify(this.readPath(transaction, path))).join('');
    const computed = createHmac('sha512', this.hmacSecret).update(concatenated).digest('hex');
    const computedBuffer = Buffer.from(computed, 'utf8');
    const receivedBuffer = Buffer.from(receivedHmac, 'utf8');
    if (computedBuffer.length !== receivedBuffer.length) return false;
    return timingSafeEqual(computedBuffer, receivedBuffer);
  }

  expectedIntegrationId(method: 'card' | 'fawry'): string | null {
    const value = method === 'card' ? this.cardIntegrationId : this.fawryIntegrationId;
    return value ? String(value) : null;
  }

  readSignedOrderId(transaction: Record<string, unknown>): string | null {
    const value = this.readPath(transaction, 'order.id');
    return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
  }

  private readPath(source: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
      return undefined;
    }, source);
  }

  private stringify(value: unknown): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return JSON.stringify(value);
  }
}