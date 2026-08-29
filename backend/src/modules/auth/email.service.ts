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
  }

  queueVerification(
    manager: EntityManager,
    email: string,
    fullName: string,
    token: string,
  ): Promise<EmailOutbox> {
    const url = `${this.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
    return this.enqueue(manager, {
      to: email,
      subject: 'Verify your email address',
      text: `Hello ${fullName}, verify your email address: ${url}`,
      html: `<p>Hello ${this.escapeHtml(fullName)},</p><p>Verify your email address:</p><p><a href="${url}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
    });
  }

  queuePasswordReset(
    manager: EntityManager,
    email: string,
    fullName: string,
    token: string,
  ): Promise<EmailOutbox> {
    const url = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    return this.enqueue(manager, {
      to: email,
      subject: 'Reset your password',
      text: `Hello ${fullName}, reset your password: ${url}`,
      html: `<p>Hello ${this.escapeHtml(fullName)},</p><p>Reset your password:</p><p><a href="${url}">Reset password</a></p><p>This link expires in 30 minutes. If you did not request it, ignore this message.</p>`,
    });
  }

  queuePasswordChanged(
    manager: EntityManager,
    email: string,
    fullName: string,
  ): Promise<EmailOutbox> {
    return this.enqueue(manager, {
      to: email,
      subject: 'Your password was changed',
      text: `Hello ${fullName}, your password was changed. If this was not you, contact support immediately.`,
      html: `<p>Hello ${this.escapeHtml(fullName)},</p><p>Your password was changed.</p><p>If this was not you, contact support immediately.</p>`,
    });
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
      this.logger.error('Queued email delivery failed');
      if (message) {
        const delayMinutes = Math.min(60, 2 ** message.attempts);
        await this.dataSource.getRepository(EmailOutbox).update(
          { id: message.id },
          {
            nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
            lastError: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown delivery error',
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
