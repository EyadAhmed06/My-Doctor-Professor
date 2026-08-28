import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { DataSource, IsNull } from 'typeorm';
import { AuthSession } from '../users/entities/auth-session.entity';
import { User, UserStatus } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthResponseDto } from './dtos/auth-response.dto';
import { JwtPayload } from './dtos/jwt-payload.dto';
import { LoginDto } from './dtos/login.dto';
import { SignupDto } from './dtos/signup.dto';
import { EmailService } from './email.service';
import {
  AccountActionToken,
  AccountActionTokenPurpose,
} from './entities/account-action-token.entity';

interface MessageResponse {
  message: string;
}

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessLifetimeSeconds: number;
  private readonly refreshLifetimeSeconds: number;
  private readonly verificationLifetimeSeconds: number;
  private readonly resetLifetimeSeconds: number;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
    private readonly rateLimits: AuthRateLimitService,
    private readonly dataSource: DataSource,
  ) {
    this.accessSecret = this.config.getOrThrow<string>('JWT_SECRET');
    this.refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    if (this.accessSecret.length < 32 || this.refreshSecret.length < 32) {
      throw new Error('JWT secrets must each contain at least 32 characters');
    }
    if (this.accessSecret === this.refreshSecret) {
      throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different');
    }
    this.accessLifetimeSeconds = this.readPositiveInteger('JWT_ACCESS_TTL_SECONDS', 900);
    this.refreshLifetimeSeconds = this.readPositiveInteger('JWT_REFRESH_TTL_SECONDS', 604800);
    this.verificationLifetimeSeconds = this.readPositiveInteger('EMAIL_VERIFICATION_TTL_SECONDS', 86400);
    this.resetLifetimeSeconds = this.readPositiveInteger('PASSWORD_RESET_TTL_SECONDS', 1800);
  }

  async signup(dto: SignupDto): Promise<MessageResponse> {
    const user = await this.usersService.createStudentAccount({
      fullName: dto.full_name,
      email: dto.email,
      password: dto.password,
      phoneNumber: dto.phone_number,
      studentNumber: dto.student_number,
      currentSemester: dto.current_semester,
      dateOfBirth: dto.date_of_birth ? new Date(dto.date_of_birth) : undefined,
      gender: dto.gender,
    });
    await this.issueActionToken(
      user,
      AccountActionTokenPurpose.EMAIL_VERIFICATION,
      this.verificationLifetimeSeconds,
    );
    return { message: 'Account created. Check your email to verify your account.' };
  }

  async requestEmailVerification(email: string, ip: string): Promise<MessageResponse> {
    const startedAt = Date.now();
    await this.rateLimits.enforce(ip, email, 'verify-email');
    const user = await this.usersService.findByEmail(email);
    if (user && !user.emailVerified && user.status === UserStatus.PENDING_VERIFICATION) {
      await this.issueActionToken(
        user,
        AccountActionTokenPurpose.EMAIL_VERIFICATION,
        this.verificationLifetimeSeconds,
      );
    }
    await this.ensureMinimumResponseTime(startedAt);
    return { message: 'If the account is eligible, a verification email has been sent.' };
  }

  async confirmEmailVerification(rawToken: string, ip: string): Promise<MessageResponse> {
    await this.rateLimits.enforce(ip, rawToken, 'verify-email-confirm');
    const digest = this.digestToken(rawToken);
    await this.dataSource.transaction(async (manager) => {
      const token = await manager.findOne(AccountActionToken, {
        where: {
          tokenDigest: digest,
          purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION,
        },
        lock: { mode: 'pessimistic_write' },
      });
      this.assertUsableActionToken(token);

      const user = await manager.findOne(User, { where: { id: token.userId } });
      if (!user) throw new BadRequestException('Invalid or expired verification token');
      if (
        user.status === UserStatus.SUSPENDED ||
        user.status === UserStatus.DEACTIVATED
      ) {
        throw new BadRequestException('Account cannot be verified');
      }

      user.emailVerified = true;
      user.status = UserStatus.ACTIVE;
      token.consumedAt = new Date();
      await manager.save(User, user);
      await manager.save(AccountActionToken, token);
    });
    return { message: 'Email verified successfully. You can now sign in.' };
  }

  async requestPasswordReset(email: string, ip: string): Promise<MessageResponse> {
    const startedAt = Date.now();
    await this.rateLimits.enforce(ip, email, 'password-reset');
    const user = await this.usersService.findByEmail(email);
    if (
      user &&
      user.emailVerified &&
      user.status !== UserStatus.DEACTIVATED
    ) {
      await this.issueActionToken(
        user,
        AccountActionTokenPurpose.PASSWORD_RESET,
        this.resetLifetimeSeconds,
      );
    }
    await this.ensureMinimumResponseTime(startedAt);
    return { message: 'If the account exists, a password reset email has been sent.' };
  }

  async resetPassword(
    rawToken: string,
    newPassword: string,
    confirmation: string,
    ip: string,
  ): Promise<MessageResponse> {
    await this.rateLimits.enforce(ip, rawToken, 'password-reset-confirm');
    if (newPassword !== confirmation) {
      throw new BadRequestException('Password confirmation does not match');
    }
    const digest = this.digestToken(rawToken);
    await this.dataSource.transaction(async (manager) => {
      const token = await manager.findOne(AccountActionToken, {
        where: {
          tokenDigest: digest,
          purpose: AccountActionTokenPurpose.PASSWORD_RESET,
        },
        lock: { mode: 'pessimistic_write' },
      });
      this.assertUsableActionToken(token);

      const user = await manager.findOne(User, {
        where: { id: token.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || user.status === UserStatus.DEACTIVATED) {
        throw new BadRequestException('Invalid or expired password reset token');
      }
      if (await this.usersService.validatePassword(newPassword, user.passwordHash)) {
        throw new BadRequestException('New password must be different from the current password');
      }

      user.passwordHash = await this.usersService.hashPassword(newPassword);
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      token.consumedAt = new Date();

      await manager.save(User, user);
      await manager.save(AccountActionToken, token);
      await manager.update(
        AccountActionToken,
        {
          userId: user.id,
          purpose: AccountActionTokenPurpose.PASSWORD_RESET,
          consumedAt: IsNull(),
        },
        { consumedAt: new Date() },
      );
      await this.emailService.queuePasswordChanged(manager, user.email, user.fullName);
      await manager
        .createQueryBuilder()
        .update(AuthSession)
        .set({ revokedAt: new Date() })
        .where('user_id = :userId AND revoked_at IS NULL', { userId: user.id })
        .execute();
    });

    return { message: 'Password reset successfully. Sign in with your new password.' };
  }

  async login(dto: LoginDto, ip: string): Promise<AuthResponseDto> {
    const startedAt = Date.now();
    await this.rateLimits.enforceLogin(ip, dto.email);
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      // Perform equivalent password work so unknown accounts are not a cheap timing oracle.
      await bcrypt.hash(dto.password, 10);
      await this.ensureMinimumResponseTime(startedAt);
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await this.usersService.validatePassword(dto.password, user.passwordHash);
    if (!passwordValid) {
      await this.usersService.recordFailedLogin(user.id);
      await this.ensureMinimumResponseTime(startedAt);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Account state is intentionally checked only after proof of password possession.
    // Otherwise PENDING_VERIFICATION/SUSPENDED/lock responses become an account-enumeration oracle.
    if (await this.usersService.isAccountLocked(user.id)) {
      throw new HttpException(
        'Account is temporarily locked. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.assertAccountEnabled(user);

    if (this.usersService.passwordHashNeedsUpgrade(user.passwordHash)) {
      await this.usersService.upgradePasswordHash(user.id, dto.password);
    }
    await this.usersService.resetFailedLoginAttempts(user.id);
    await this.usersService.updateLastLogin(user.id);
    return this.createSession(user);
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthResponseDto> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.tokenType !== 'refresh' || !payload.sub || !payload.sid) {
      throw new UnauthorizedException('Invalid refresh token type');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      await this.usersService.revokeSession(payload.sid);
      throw new UnauthorizedException('User no longer exists');
    }
    this.assertAccountEnabled(user);
    return this.rotateSession(user, payload.sid, refreshToken);
  }

  revokeSession(sessionId: string): Promise<void> {
    return this.usersService.revokeSession(sessionId);
  }

  private async issueActionToken(
    user: User,
    purpose: AccountActionTokenPurpose,
    lifetimeSeconds: number,
  ): Promise<void> {
    const rawToken = randomBytes(32).toString('base64url');
    await this.dataSource.transaction(async (manager) => {
      const lockedUser = await manager.findOne(User, {
        where: { id: user.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedUser) throw new BadRequestException('User no longer exists');

      await manager.update(
        AccountActionToken,
        { userId: lockedUser.id, purpose, consumedAt: IsNull() },
        { consumedAt: new Date() },
      );
      await manager.save(
        AccountActionToken,
        manager.create(AccountActionToken, {
          userId: lockedUser.id,
          purpose,
          tokenDigest: this.digestToken(rawToken),
          expiresAt: new Date(Date.now() + lifetimeSeconds * 1000),
          consumedAt: null,
        }),
      );

      if (purpose === AccountActionTokenPurpose.EMAIL_VERIFICATION) {
        await this.emailService.queueVerification(
          manager,
          lockedUser.email,
          lockedUser.fullName,
          rawToken,
        );
      } else {
        await this.emailService.queuePasswordReset(
          manager,
          lockedUser.email,
          lockedUser.fullName,
          rawToken,
        );
      }
    });
  }

  private assertUsableActionToken(
    token: AccountActionToken | null,
  ): asserts token is AccountActionToken {
    if (!token || token.consumedAt || token.expiresAt <= new Date()) {
      throw new BadRequestException('Invalid or expired token');
    }
  }

  private digestToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private async createSession(user: User): Promise<AuthResponseDto> {
    const sessionId = randomUUID();
    const response = await this.signTokenPair(user, sessionId);
    await this.usersService.saveSession(
      sessionId,
      user.id,
      this.digestToken(response.refresh_token),
      new Date(Date.now() + this.refreshLifetimeSeconds * 1000),
    );
    return response;
  }

  private async rotateSession(
    user: User,
    sessionId: string,
    presentedToken: string,
  ): Promise<AuthResponseDto> {
    const response = await this.signTokenPair(user, sessionId);
    await this.usersService.rotateSessionSecure(
      sessionId,
      user.id,
      this.digestToken(presentedToken),
      this.digestToken(response.refresh_token),
      new Date(Date.now() + this.refreshLifetimeSeconds * 1000),
    );
    return response;
  }

  private async signTokenPair(user: User, sessionId: string): Promise<AuthResponseDto> {
    const common = { sub: user.id, sid: sessionId, email: user.email, role: user.role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...common, jti: randomUUID(), tokenType: 'access' } satisfies JwtPayload,
        { secret: this.accessSecret, expiresIn: this.accessLifetimeSeconds },
      ),
      this.jwtService.signAsync(
        { ...common, jti: randomUUID(), tokenType: 'refresh' } satisfies JwtPayload,
        { secret: this.refreshSecret, expiresIn: this.refreshLifetimeSeconds },
      ),
    ]);
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        role: user.role,
        status: user.status,
      },
    };
  }

  private async ensureMinimumResponseTime(startedAt: number): Promise<void> {
    const remaining = 300 - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));
    }
  }

  private readPositiveInteger(key: string, fallback: number): number {
    const value = Number(this.config.get<string | number>(key) ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${key} must be a positive integer`);
    }
    return value;
  }

  private assertAccountEnabled(user: User): void {
    if (!user.emailVerified || user.status === UserStatus.PENDING_VERIFICATION) {
      throw new UnauthorizedException('Email verification is required');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not permitted to sign in');
    }
  }
}