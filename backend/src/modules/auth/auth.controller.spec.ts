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

describe('AuthController web refresh transport', () => {
  function setup(nodeEnv = 'test') {
    const authService = {
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
      } as Record<string, unknown>)[key]),
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

  it('applies explicit IP abuse budgets to signup and refresh routes', () => {
    const signupPolicy = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      AuthController.prototype.signup,
    ) as RateLimitPolicy;
    const refreshPolicy = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      AuthController.prototype.refreshToken,
    ) as RateLimitPolicy;

    expect(signupPolicy).toEqual({ key: 'auth-signup-route', maximum: 12, windowSeconds: 3600 });
    expect(refreshPolicy).toEqual({ key: 'auth-refresh-route', maximum: 120, windowSeconds: 900 });
  });
});