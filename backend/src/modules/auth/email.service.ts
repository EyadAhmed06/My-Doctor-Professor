import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';
import * as nodemailer from 'nodemailer';
import { DataSource, EntityManager, LessThan } from 'typeorm';
import { AuthRateLimit } from './entities/auth-rate-limit.entity';
import { AccountActionToken } from './entities/account-action-token.entity';
import { EmailOutbox } from './entities/email-outbox.entity';

interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface EmailTemplateOptions {
  preheader: string;
  eyebrow: string;
  title: string;
  intro: string;
  body: string;
  footer?: string;
}

@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly sender: string;
  private readonly frontendUrl: string;
  private readonly encryptionKey: Buffer;
  private worker?: NodeJS.Timeout;
  private cleanup?: NodeJS.Timeout;
  private transportReady = false;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.sender = this.config.getOrThrow<string>('SMTP_FROM');
    this.frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL').replace(/\/$/, '');
    this.encryptionKey = Buffer.from(
      this.config.getOrThrow<string>('EMAIL_OUTBOX_ENCRYPTION_KEY'),
      'base64',
    );
    if (this.encryptionKey.length !== 32) {
      throw new Error('EMAIL_OUTBOX_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
    }

    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: Number(this.config.get<string>('SMTP_PORT', '587')),
      secure: this.config.get<string>('SMTP_SECURE', 'false') === 'true',
      pool: true,
      maxConnections: 2,
      maxMessages: 50,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      auth: {
        user: this.config.getOrThrow<string>('SMTP_USER'),
        pass: this.config.getOrThrow<string>('SMTP_PASSWORD'),
      },
    });
  }

  onModuleInit(): void {
    void this.verifyTransport();
    this.worker = setInterval(() => void this.processNext(), 5_000);
    this.worker.unref();
    this.cleanup = setInterval(() => void this.cleanupExpiredRecords(), 60 * 60_000);
    this.cleanup.unref();
    void this.processNext();
  }

  private async verifyTransport(): Promise<void> {
    try {
      await this.transporter.verify();
      if (!this.transportReady) this.logger.log('SMTP transport verified and ready');
      this.transportReady = true;
    } catch (error) {
      this.transportReady = false;
      const detail = error instanceof Error ? error.message : 'Unknown SMTP error';
      this.logger.error(`SMTP transport verification failed: ${detail}`);
    }
  }

  onModuleDestroy(): void {
    if (this.worker) clearInterval(this.worker);
    if (this.cleanup) clearInterval(this.cleanup);
    this.transporter.close();
  }

  queueVerification(
    manager: EntityManager,
    email: string,
    fullName: string,
    code: string,
    lifetimeSeconds: number,
  ): Promise<EmailOutbox> {
    const safeName = this.escapeHtml(fullName);
    const lifetimeMinutes = Math.max(1, Math.ceil(lifetimeSeconds / 60));
    const groupedCode = code.split('').join(' ');

    return this.enqueue(manager, {
      to: email,
      subject: `${code} is your verification code`,
      text: [
        `Hello ${fullName},`,
        '',
        `Your My Doctor & The Professor verification code is: ${code}`,
        `This code expires in ${lifetimeMinutes} minutes and can be used only once.`,
        '',
        'If you did not create this account, you can safely ignore this email.',
      ].join('\n'),
      html: this.renderEmail({
        preheader: `Your verification code is ${code}. It expires in ${lifetimeMinutes} minutes.`,
        eyebrow: 'EMAIL VERIFICATION',
        title: 'Confirm your email address',
        intro: `Hello ${safeName}, use the one-time code below to finish creating your student account.`,
        body: `
          <div style="margin:28px 0 24px;padding:24px 18px;border-radius:16px;background:#0f1730;border:1px solid #27365f;text-align:center;">
            <div style="margin-bottom:9px;color:#98a6c7;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;">Your verification code</div>
            <div style="color:#f8fbff;font-family:Arial,Helvetica,sans-serif;font-size:34px;font-weight:800;letter-spacing:9px;line-height:1.2;">${groupedCode}</div>
          </div>
          <p style="margin:0;color:#aeb8d3;font-size:14px;line-height:1.7;text-align:center;">
            This code expires in <strong style="color:#ffffff;">${lifetimeMinutes} minutes</strong> and works once.
          </p>
          <div style="margin-top:26px;padding:14px 16px;border-radius:12px;background:#111a31;border-left:3px solid #47d5c8;color:#9eabc8;font-size:12px;line-height:1.6;">
            For your security, never share this code with anyone. Our team will never ask you for it.
          </div>
        `,
        footer: 'If you did not create a My Doctor & The Professor account, no action is required.',
      }),
    });
  }

  queuePasswordReset(
    manager: EntityManager,
    email: string,
    fullName: string,
    token: string,
  ): Promise<EmailOutbox> {
    const url = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const safeName = this.escapeHtml(fullName);
    const safeUrl = this.escapeHtml(url);

    return this.enqueue(manager, {
      to: email,
      subject: 'Reset your My Doctor & The Professor password',
      text: [
        `Hello ${fullName},`,
        '',
        'We received a request to reset your password.',
        `Open this secure link: ${url}`,
        'The link expires in 30 minutes.',
        '',
        'If you did not request this, ignore this email and your password will remain unchanged.',
      ].join('\n'),
      html: this.renderEmail({
        preheader: 'Reset your password securely. This link expires in 30 minutes.',
        eyebrow: 'ACCOUNT RECOVERY',
        title: 'Reset your password',
        intro: `Hello ${safeName}, we received a request to create a new password for your account.`,
        body: `
          <div style="margin:30px 0;text-align:center;">
            <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;border-radius:10px;background:#47d5c8;color:#07111f;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:800;text-decoration:none;">Reset password</a>
          </div>
          <p style="margin:0;color:#aeb8d3;font-size:13px;line-height:1.7;text-align:center;">
            This secure link expires in <strong style="color:#ffffff;">30 minutes</strong>.
          </p>
          <p style="margin:22px 0 0;color:#7583a5;font-size:11px;line-height:1.6;word-break:break-all;">
            If the button does not work, copy and paste this address into your browser:<br>${safeUrl}
          </p>
        `,
        footer: 'If you did not request a password reset, you can safely ignore this message.',
      }),
    });
  }

  queuePasswordChanged(
    manager: EntityManager,
    email: string,
    fullName: string,
  ): Promise<EmailOutbox> {
    const safeName = this.escapeHtml(fullName);
    return this.enqueue(manager, {
      to: email,
      subject: 'Your password was changed',
      text: `Hello ${fullName}, your password was changed. If this was not you, contact support immediately.`,
      html: this.renderEmail({
        preheader: 'Your account password was changed.',
        eyebrow: 'SECURITY NOTICE',
        title: 'Your password was changed',
        intro: `Hello ${safeName}, the password for your My Doctor & The Professor account was updated successfully.`,
        body: `
          <div style="margin-top:26px;padding:16px;border-radius:12px;background:#241522;border:1px solid #5d2d46;color:#ffc7d2;font-size:13px;line-height:1.65;">
            If you did not make this change, contact support immediately and secure your email account.
          </div>
        `,
      }),
    });
  }

  private renderEmail(options: EmailTemplateOptions): string {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>${this.escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background:#060919;color:#f7f9ff;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${this.escapeHtml(options.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#060919;">
    <tr>
      <td align="center" style="padding:34px 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;background:#0b1124;border:1px solid #202b4a;border-radius:20px;overflow:hidden;">
          <tr>
            <td style="padding:26px 30px;background:#0e1630;border-bottom:1px solid #202b4a;">
              <div style="font-size:18px;font-weight:800;letter-spacing:-.2px;color:#ffffff;">My Doctor <span style="color:#47d5c8;">&</span> The Professor</div>
              <div style="margin-top:5px;color:#7887aa;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;">Medical learning, built around you</div>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 34px 32px;">
              <div style="color:#47d5c8;font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;">${this.escapeHtml(options.eyebrow)}</div>
              <h1 style="margin:12px 0 14px;color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:400;line-height:1.2;">${this.escapeHtml(options.title)}</h1>
              <p style="margin:0;color:#aeb8d3;font-size:14px;line-height:1.75;">${options.intro}</p>
              ${options.body}
            </td>
          </tr>
          <tr>
            <td style="padding:22px 30px;background:#080e1e;border-top:1px solid #202b4a;color:#7482a3;font-size:11px;line-height:1.65;">
              ${this.escapeHtml(options.footer ?? 'This is an automated security message from My Doctor & The Professor.')}
            </td>
          </tr>
        </table>
        <div style="max-width:600px;margin:16px auto 0;color:#586686;font-size:10px;line-height:1.6;text-align:center;">
          My Doctor & The Professor · Secure account communication
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private async enqueue(manager: EntityManager, payload: EmailPayload): Promise<EmailOutbox> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    return manager.save(
      EmailOutbox,
      manager.create(EmailOutbox, {
        encryptedPayload: encrypted.toString('base64'),
        encryptionIv: iv.toString('base64'),
        encryptionTag: cipher.getAuthTag().toString('base64'),
        attempts: 0,
        nextAttemptAt: null,
        sentAt: null,
        lastError: null,
      }),
    );
  }

  private async processNext(): Promise<void> {
    let message: EmailOutbox | null = null;
    try {
      message = await this.dataSource.transaction(async (manager) => {
        const candidate = await manager
          .createQueryBuilder(EmailOutbox, 'email')
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .where('email.sent_at IS NULL')
          .andWhere('email.attempts < 5')
          .andWhere('(email.next_attempt_at IS NULL OR email.next_attempt_at <= CURRENT_TIMESTAMP)')
          .orderBy('email.created_at', 'ASC')
          .getOne();

        if (!candidate) return null;
        candidate.attempts += 1;
        candidate.nextAttemptAt = new Date(Date.now() + 5 * 60_000);
        return manager.save(EmailOutbox, candidate);
      });

      if (!message) return;
      const payload = this.decrypt(message);
      await this.transporter.sendMail({ from: this.sender, ...payload });
      this.transportReady = true;
      await this.dataSource.getRepository(EmailOutbox).update(
        { id: message.id },
        { sentAt: new Date(), nextAttemptAt: null, lastError: null },
      );
    } catch (error) {
      this.transportReady = false;
      const detail = error instanceof Error ? error.message : 'Unknown delivery error';
      this.logger.error(`Queued email delivery failed: ${detail}`);
      if (message) {
        const delayMinutes = Math.min(60, 2 ** message.attempts);
        await this.dataSource.getRepository(EmailOutbox).update(
          { id: message.id },
          {
            nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
            lastError: detail.slice(0, 1000),
          },
        );
      }
      void this.verifyTransport();
    }
  }

  private decrypt(message: EmailOutbox): EmailPayload {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(message.encryptionIv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(message.encryptionTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(message.encryptedPayload, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8')) as EmailPayload;
  }

  private async cleanupExpiredRecords(): Promise<void> {
    const now = new Date();
    const retention = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    const outboxRetention = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    await Promise.all([
      this.dataSource
        .getRepository(AccountActionToken)
        .createQueryBuilder()
        .delete()
        .where('expires_at < :retention OR consumed_at < :retention', { retention })
        .execute(),
      this.dataSource.getRepository(AuthRateLimit).delete({ expiresAt: LessThan(now) }),
      this.dataSource.getRepository(EmailOutbox).delete({
        sentAt: LessThan(outboxRetention),
      }),
    ]);
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character] as string);
  }
}
