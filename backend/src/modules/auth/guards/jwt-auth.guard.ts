import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Several existing controllers still declare this guard locally. The global
    // guard has already authenticated those requests, so do not repeat the
    // database-backed session validation in the same request.
    const request = context.switchToHttp().getRequest<{ user?: unknown }>();
    if (request.user) return true;
    return super.canActivate(context);
  }
}
