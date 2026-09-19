import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../users/entities/user.entity';

export const DENIED_ROLES_KEY = 'denied_roles';
export const DeniedRoles = (...roles: UserRole[]) => SetMetadata(DENIED_ROLES_KEY, roles);
