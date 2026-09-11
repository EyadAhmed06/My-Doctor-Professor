import { HttpException, HttpStatus } from '@nestjs/common';
import { RequestRateLimitGuard } from './request-rate-limit.guard';

function context(user?: { userId: string }) {
  const response = { setHeader: jest.fn() };
  return {
    response,
    value: {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({
        getRequest: () => ({ user, ip: '203.0.113.10', socket: {} }),
        getResponse: () => response,
      }),
    },
  };
}

describe('RequestRateLimitGuard', () => {
  it('uses a durable user budget after authentication', async () => {
    const enforceBudget = jest.fn().mockResolvedValue(undefined);
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    const guard = new RequestRateLimitGuard(reflector as never, { enforceBudget } as never);
    const test = context({ userId: 'student-id' });

    await expect(guard.canActivate(test.value as never)).resolves.toBe(true);
    expect(enforceBudget).toHaveBeenCalledWith('http:global:user:student-id', 1200, 900);
  });

  it('uses an IP budget for anonymous requests', async () => {
    const enforceBudget = jest.fn().mockResolvedValue(undefined);
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    const guard = new RequestRateLimitGuard(reflector as never, { enforceBudget } as never);
    const test = context();

    await guard.canActivate(test.value as never);
    expect(enforceBudget).toHaveBeenCalledWith('http:global:ip:203.0.113.10', 300, 900);
  });

  it('honors endpoint policy and exposes Retry-After on rejection', async () => {
    const exception = new HttpException(
      { message: 'Too many requests', retryAfter: 42 },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    const enforceBudget = jest.fn().mockRejectedValue(exception);
    const reflector = {
      getAllAndOverride: jest.fn()
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce({
          key: 'resource-upload',
          maximum: 20,
          windowSeconds: 3600,
        }),
    };
    const guard = new RequestRateLimitGuard(reflector as never, { enforceBudget } as never);
    const test = context({ userId: 'instructor-id' });

    await expect(guard.canActivate(test.value as never)).rejects.toBe(exception);
    expect(enforceBudget).toHaveBeenCalledWith(
      'http:resource-upload:user:instructor-id',
      20,
      3600,
    );
    expect(test.response.setHeader).toHaveBeenCalledWith('Retry-After', '42');
  });
});
