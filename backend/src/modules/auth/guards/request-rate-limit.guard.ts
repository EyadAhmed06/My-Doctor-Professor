import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { AuthRateLimitService } from '../auth-rate-limit.service';
import { RATE_LIMIT_KEY, RateLimitPolicy } from '../decorators/rate-limit.decorator';

interface RequestUser { userId?: string }

@Injectable()
export class RequestRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limits: AuthRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const response = context.switchToHttp().getResponse<Response>();
    const configured = this.reflector.getAllAndOverride<RateLimitPolicy>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const authenticated = Boolean(request.user?.userId);
    const policy = configured ?? {
      key: 'global',
      maximum: authenticated ? 1200 : 300,
      windowSeconds: 15 * 60,
      scope: authenticated ? 'user' : 'ip',
    } satisfies RateLimitPolicy;

    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const identity = policy.scope === 'ip' || !request.user?.userId
      ? `ip:${ip}`
      : `user:${request.user.userId}`;

    try {
      await this.limits.enforceBudget(
        `http:${policy.key}:${identity}`,
        policy.maximum,
        policy.windowSeconds,
      );
      return true;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) {
        const body = error.getResponse();
        const retryAfter = typeof body === 'object' && body !== null
          ? Number((body as { retryAfter?: unknown }).retryAfter)
          : NaN;
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          response.setHeader('Retry-After', String(Math.ceil(retryAfter)));
        }
      }
      throw error;
    }
  }
}
