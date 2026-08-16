import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID, createHash } from 'crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { User, UserStatus } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthResponseDto } from './dtos/auth-response.dto';
import { CompleteGoogleSignupDto, GoogleOnboardingResponseDto } from './dtos/google-auth.dto';
import { JwtPayload } from './dtos/jwt-payload.dto';
import { GoogleIdentityService, VerifiedGoogleIdentity } from './google-identity.service';

type GoogleOnboardingPayload = {
  tokenType: 'google-onboarding';
  googleSub: string;
  email: string;
  fullName: string;
  picture: string | null;
  jti: string;
  iat?: number;
  exp?: number;
};

type ExternalIdentityRow = { user_id: string; provider_subject: string };

@Injectable()
export class GoogleAuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessLifetimeSeconds: number;
  private readonly refreshLifetimeSeconds: number;
  private readonly onboardingLifetimeSeconds: number;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly rateLimits: AuthRateLimitService,
    private readonly googleIdentity: GoogleIdentityService,
    private readonly dataSource: DataSource,
  ) {
    this.accessSecret = this.config.getOrThrow<string>('JWT_SECRET');
    this.refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessLifetimeSeconds = this.readPositiveInteger('JWT_ACCESS_TTL_SECONDS', 900);
    this.refreshLifetimeSeconds = this.readPositiveInteger('JWT_REFRESH_TTL_SECONDS', 604800);
    this.onboardingLifetimeSeconds = this.readPositiveInteger('GOOGLE_ONBOARDING_TTL_SECONDS', 600);
  }

  async signIn(
    credential: string,
    ip: string,
  ): Promise<AuthResponseDto | GoogleOnboardingResponseDto> {
    await this.rateLimits.enforceProvider(ip, 'google');
    const identity = await this.googleIdentity.verifyCredential(credential);

    const linkedUserId = await this.findUserIdByGoogleSubject(identity.subject);
    if (linkedUserId) {
      const user = await this.usersService.findById(linkedUserId);
      if (!user) throw new UnauthorizedException('Linked account no longer exists');
      this.assertAccountEnabled(user);
      await this.touchIdentity(user.id, identity);
      await this.usersService.updateLastLogin(user.id);
      return this.createSession(user);
    }

    let user = await this.usersService.findByEmail(identity.email);
    if (!user) return this.createOnboardingResponse(identity);

    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DEACTIVATED) {
      throw new UnauthorizedException('Account is not permitted to sign in');
    }

    const existingLink = await this.findGoogleIdentityForUser(user.id);
    if (existingLink && existingLink.provider_subject !== identity.subject) {
      throw new UnauthorizedException('This account is linked to a different Google identity');
    }

    if (!user.emailVerified || user.status === UserStatus.PENDING_VERIFICATION) {
      await this.usersService.verifyEmail(user.id);
      user = await this.usersService.findById(user.id);
      if (!user) throw new UnauthorizedException('Account no longer exists');
    }
    this.assertAccountEnabled(user);

    await this.linkIdentity(user.id, identity);
    if (!user.profilePictureUrl && identity.picture) {
      await this.usersService.updateProfile(user.id, { profilePictureUrl: identity.picture });
      user.profilePictureUrl = identity.picture;
    }
    await this.usersService.updateLastLogin(user.id);
    return this.createSession(user);
  }

  async completeSignup(dto: CompleteGoogleSignupDto, ip: string): Promise<AuthResponseDto> {
    await this.rateLimits.enforceProvider(ip, 'google-signup');
    const onboarding = await this.verifyOnboardingToken(dto.onboarding_token);

    const linked = await this.findUserIdByGoogleSubject(onboarding.googleSub);
    if (linked) throw new ConflictException('This Google account is already linked');
    if (await this.usersService.findByEmail(onboarding.email)) {
      throw new ConflictException('An account with this email already exists');
    }

    const dateOfBirth = dto.date_of_birth ? new Date(dto.date_of_birth) : undefined;
    if (dateOfBirth && Number.isNaN(dateOfBirth.getTime())) {
      throw new BadRequestException('Invalid date of birth');
    }

    const generatedPassword = randomBytes(48).toString('base64url');
    let user = await this.usersService.createStudentAccount({
      fullName: onboarding.fullName,
      email: onboarding.email,
      password: generatedPassword,
      phoneNumber: dto.phone_number,
      studentNumber: dto.student_number,
      currentSemester: dto.current_semester,
      dateOfBirth,
    });
    await this.usersService.verifyEmail(user.id);
    if (onboarding.picture) {
      await this.usersService.updateProfile(user.id, { profilePictureUrl: onboarding.picture });
    }
    await this.linkIdentity(user.id, {
      subject: onboarding.googleSub,
      email: onboarding.email,
      fullName: onboarding.fullName,
      picture: onboarding.picture,
    });
    const refreshedUser = await this.usersService.findById(user.id);
    if (!refreshedUser) throw new UnauthorizedException('Account creation did not complete');
    user = refreshedUser;
    await this.usersService.updateLastLogin(user.id);
    return this.createSession(user);
  }

  private async createOnboardingResponse(identity: VerifiedGoogleIdentity): Promise<GoogleOnboardingResponseDto> {
    const onboardingToken = await this.jwtService.signAsync(
      {
        tokenType: 'google-onboarding',
        googleSub: identity.subject,
        email: identity.email,
        fullName: identity.fullName,
        picture: identity.picture,
        jti: randomUUID(),
      } satisfies Omit<GoogleOnboardingPayload, 'iat' | 'exp'>,
      { secret: this.accessSecret, expiresIn: this.onboardingLifetimeSeconds },
    );
    return {
      requires_onboarding: true,
      onboarding_token: onboardingToken,
      profile: {
        email: identity.email,
        full_name: identity.fullName,
        picture: identity.picture,
      },
    };
  }

  private async verifyOnboardingToken(token: string): Promise<GoogleOnboardingPayload> {
    let payload: GoogleOnboardingPayload;
    try {
      payload = await this.jwtService.verifyAsync<GoogleOnboardingPayload>(token, {
        secret: this.accessSecret,
      });
    } catch {
      throw new UnauthorizedException('Google onboarding session has expired');
    }
    if (
      payload.tokenType !== 'google-onboarding' ||
      !payload.googleSub ||
      !payload.email ||
      !payload.fullName ||
      !payload.jti
    ) {
      throw new UnauthorizedException('Invalid Google onboarding session');
    }
    return payload;
  }

  private async findUserIdByGoogleSubject(subject: string): Promise<string | null> {
    const rows = await this.dataSource.query(
      `SELECT user_id FROM external_auth_identities
       WHERE provider = 'GOOGLE' AND provider_subject = $1
       LIMIT 1`,
      [subject],
    ) as Array<{ user_id: string }>;
    return rows[0]?.user_id || null;
  }

  private async findGoogleIdentityForUser(userId: string): Promise<ExternalIdentityRow | null> {
    const rows = await this.dataSource.query(
      `SELECT user_id, provider_subject FROM external_auth_identities
       WHERE provider = 'GOOGLE' AND user_id = $1
       LIMIT 1`,
      [userId],
    ) as ExternalIdentityRow[];
    return rows[0] || null;
  }

  private async linkIdentity(userId: string, identity: VerifiedGoogleIdentity): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO external_auth_identities
          (user_id, provider, provider_subject, provider_email, last_used_at)
         VALUES ($1, 'GOOGLE', $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (provider, provider_subject) DO UPDATE
           SET provider_email = EXCLUDED.provider_email,
               last_used_at = CURRENT_TIMESTAMP
         RETURNING user_id`,
        [userId, identity.subject, identity.email],
      );
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505'
      ) {
        throw new ConflictException('This account is already linked to another Google identity');
      }
      throw error;
    }

    const linkedUserId = await this.findUserIdByGoogleSubject(identity.subject);
    if (linkedUserId !== userId) {
      throw new UnauthorizedException('Google identity is linked to another account');
    }
  }

  private async touchIdentity(userId: string, identity: VerifiedGoogleIdentity): Promise<void> {
    await this.dataSource.query(
      `UPDATE external_auth_identities
       SET provider_email = $1, last_used_at = CURRENT_TIMESTAMP
       WHERE user_id = $2 AND provider = 'GOOGLE' AND provider_subject = $3`,
      [identity.email, userId, identity.subject],
    );
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

  private digestToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private assertAccountEnabled(user: User): void {
    if (!user.emailVerified || user.status === UserStatus.PENDING_VERIFICATION) {
      throw new UnauthorizedException('Email verification is required');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not permitted to sign in');
    }
  }

  private readPositiveInteger(key: string, fallback: number): number {
    const value = Number(this.config.get<string | number>(key) ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${key} must be a positive integer`);
    }
    return value;
  }
}
