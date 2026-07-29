import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserStatus } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../dtos/jwt-payload.dto';

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  email: string;
  role: JwtPayload['role'];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.tokenType !== 'access' || !payload.sub || !payload.sid) {
      throw new UnauthorizedException('Invalid access token');
    }

    const [user, session] = await Promise.all([
      this.usersService.findById(payload.sub),
      this.usersService.findSession(payload.sid),
    ]);

    if (
      !user ||
      !session ||
      session.userId !== user.id ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !user.emailVerified ||
      user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Access session is no longer valid');
    }

    return {
      userId: user.id,
      sessionId: session.id,
      email: user.email,
      role: user.role,
    };
  }
}
