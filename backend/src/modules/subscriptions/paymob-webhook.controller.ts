import { Body, Controller, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { PlanPurchasesService } from './plan-purchases.service';

/**
 * Public endpoint — Paymob calls this server-to-server with no user session, so it intentionally
 * carries no JwtAuthGuard. Authenticity comes entirely from the HMAC signature verified inside
 * PlanPurchasesService.handlePaymobWebhook; never treat an unverified payload as trustworthy.
 *
 * Paymob's transaction callback body is `{ type: "TRANSACTION", obj: { ...transaction fields } }`
 * with the signature attached as a `?hmac=` query parameter on the notification_url itself.
 */
@Controller('webhooks/paymob')
export class PaymobWebhookController {
  constructor(private readonly purchases: PlanPurchasesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Body() body: Record<string, unknown>,
    @Query('hmac') hmac: string | undefined,
  ): Promise<{ received: true }> {
    const transaction = (body?.obj && typeof body.obj === 'object' ? body.obj : body) as Record<string, unknown>;
    await this.purchases.handlePaymobWebhook(transaction, hmac);
    return { received: true };
  }
}
