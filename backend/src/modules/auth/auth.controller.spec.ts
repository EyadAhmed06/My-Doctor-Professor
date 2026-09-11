import { ConflictException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { RATE_LIMIT_KEY, type RateLimitPolicy } from './decorators/rate-limit.decorator';
import { UserRole, UserStatus } from '../users/entities/user.entity';

const authResponse = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  user: {
    id: 'user-1',
    email: 'student@example.test',
    full_name: 'Student User',
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  },
};

const signupDto = {
  full_name: 'Student User',
  email: 'student@example.test',
  password: 'StrongPassword!123',
  phone_number: '+201000000000',
  student_number: 'S12345',
  current_semester: 1,
};

const genericSignupMessage = 'If registration can be completed, check your email to continue. Otherwise use sign in or account recovery.';

describe('AuthController web refresh transport', () => {
  function setup(nodeEnv = 'test', additionalOrigins?: string, cookiePath?: string) {
    const authService = {
      signup: jest.fn().mockResolvedValue({ message: 'Account created' }),
      login: jest.fn().mockResolvedValue(authResponse),
      refreshAccessToken: jest.fn().mockResolvedValue({ ...authResponse, refresh_token: 'rotated-refresh' }),
      revokeSession: jest.fn().mockResolvedValue(undefined),
    };
    const googleAuthService = {
      signIn: jest.fn(),
      completeSignup: jest.fn(),
    };
    const usersService = {
      getUserProfile: jest.fn(),
      getSecurityOverview: jest.fn(),
      revokeOtherSessions: jest.fn(),
    };
    const config = {
      get: jest.fn((key: string) => ({
        NODE_ENV: nodeEnv,
        JWT_REFRESH_TTL_SECONDS: 604800,
        FRONTEND_URL: nodeEnv === 'production' ? 'https://app.example.test' : 'http://localhost:3001',
        CORS_ORIGINS: additionalOrigins,
        AUTH_COOKIE_PATH: cookiePath,
      } as Record<string, unknown>)[key]),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret-test-32-chars-long';
        return 'test-secret';
      }),
    };
    const controller = new AuthController(
      authService as never,
      googleAuthService as never,
      usersService as never,
      config as never,
    );
    const cookie = jest.fn();
    const clearCookie = jest.fn();
    const response = { cookie, clearCookie } as unknown as Response;
    return { controller, authService, response, cookie, clearCookie };
  }

  function request(origin?: string, cookie?: string) {
    return {
      ip: '127.0.0.1',
      secure: false,
      protocol: 'http',
      socket: { remoteAddress: '127.0.0.1' },
      headers: { ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}) },
    } as unknown as Request;
  }

  it('keeps refresh credentials out of browser JSON and writes HttpOnly cookies', async () => {
    const { controller, response, cookie } = setup();
    const result = await controller.login(
      { email: 'student@example.test', password: 'password', remember: true },
      request('http://localhost:3001'),
      response,
    );

    expect(result).toEqual({ access_token: 'access-token', user: authResponse.user });
    expect(result).not.toHaveProperty('refresh_token');
    expect(cookie).toHaveBeenCalledWith(
      'mdp_refresh',
      'refresh-token',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/api/v1/auth', maxAge: 604800000 }),
    );
    expect(cookie).toHaveBeenCalledWith(
      'mdp_refresh_mode',
      'persistent',
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it('applies configured AUTH_COOKIE_PATH when supplied', async () => {
    const { controller, response, cookie } = setup('development', undefined, '/auth');
    await controller.login(
      { email: 'student@example.test', password: 'password', remember: true },
      request('http://localhost:3001'),
      response,
    );

    expect(cookie).toHaveBeenCalledWith(
      'mdp_refresh',
      'refresh-token',
      expect.objectContaining({ path: '/auth' }),
    );
  });

  it('preserves refresh token body fallback for non-browser API clients', async () => {
    const { controller, response, cookie } = setup();
    const result = await controller.login(
      { email: 'student@example.test', password: 'password', remember: false },
      request(),
      response,
    );

    expect(result).toEqual(authResponse);
    expect(cookie).toHaveBeenCalledWith(
      'mdp_refresh',
      'refresh-token',
      expect.not.objectContaining({ maxAge: expect.anything() }),
    );
  });

  it('blocks an untrusted browser origin before creating a login session or cookie', async () => {
    const { controller, authService, response, cookie } = setup();

    await expect(controller.login(
      { email: 'student@example.test', password: 'password', remember: true },
      request('https://evil.example.test'),
      response,
    )).rejects.toMatchObject({ message: 'Untrusted browser origin' });

    expect(authService.login.mock.calls).toHaveLength(0);
    expect(cookie).not.toHaveBeenCalled();
  });

  it('treats configured secondary frontend origins as browser clients and keeps refresh tokens out of JSON', async () => {
    const { controller, response } = setup('test', 'https://staging.example.test');

    const result = await controller.login(
      { email: 'student@example.test', password: 'password', remember: true },
      request('https://staging.example.test'),
      response,
    );

    expect(result).toEqual({ access_token: 'access-token', user: authResponse.user });
    expect(result).not.toHaveProperty('refresh_token');
  });

  it('rejects refresh from an untrusted browser origin before rotating the session', async () => {
    const { controller, authService, response } = setup();

    await expect(controller.refreshToken(
      { refresh_token: 'body-refresh-token' },
      request('https://evil.example.test'),
      response,
    )).rejects.toMatchObject({ message: 'Untrusted browser origin' });

    expect(authService.refreshAccessToken.mock.calls).toHaveLength(0);
  });

  it('rotates a refresh credential read from the HttpOnly cookie', async () => {
    const { controller, authService, response, cookie } = setup();
    const result = await controller.refreshToken(
      {},
      request('http://localhost:3001', 'mdp_refresh=old-refresh; mdp_refresh_mode=persistent'),
      response,
    );

    expect(authService.refreshAccessToken).toHaveBeenCalledWith('old-refresh');
    expect(result).toEqual({ access_token: 'access-token', user: authResponse.user });
    expect(cookie).toHaveBeenCalledWith(
      'mdp_refresh',
      'rotated-refresh',
      expect.objectContaining({ maxAge: 604800000, httpOnly: true }),
    );
  });

  it('forces Secure refresh cookies in production even when proxy protocol signals are missing', async () => {
    const { controller, response, cookie } = setup('production');

    await controller.login(
      { email: 'student@example.test', password: 'password', remember: true },
      request('https://app.example.test'),
      response,
    );

    expect(cookie).toHaveBeenCalledWith(
      'mdp_refresh',
      'refresh-token',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax' }),
    );
  });

  it('returns the same public signup response for a new account and an existing unique account field', async () => {
    const first = setup();
    const created = await first.controller.signup(signupDto as never);

    const duplicate = setup();
    duplicate.authService.signup.mockRejectedValueOnce(new ConflictException('Email or phone number is already registered'));
    const existing = await duplicate.controller.signup(signupDto as never);

    expect(created).toEqual({ message: genericSignupMessage });
    expect(existing).toEqual({ message: genericSignupMessage });
  });

  it('does not hide non-conflict signup failures', async () => {
    const { controller, authService } = setup();
    authService.signup.mockRejectedValueOnce(new Error('mail subsystem unavailable'));

    await expect(controller.signup(signupDto as never)).rejects.toThrow('mail subsystem unavailable');
  });

  it('applies explicit IP abuse budgets to signup and refresh routes', () => {
    const signupPolicy = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      // eslint-disable-next-line @typescript-eslint/unbound-method -- metadata is stored on the method function itself; it is not invoked here.
      AuthController.prototype.signup,
    ) as RateLimitPolicy;
    const refreshPolicy = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      // eslint-disable-next-line @typescript-eslint/unbound-method -- metadata is stored on the method function itself; it is not invoked here.
      AuthController.prototype.refreshToken,
    ) as RateLimitPolicy;

    expect(signupPolicy).toEqual({ key: 'auth-signup-route', maximum: 12, windowSeconds: 3600 });
    expect(refreshPolicy).toEqual({ key: 'auth-refresh-route', maximum: 120, windowSeconds: 900 });
  });
});