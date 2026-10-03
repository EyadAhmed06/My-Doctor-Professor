import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, randomInt } from 'crypto';
import { DataSource, IsNull } from 'typeorm';
import { User, UserStatus } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import {
  AccountActionToken,
  AccountActionTokenPurpose,
} from './entities/account-action-token.entity';
import { PasswordResetOtpEmailService } from './password-reset-otp-email.service';

interface MessageResponse {
  message: string;
}

interface VerifyResponse extends MessageResponse {
  reset_token: string;
}

@Injectable()
export class PasswordResetOtpService {
  private readonly hmacSecret: string;
  private readonly otpLifetimeSeconds: number;
  private readonly resetSessionLifetimeSeconds: number;

  constructor(
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
    private readonly rateLimits: AuthRateLimitService,
    private readonly dataSource: DataSource,
    private readonly otpEmail: PasswordResetOtpEmailService,
  ) {
    this.hmacSecret = this.config.getOrThrow<string>('JWT_SECRET');
    this.otpLifetimeSeconds = Math.min(
      this.readPositiveInteger('PASSWORD_RESET_OTP_TTL_SECONDS', 600),
      10 * 60,
    );
    this.resetSessionLifetimeSeconds = Math.min(
      this.readPositiveInteger('PASSWORD_RESET_TTL_SECONDS', 900),
      15 * 60,
    );
  }

  async requestCode(email: string, ip: string): Promise<MessageResponse> {
    const startedAt = Date.now();
    const normalizedEmail = email.trim().toLowerCase();
    await this.rateLimits.enforce(ip, normalizedEmail, 'password-reset-otp-request');

    const user = await this.usersService.findByEmail(normalizedEmail);
    if (user && user.emailVerified && user.status !== UserStatus.DEACTIVATED) {
      await this.issueCode(user);
    }

    await this.ensureMinimumResponseTime(startedAt);
    return {
      message: 'If the account exists, a 6-digit password reset code has been sent.',
    };
  }

  async verifyCode(email: string, code: string, ip: string): Promise<VerifyResponse> {
    const normalizedEmail = email.trim().toLowerCase();
    await this.rateLimits.enforceBudget(
      `ip:password-reset-otp-confirm:${ip}`,
      30,
      15 * 60,
    );
    await this.rateLimits.enforceBudget(
      `account:password-reset-otp-confirm:${normalizedEmail}`,
      8,
      15 * 60,
    );

    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user || !user.emailVerified || user.status === UserStatus.DEACTIVATED) {
      throw new BadRequestException('Invalid or expired password reset code');
    }

    const codeDigest = this.digestCode(user.id, code);
    const resetToken = randomBytes(32).toString('base64url');
    const resetDigest = this.digestToken(resetToken);

    await this.dataSource.transaction(async (manager) => {
      const token = await manager.findOne(AccountActionToken, {
        where: {
          userId: user.id,
          tokenDigest: codeDigest,
          purpose: AccountActionTokenPurpose.PASSWORD_RESET_CODE,
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!token || token.consumedAt || token.expiresAt <= new Date()) {
        throw new BadRequestException('Invalid or expired password reset code');
      }

      const lockedUser = await manager.findOne(User, {
        where: { id: user.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !lockedUser ||
        !lockedUser.emailVerified ||
        lockedUser.status === UserStatus.DEACTIVATED
      ) {
        throw new BadRequestException('Invalid or expired password reset code');
      }

      token.consumedAt = new Date();
      await manager.save(AccountActionToken, token);

      await manager.update(
        AccountActionToken,
        {
          userId: lockedUser.id,
          purpose: AccountActionTokenPurpose.PASSWORD_RESET,
          consumedAt: IsNull(),
        },
        { consumedAt: new Date() },
      );

      await manager.save(
        AccountActionToken,
        manager.create(AccountActionToken, {
          userId: lockedUser.id,
          purpose: AccountActionTokenPurpose.PASSWORD_RESET,
          tokenDigest: resetDigest,
          expiresAt: new Date(Date.now() + this.resetSessionLifetimeSeconds * 1000),
          consumedAt: null,
        }),
      );
    });

    return {
      message: 'Code verified. Create your new password to finish recovery.',
      reset_token: resetToken,
    };
  }

  private async issueCode(user: User): Promise<void> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');

    await this.dataSource.transaction(async (manager) => {
      const lockedUser = await manager.findOne(User, {
        where: { id: user.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedUser) return;

      const consumedAt = new Date();
      await manager.update(
        AccountActionToken,
        {
          userId: lockedUser.id,
          purpose: AccountActionTokenPurpose.PASSWORD_RESET_CODE,
          consumedAt: IsNull(),
        },
        { consumedAt },
      );
      await manager.update(
        AccountActionToken,
        {
          userId: lockedUser.id,
          purpose: AccountActionTokenPurpose.PASSWORD_RESET,
          consumedAt: IsNull(),
        },
        { consumedAt },
      );

      await manager.save(
        AccountActionToken,
        manager.create(AccountActionToken, {
          userId: lockedUser.id,
          purpose: AccountActionTokenPurpose.PASSWORD_RESET_CODE,
          tokenDigest: this.digestCode(lockedUser.id, code),
          expiresAt: new Date(Date.now() + this.otpLifetimeSeconds * 1000),
          consumedAt: null,
        }),
      );

      await this.otpEmail.queueCode(
        manager,
        lockedUser.email,
        lockedUser.fullName,
        code,
        this.otpLifetimeSeconds,
      );
    });
  }

  private digestCode(userId: string, code: string): string {
    return createHmac('sha256', this.hmacSecret)
      .update(`password-reset:${userId}:${code}`)
      .digest('hex');
  }

  private digestToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private readPositiveInteger(key: string, fallback: number): number {
    const value = Number(this.config.get<string | number>(key) ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${key} must be a positive integer`);
    }
    return value;
  }

  private async ensureMinimumResponseTime(startedAt: number): Promise<void> {
    const remaining = 350 - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }
}
