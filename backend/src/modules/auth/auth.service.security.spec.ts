import { UnauthorizedException } from '@nestjs/common';
import { UserRole, UserStatus } from '../users/entities/user.entity';
import { AuthService } from './auth.service';

const pendingUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'pending@example.test',
  fullName: 'Pending Student',
  role: UserRole.STUDENT,
  status: UserStatus.PENDING_VERIFICATION,
  emailVerified: false,
  passwordHash: '$2b$10$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvabcd',
};

function buildService(passwordValid: boolean) {
  const usersService = {
    findByEmail: jest.fn().mockResolvedValue(pendingUser),
    validatePassword: jest.fn().mockResolvedValue(passwordValid),
    recordFailedLogin: jest.fn().mockResolvedValue(undefined),
    isAccountLocked: jest.fn().mockResolvedValue(false),
    passwordHashNeedsUpgrade: jest.fn().mockReturnValue(false),
    resetFailedLoginAttempts: jest.fn().mockResolvedValue(undefined),
    updateLastLogin: jest.fn().mockResolvedValue(undefined),
    saveSession: jest.fn().mockResolvedValue(undefined),
  };
  const jwtService = { signAsync: jest.fn().mockResolvedValue('token') };
  const config = {
    getOrThrow: jest.fn((key: string) => key === 'JWT_SECRET'
      ? 'a'.repeat(40)
      : 'b'.repeat(40)),
    get: jest.fn(() => undefined),
  };
  const emailService = {};
  const rateLimits = { enforceLogin: jest.fn().mockResolvedValue(undefined) };
  const dataSource = {};
  const service = new AuthService(
    usersService as never,
    jwtService as never,
    config as never,
    emailService as never,
    rateLimits as never,
    dataSource as never,
  );
  return { service, usersService };
}

describe('AuthService security', () => {
  it('does not reveal pending-verification state when the password is wrong', async () => {
    const { service, usersService } = buildService(false);

    await expect(service.login({
      email: pendingUser.email,
      password: 'wrong-password',
      remember: true,
    }, '127.0.0.1')).rejects.toMatchObject({
      message: 'Invalid email or password',
    });

    expect(usersService.recordFailedLogin).toHaveBeenCalledWith(pendingUser.id);
    expect(usersService.isAccountLocked).not.toHaveBeenCalled();
  });

  it('reveals verification state only after the caller proves password possession', async () => {
    const { service, usersService } = buildService(true);

    await expect(service.login({
      email: pendingUser.email,
      password: 'correct-password',
      remember: true,
    }, '127.0.0.1')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.login({
      email: pendingUser.email,
      password: 'correct-password',
      remember: true,
    }, '127.0.0.1')).rejects.toMatchObject({
      message: 'Email verification is required',
    });

    expect(usersService.isAccountLocked).toHaveBeenCalledWith(pendingUser.id);
  });
});
