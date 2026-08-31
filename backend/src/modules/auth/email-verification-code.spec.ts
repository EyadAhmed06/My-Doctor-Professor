import { createHmac } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { AccountActionToken, AccountActionTokenPurpose } from './entities/account-action-token.entity';

const ACCESS_SECRET = 'a'.repeat(40);
const REFRESH_SECRET = 'b'.repeat(40);

function pendingUser(): User {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'student@example.test',
    fullName: 'Student Example',
    role: UserRole.STUDENT,
    status: UserStatus.PENDING_VERIFICATION,
    emailVerified: false,
  } as User;
}

function buildService(overrides?: {
  user?: User | null;
  token?: AccountActionToken | null;
}) {
  const user = overrides?.user === undefined ? pendingUser() : overrides.user;
  const token = overrides?.token === undefined
    ? ({
        id: '22222222-2222-4222-8222-222222222222',
        userId: user?.id ?? '11111111-1111-4111-8111-111111111111',
        purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION,
        tokenDigest: '',
        expiresAt: new Date(Date.now() + 10 * 60_000),
        consumedAt: null,
      } as AccountActionToken)
    : overrides.token;

  const usersService = {
    createStudentAccount: jest.fn().mockResolvedValue(user),
    findByEmail: jest.fn().mockResolvedValue(user),
  };
  const jwtService = {};
  const config = {
    getOrThrow: jest.fn((key: string) => key === 'JWT_SECRET' ? ACCESS_SECRET : REFRESH_SECRET),
    get: jest.fn(() => undefined),
  };
  const emailService = {
    queueVerification: jest.fn().mockResolvedValue(undefined),
  };
  const rateLimits = {
    enforceEmailVerificationCode: jest.fn().mockResolvedValue(undefined),
  };

  const manager = {
    findOne: jest.fn(async (entity: unknown) => entity === User ? user : token),
    update: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((_entity: unknown, value: unknown) => value),
    save: jest.fn(async (_entity: unknown, value?: unknown) => value ?? _entity),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: (manager: typeof manager) => unknown) => callback(manager)),
  };

  const service = new AuthService(
    usersService as never,
    jwtService as never,
    config as never,
    emailService as never,
    rateLimits as never,
    dataSource as never,
  );

  return { service, usersService, emailService, rateLimits, manager, dataSource, user, token };
}

describe('six-digit email verification', () => {
  it('issues a six-digit single-use code with a ten-minute lifetime on signup', async () => {
    const { service, emailService, manager, user } = buildService();

    await service.signup({
      full_name: user!.fullName,
      email: user!.email,
      password: 'StrongPassword2026',
      phone_number: '+201000000000',
      role: UserRole.STUDENT,
      current_semester: 1,
    });

    expect(manager.update).toHaveBeenCalledWith(
      AccountActionToken,
      expect.objectContaining({
        userId: user!.id,
        purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION,
      }),
      expect.objectContaining({ consumedAt: expect.any(Date) }),
    );

    expect(emailService.queueVerification).toHaveBeenCalledTimes(1);
    const [, email, fullName, code, lifetimeSeconds] = emailService.queueVerification.mock.calls[0];
    expect(email).toBe(user!.email);
    expect(fullName).toBe(user!.fullName);
    expect(code).toMatch(/^\d{6}$/);
    expect(lifetimeSeconds).toBe(600);

    const createdToken = manager.create.mock.calls.find(([entity]) => entity === AccountActionToken)?.[1] as {
      tokenDigest: string;
    };
    expect(createdToken.tokenDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(createdToken.tokenDigest).not.toBe(code);
  });

  it('activates a pending account when the submitted code matches', async () => {
    const user = pendingUser();
    const code = '314159';
    const digest = createHmac('sha256', ACCESS_SECRET)
      .update(`email-verification:${user.id}:${code}`)
      .digest('hex');
    const token = {
      id: '22222222-2222-4222-8222-222222222222',
      userId: user.id,
      purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION,
      tokenDigest: digest,
      expiresAt: new Date(Date.now() + 5 * 60_000),
      consumedAt: null,
    } as AccountActionToken;
    const { service, rateLimits, manager } = buildService({ user, token });

    await expect(
      service.confirmEmailVerificationCode(user.email, code, '203.0.113.8'),
    ).resolves.toEqual({
      message: 'Email verified successfully. You can now sign in.',
    });

    expect(rateLimits.enforceEmailVerificationCode).toHaveBeenCalledWith(
      '203.0.113.8',
      user.email,
    );
    expect(manager.findOne).toHaveBeenCalledWith(
      AccountActionToken,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: user.id,
          tokenDigest: digest,
          purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION,
        }),
      }),
    );
    expect(user.emailVerified).toBe(true);
    expect(user.status).toBe(UserStatus.ACTIVE);
    expect(token.consumedAt).toBeInstanceOf(Date);
  });

  it('rejects verification for an unknown account without revealing a valid code', async () => {
    const { service } = buildService({ user: null, token: null });

    await expect(
      service.confirmEmailVerificationCode('missing@example.test', '123456', '203.0.113.8'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
