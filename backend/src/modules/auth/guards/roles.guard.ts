import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../users/entities/user.entity';
import { DENIED_ROLES_KEY } from '../decorators/denied-roles.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

interface AuthenticatedRequest {
  user?: { role?: UserRole };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.user?.role;
    const deniedRoles = this.reflector.getAllAndMerge<UserRole[]>(DENIED_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (role && deniedRoles?.includes(role)) {
      throw new ForbiddenException('This role cannot access teaching content');
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) return true;

    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
