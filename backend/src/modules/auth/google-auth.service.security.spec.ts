import { ConflictException } from '@nestjs/common';
import { UserRole, UserStatus } from '../users/entities/user.entity';
import { GoogleAuthService } from './google-auth.service';

const identity = {
  subject: 'google-subject-1',
  email: 'student@example.test',
  fullName: 'Student User',
  picture: null,
};

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: identity.email,
  fullName: identity.fullName,
  role: UserRole.STUDENT,
  status: UserStatus.ACTIVE,
  emailVerified: true,
  profilePictureUrl: null,
};

function setup(queryImpl?: (sql: string, params?: unknown[]) => unknown) {
  const usersService = {
    findByEmail: jest.fn().mockResolvedValue(user),
    findById: jest.fn().mockResolvedValue(user),
    updateProfile: jest.fn().mockResolvedValue(undefined),
    updateLastLogin: jest.fn().mockResolvedValue(undefined),
    saveSession: jest.fn().mockResolvedValue(undefined),
  };
  const jwtService = { signAsync: jest.fn().mockResolvedValue('token') };
  const config = {
    getOrThrow: jest.fn((key: string) => key === 'JWT_SECRET' ? 'a'.repeat(40) : 'b'.repeat(40)),
    get: jest.fn(() => undefined),
  };
  const rateLimits = { enforceProvider: jest.fn().mockResolvedValue(undefined) };
  const googleIdentity = { verifyCredential: jest.fn().mockResolvedValue(identity) };
  const dataSource = {
    query: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => queryImpl?.(sql, params) ?? []),
  };
  const service = new GoogleAuthService(
    usersService as never,
    jwtService as never,
    config as never,
    rateLimits as never,
    googleIdentity as never,
    dataSource as never,
  );
  return { service, usersService, googleIdentity, dataSource };
}

describe('GoogleAuthService security', () => {
  it('does not auto-link a Google identity to an existing password account by email alone', async () => {
    const { service, dataSource } = setup((sql) => {
      if (sql.includes('provider_subject = $1')) return [];
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(service.signIn('credential', '127.0.0.1'))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(service.signIn('credential', '127.0.0.1'))
      .rejects.toThrow('Sign in with your existing method');

    expect(dataSource.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO external_auth_identities'),
      expect.anything(),
    );
  });

  it('rejects authenticated linking when the verified Google email differs from the signed-in account', async () => {
    const { service, googleIdentity } = setup();
    googleIdentity.verifyCredential.mockResolvedValue({ ...identity, email: 'other@example.test' });

    await expect(service.linkExistingAccount('credential', {
      userId: user.id,
      sessionId: '22222222-2222-4222-8222-222222222222',
      email: user.email,
      role: user.role,
    }, '127.0.0.1')).rejects.toThrow('Google email must match');
  });

  it('links a matching Google identity only after authenticated account ownership is established', async () => {
    let subjectLookupCount = 0;
    const { service, dataSource } = setup((sql) => {
      if (sql.includes("provider = 'GOOGLE' AND provider_subject = $1")) {
        subjectLookupCount += 1;
        return subjectLookupCount === 1 ? [] : [{ user_id: user.id }];
      }
      if (sql.includes("provider = 'GOOGLE' AND user_id = $1")) return [];
      if (sql.includes('INSERT INTO external_auth_identities')) return [{ user_id: user.id }];
      return [];
    });

    const result = await service.linkExistingAccount('credential', {
      userId: user.id,
      sessionId: '22222222-2222-4222-8222-222222222222',
      email: user.email,
      role: user.role,
    }, '127.0.0.1');

    expect(result.message).toContain('linked successfully');
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO external_auth_identities'),
      [user.id, identity.subject, identity.email],
    );
  });
});
