import { UserRole } from '../../users/entities/user.entity';

export type TokenType = 'access' | 'refresh';

export class JwtPayload {
  sub: string;
  sid: string;
  jti: string;
  email: string;
  role: UserRole;
  tokenType: TokenType;
  iat?: number;
  exp?: number;
}
