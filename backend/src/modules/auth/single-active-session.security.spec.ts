import { ConflictException, HttpStatus } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AdminService } from '../admin/admin.service';
import { AuthSession } from '../users/entities/auth-session.entity';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';

describe('Single Active Session Policy', () => {
  const studentUser: User = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'student@example.test',
    fullName: 'Student User',
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
    emailVerified: true,
    phoneNumber: '+201000000001',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$fakehash',
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    profilePictureUrl: null,
    dateOfBirth: null,
    gender: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const instructorUser: User = {
    ...studentUser,
    id: '22222222-2222-4222-8222-222222222222',
    email: 'instructor@example.test',
    role: UserRole.INSTRUCTOR,
  };

  const adminUser: User = {
    ...studentUser,
    id: '33333333-3333-4333-8333-333333333333',
    email: 'admin@example.test',
    role: UserRole.SYSTEM_ADMIN,
  };

  let mockSessions: AuthSession[] = [];

  function createMockUsersService() {
    return {
      findByEmail: jest.fn(async (email: string) => {
        if (email === studentUser.email) return studentUser;
        if (email === instructorUser.email) return instructorUser;
        if (email === adminUser.email) return adminUser;
        return null;
      }),
      findById: jest.fn(async (id: string) => {
        if (id === studentUser.id) return studentUser;
        if (id === instructorUser.id) return instructorUser;
        if (id === adminUser.id) return adminUser;
        return null;
      }),
      validatePassword: jest.fn(async () => true),
      isAccountLocked: jest.fn(async () => false),
      passwordHashNeedsUpgrade: jest.fn(() => false),
      resetFailedLoginAttempts: jest.fn(async () => undefined),
      updateLastLogin: jest.fn(async () => undefined),
      recordFailedLogin: jest.fn(async () => undefined),
      revokeExpiredSessions: jest.fn(async (userId: string) => {
        const now = new Date();
        let count = 0;
        mockSessions.forEach((s) => {
          if (s.userId === userId && !s.revokedAt && s.expiresAt <= now) {
            s.revokedAt = now;
            count++;
          }
        });
        return count;
      }),
      hasActiveSession: jest.fn(async (userId: string) => {
        const now = new Date();
        return mockSessions.some(
          (s) => s.userId === userId && !s.revokedAt && s.expiresAt > now,
        );
      }),
      saveSession: jest.fn(
        async (
          id: string,
          userId: string,
          refreshTokenHash: string,
          expiresAt: Date,
          ipAddress?: string | null,
          userAgent?: string | null,
        ) => {
          // Simulate database partial unique index constraint: uq_auth_sessions_active_user
          const activeDuplicate = mockSessions.find(
            (s) => s.userId === userId && !s.revokedAt,
          );
          if (activeDuplicate) {
            const error = new QueryFailedError(
              'INSERT INTO auth_sessions ...',
              [],
              new Error('duplicate key value violates unique constraint "uq_auth_sessions_active_user"'),
            );
            (error as QueryFailedError & { driverError: { code: string } }).driverError = { code: '23505' };
            throw error;
          }
          mockSessions.push({
            id,
            userId,
            refreshTokenHash,
            expiresAt,
            revokedAt: null,
            lastUsedAt: null,
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null,
            createdAt: new Date(),
            user: null as never,
          });
        },
      ),
      revokeSession: jest.fn(async (id: string) => {
        const s = mockSessions.find((session) => session.id === id);
        if (s) s.revokedAt = new Date();
      }),
      revokeAllSessions: jest.fn(async (userId: string) => {
        const now = new Date();
        mockSessions.forEach((s) => {
          if (s.userId === userId && !s.revokedAt) {
            s.revokedAt = now;
          }
        });
      }),
    };
  }

  function createAuthServices(usersService: ReturnType<typeof createMockUsersService>) {
    const jwtService = {
      signAsync: jest.fn().mockResolvedValue('mocked.jwt.token'),
    };
    const config = {
      getOrThrow: jest.fn((key: string) =>
        key === 'JWT_SECRET' ? 'a'.repeat(40) : 'b'.repeat(40),
      ),
      get: jest.fn((key: string) => {
        if (key === 'AUTH_SINGLE_SESSION_ROLES') return 'STUDENT';
        if (key === 'AUTH_SINGLE_SESSION_EXEMPT_ROLES') return 'INSTRUCTOR,SYSTEM_ADMIN';
        return undefined;
      }),
    };
    const emailService = {};
    const rateLimits = {
      enforceLogin: jest.fn().mockResolvedValue(undefined),
      enforceProvider: jest.fn().mockResolvedValue(undefined),
    };
    const googleIdentity = {
      verifyCredential: jest.fn().mockResolvedValue({
        subject: 'google-sub-student-1',
        email: studentUser.email,
        fullName: studentUser.fullName,
        picture: null,
      }),
    };
    const dataSource = {
      query: jest.fn().mockImplementation(async (sql: string, _params?: unknown[]) => {
        if (sql.includes("provider = 'GOOGLE' AND provider_subject = $1")) {
          return [{ user_id: studentUser.id }];
        }
        return [];
      }),
    };

    const authService = new AuthService(
      usersService as never,
      jwtService as never,
      config as never,
      emailService as never,
      rateLimits as never,
      dataSource as never,
    );

    const googleAuthService = new GoogleAuthService(
      usersService as never,
      jwtService as never,
      config as never,
      rateLimits as never,
      googleIdentity as never,
      dataSource as never,
    );

    return { authService, googleAuthService };
  }

  beforeEach(() => {
    mockSessions = [];
  });

  it('1. refuses second student login attempt when a live session exists (ACTIVE_SESSION_EXISTS 409)', async () => {
    const usersService = createMockUsersService();
    const { authService } = createAuthServices(usersService);

    // Initial student login succeeds
    const firstLogin = await authService.login(
      { email: studentUser.email, password: 'password123', remember: true },
      '192.168.1.1',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
    );
    expect(firstLogin).toBeDefined();
    expect(firstLogin.access_token).toBeDefined();
    expect(mockSessions).toHaveLength(1);
    expect(mockSessions[0].ipAddress).toBe('192.168.1.1');
    expect(mockSessions[0].userAgent).toContain('Chrome/120.0');

    // Second login attempt from another device is refused with 409 Conflict
    let caughtError: unknown;
    try {
      await authService.login(
        { email: studentUser.email, password: 'password123', remember: true },
        '10.0.0.5',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148',
      );
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(ConflictException);
    const response = (caughtError as ConflictException).getResponse() as {
      statusCode: number;
      error: string;
      message: string;
    };
    expect(response.statusCode).toBe(HttpStatus.CONFLICT);
    expect(response.error).toBe('ACTIVE_SESSION_EXISTS');
    expect(response.message).toContain('active session already exists');
    // Ensure no IP or device details of the existing session are leaked in the error
    expect(JSON.stringify(response)).not.toContain('192.168.1.1');
    expect(JSON.stringify(response)).not.toContain('Chrome/120.0');

    // Existing session was NOT evicted
    expect(mockSessions[0].revokedAt).toBeNull();
  });

  it('2. succeeds when logging in after logout on the held device', async () => {
    const usersService = createMockUsersService();
    const { authService } = createAuthServices(usersService);

    // Initial login
    await authService.login(
      { email: studentUser.email, password: 'password123', remember: true },
      '192.168.1.1',
    );
    expect(mockSessions).toHaveLength(1);

    // User logs out on first device
    await authService.revokeSession(mockSessions[0].id);
    expect(mockSessions[0].revokedAt).not.toBeNull();

    // Second login on new device now succeeds
    const secondLogin = await authService.login(
      { email: studentUser.email, password: 'password123', remember: true },
      '10.0.0.5',
    );
    expect(secondLogin).toBeDefined();
    expect(mockSessions.filter((s) => !s.revokedAt)).toHaveLength(1);
  });

  it('3. reclaims expired sessions before inspecting live slots so subsequent login succeeds', async () => {
    const usersService = createMockUsersService();
    const { authService } = createAuthServices(usersService);

    // Pre-populate an expired session that was not explicitly revoked
    mockSessions.push({
      id: 'old-expired-session-id',
      userId: studentUser.id,
      refreshTokenHash: 'hash',
      expiresAt: new Date(Date.now() - 1000 * 60 * 60), // Expired 1 hour ago
      revokedAt: null,
      lastUsedAt: null,
      ipAddress: '192.168.1.1',
      userAgent: 'Old Browser',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      user: null as never,
    });

    // Login reclaims dead slot and succeeds
    const login = await authService.login(
      { email: studentUser.email, password: 'password123', remember: true },
      '192.168.1.2',
    );
    expect(login).toBeDefined();
    expect(mockSessions.find((s) => s.id === 'old-expired-session-id')?.revokedAt).not.toBeNull();
    expect(mockSessions.filter((s) => !s.revokedAt)).toHaveLength(1);
  });

  it('4. converts database unique violation (23505) during concurrent login races into ACTIVE_SESSION_EXISTS', async () => {
    const usersService = createMockUsersService();
    const { authService } = createAuthServices(usersService);

    // Simulate pre-check passing for both concurrent requests (both see no active session)
    usersService.hasActiveSession.mockResolvedValue(false);

    // First login succeeds and inserts
    await authService.login(
      { email: studentUser.email, password: 'password123', remember: true },
      '192.168.1.1',
    );

    // Second simultaneous login encounters DB partial unique index violation (23505)
    let caughtError: unknown;
    try {
      await authService.login(
        { email: studentUser.email, password: 'password123', remember: true },
        '192.168.1.2',
      );
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(ConflictException);
    const response = (caughtError as ConflictException).getResponse() as {
      statusCode: number;
      error: string;
    };
    expect(response.statusCode).toBe(HttpStatus.CONFLICT);
    expect(response.error).toBe('ACTIVE_SESSION_EXISTS');
  });

  it('5. enforces single active session identically for Google sign-in', async () => {
    const usersService = createMockUsersService();
    const { googleAuthService } = createAuthServices(usersService);

    // First Google sign-in creates active session
    const firstGoogle = await googleAuthService.signIn(
      'google-jwt-credential',
      '192.168.1.1',
      'GoogleApp/1.0',
    );
    expect(firstGoogle).toBeDefined();
    expect('access_token' in firstGoogle).toBe(true);

    // Second Google sign-in while first is live is refused with ACTIVE_SESSION_EXISTS
    let caughtError: unknown;
    try {
      await googleAuthService.signIn(
        'google-jwt-credential',
        '10.0.0.8',
        'GoogleApp/2.0',
      );
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(ConflictException);
    const response = (caughtError as ConflictException).getResponse() as {
      statusCode: number;
      error: string;
    };
    expect(response.statusCode).toBe(HttpStatus.CONFLICT);
    expect(response.error).toBe('ACTIVE_SESSION_EXISTS');
  });

  it('6. exempts instructors and administrators from login refusal to avoid lockout', async () => {
    const usersService = createMockUsersService();
    const { authService } = createAuthServices(usersService);

    // Instructor login 1
    await authService.login(
      { email: instructorUser.email, password: 'password123', remember: true },
      '192.168.1.1',
    );
    expect(mockSessions.filter((s) => s.userId === instructorUser.id && !s.revokedAt)).toHaveLength(1);

    // Instructor login 2 from another device succeeds and clears prior session
    const instructorLogin2 = await authService.login(
      { email: instructorUser.email, password: 'password123', remember: true },
      '10.0.0.2',
    );
    expect(instructorLogin2).toBeDefined();
    expect(mockSessions.filter((s) => s.userId === instructorUser.id && !s.revokedAt)).toHaveLength(1);

    // System admin login 1
    await authService.login(
      { email: adminUser.email, password: 'password123', remember: true },
      '192.168.1.1',
    );
    expect(mockSessions.filter((s) => s.userId === adminUser.id && !s.revokedAt)).toHaveLength(1);

    // System admin login 2 from another device succeeds without refusal
    const adminLogin2 = await authService.login(
      { email: adminUser.email, password: 'password123', remember: true },
      '10.0.0.3',
    );
    expect(adminLogin2).toBeDefined();
    expect(mockSessions.filter((s) => s.userId === adminUser.id && !s.revokedAt)).toHaveLength(1);
  });

  it('7. allows admin force-release to revoke live sessions and free the slot', async () => {
    const usersService = createMockUsersService();
    const { authService } = createAuthServices(usersService);

    // Student logs in on held device
    await authService.login(
      { email: studentUser.email, password: 'password123', remember: true },
      '192.168.1.100',
      'Device A',
    );
    expect(mockSessions.filter((s) => s.userId === studentUser.id && !s.revokedAt)).toHaveLength(1);

    // Student tries to log in on Device B and is refused
    await expect(
      authService.login(
        { email: studentUser.email, password: 'password123', remember: true },
        '192.168.1.200',
        'Device B',
      ),
    ).rejects.toThrow(ConflictException);

    // Admin force releases sessions
    const adminActor = {
      userId: adminUser.id,
      sessionId: 'admin-session-id',
      email: adminUser.email,
      role: UserRole.SYSTEM_ADMIN,
    };

    const mockAdminRepo = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () =>
          mockSessions.filter((s) => s.userId === studentUser.id),
        ),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        execute: jest.fn(async () => {
          let affected = 0;
          mockSessions.forEach((s) => {
            if (s.userId === studentUser.id && !s.revokedAt) {
              s.revokedAt = new Date();
              affected++;
            }
          });
          return { affected };
        }),
      })),
      findOne: jest.fn(async () => null),
      save: jest.fn(async (s) => s),
    };

    const adminDataSource = {
      getRepository: jest.fn(() => mockAdminRepo),
    };

    const adminService = new AdminService(
      { findOne: jest.fn().mockResolvedValue(studentUser) } as never,
      {} as never,
      {} as never,
      { findOne: jest.fn().mockResolvedValue({ userId: adminUser.id, isSuperAdmin: true }) } as never,
      usersService as never,
      authService as never,
      adminDataSource as never,
      { get: jest.fn(() => undefined) } as never,
    );

    // Admin inspects user sessions
    const sessionList = await adminService.getUserSessions(studentUser.id, adminActor);
    expect(sessionList.sessions).toHaveLength(1);
    expect(sessionList.sessions[0].ip_address).toBe('192.168.1.100');
    expect(sessionList.sessions[0].user_agent).toBe('Device A');

    // Admin force-revokes user sessions
    const revokeResult = await adminService.revokeUserSessions(studentUser.id, adminActor);
    expect(revokeResult.revoked_count).toBe(1);
    expect(mockSessions.find((s) => s.userId === studentUser.id)?.revokedAt).not.toBeNull();

    // Student is now able to log in on Device B
    const deviceBLogin = await authService.login(
      { email: studentUser.email, password: 'password123', remember: true },
      '192.168.1.200',
      'Device B',
    );
    expect(deviceBLogin).toBeDefined();
    expect(mockSessions.filter((s) => s.userId === studentUser.id && !s.revokedAt)).toHaveLength(1);
  });
});
