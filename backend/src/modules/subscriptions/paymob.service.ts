import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Thin client around Paymob's v1 Intention API (https://developers.paymob.com), covering the two
 * flows this app needs: card (unified-checkout redirect/iframe) and Fawry (reference code, paid
 * later at a kiosk — the webhook is what eventually confirms it, possibly hours/days later).
 *
 * Every credential is read from env; nothing is hardcoded. Until PAYMOB_API_KEY is set the service
 * fails closed (ServiceUnavailableException) rather than silently no-op — a checkout call should
 * never *appear* to succeed against an unconfigured provider.
 */

// Fixed, Paymob-documented field list for transaction-callback HMAC verification. Already in
// lexicographic key order — do not reorder; Paymob computes the same concatenation server-side.
const HMAC_FIELDS = [
  'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id',
  'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment',
  'is_voided', 'order.id', 'owner', 'pending', 'source_data.pan', 'source_data.sub_type',
  'source_data.type', 'success',
] as const;

export interface PaymobIntentionResult {
  clientSecret: string;
  checkoutUrl: string;
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

  /** amountCents must already reflect any promo discount — Paymob only ever sees the final price. */
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
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('Payment provider is not configured yet');
    }
    const integrationId = params.method === 'card' ? this.cardIntegrationId : this.fawryIntegrationId;
    if (!integrationId) {
      throw new ServiceUnavailableException(`Paymob integration id for "${params.method}" is not configured`);
    }

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
      this.logger.error(`Paymob intention request failed: ${cause instanceof Error ? cause.message : cause}`);
      throw new ServiceUnavailableException('Payment provider is temporarily unavailable');
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`Paymob intention creation rejected: ${response.status} ${body}`);
      throw new BadGatewayException('Payment provider rejected the checkout request');
    }

    const data = await response.json() as { client_secret?: string };
    if (!data.client_secret) {
      throw new BadGatewayException('Payment provider returned an unexpected response');
    }
    return {
      clientSecret: data.client_secret,
      checkoutUrl: `${this.baseUrl}/unifiedcheckout/?publicKey=${encodeURIComponent(this.publicKey)}&clientSecret=${encodeURIComponent(data.client_secret)}`,
    };
  }

  /** Verifies a transaction-processed webhook using Paymob's documented HMAC-SHA512 scheme:
   * concatenate the fixed field list's values (in that exact order) and compare against the
   * `hmac` query parameter Paymob attaches to the notification_url. Never trust an unverified
   * payload to mark a purchase paid. */
  verifyWebhookSignature(transaction: Record<string, unknown>, receivedHmac: string | undefined): boolean {
    if (!this.hmacSecret || !receivedHmac) return false;
    const concatenated = HMAC_FIELDS.map((path) => this.stringify(this.readPath(transaction, path))).join('');
    const computed = createHmac('sha512', this.hmacSecret).update(concatenated).digest('hex');
    const computedBuffer = Buffer.from(computed, 'utf8');
    const receivedBuffer = Buffer.from(receivedHmac, 'utf8');
    if (computedBuffer.length !== receivedBuffer.length) return false;
    return timingSafeEqual(computedBuffer, receivedBuffer);
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
