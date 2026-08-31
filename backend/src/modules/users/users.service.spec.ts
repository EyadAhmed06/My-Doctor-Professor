import { UnauthorizedException } from '@nestjs/common';
import { AuthSession } from './entities/auth-session.entity';
import { UsersService } from './users.service';

describe('UsersService rotateSessionSecure', () => {
  let service: UsersService;
  let mockSession: AuthSession | null;
  let savedSession: AuthSession | null = null;
  let updateResultAffected = 0;

  beforeEach(() => {
    mockSession = {
      id: 'session-123',
      userId: 'user-123',
      refreshTokenHash: 'old-hash',
      expiresAt: new Date(Date.now() + 60000),
      revokedAt: null,
      lastUsedAt: null,
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
      user: null as never,
    };
    savedSession = null;
    updateResultAffected = 0;

    const mockManager = {
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn(async () => ({ affected: updateResultAffected })),
      })),
      findOne: jest.fn(async () => mockSession),
      save: jest.fn(async (_entity: unknown, session: AuthSession) => {
        savedSession = session;
        return session;
      }),
    };

    const mockDataSource = {
      transaction: jest.fn(async (cb: (manager: unknown) => unknown) => cb(mockManager)),
    };

    service = new UsersService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      mockDataSource as never,
    );
  });

  it('rotates session when refresh token hash matches active unexpired session', async () => {
    updateResultAffected = 1;
    await expect(
      service.rotateSessionSecure(
        'session-123',
        'user-123',
        'old-hash',
        'new-hash',
        new Date(Date.now() + 120000),
      ),
    ).resolves.toBeUndefined();
  });

  it('revokes an expired session row when presented during rotation and throws UnauthorizedException', async () => {
    updateResultAffected = 0;
    mockSession!.expiresAt = new Date(Date.now() - 10000); // Expired

    await expect(
      service.rotateSessionSecure(
        'session-123',
        'user-123',
        'old-hash',
        'new-hash',
        new Date(Date.now() + 120000),
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(savedSession).not.toBeNull();
    expect(savedSession!.revokedAt).not.toBeNull();
  });

  it('revokes the session row when token reuse is detected', async () => {
    updateResultAffected = 0;
    mockSession!.lastUsedAt = new Date(Date.now() - 60000); // Beyond race grace period

    await expect(
      service.rotateSessionSecure(
        'session-123',
        'user-123',
        'old-hash',
        'new-hash',
        new Date(Date.now() + 120000),
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(savedSession).not.toBeNull();
    expect(savedSession!.revokedAt).not.toBeNull();
  });
});
