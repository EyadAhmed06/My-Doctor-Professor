import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { User, UserStatus } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthResponseDto } from './dtos/auth-response.dto';
import { JwtPayload } from './dtos/jwt-payload.dto';
import { LoginDto } from './dtos/login.dto';
import { SignupDto } from './dtos/signup.dto';

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessLifetimeSeconds: number;
  private readonly refreshLifetimeSeconds: number;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    this.accessSecret = this.config.getOrThrow<string>('JWT_SECRET');
    this.refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessLifetimeSeconds = this.config.get<number>('JWT_ACCESS_TTL_SECONDS', 900);
    this.refreshLifetimeSeconds = this.config.get<number>('JWT_REFRESH_TTL_SECONDS', 604800);
  }

  async signup(dto: SignupDto): Promise<AuthResponseDto> {
    const user = await this.usersService.createStudentAccount({
      fullName: dto.full_name,
      email: dto.email,
      password: dto.password,
      phoneNumber: dto.phone_number,
      studentNumber: dto.student_number,
      currentSemester: dto.current_semester,
      dateOfBirth: dto.date_of_birth ? new Date(dto.date_of_birth) : undefined,
      gender: dto.gender,
    });
    return this.createSession(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid email or password');

    this.assertAccountEnabled(user);
    if (await this.usersService.isAccountLocked(user.id)) {
      throw new HttpException('Account is temporarily locked. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    if (!(await this.usersService.validatePassword(dto.password, user.passwordHash))) {
      await this.usersService.recordFailedLogin(user.id);
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.usersService.resetFailedLoginAttempts(user.id);
    await this.usersService.updateLastLogin(user.id);
    return this.createSession(user);
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthResponseDto> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, { secret: this.refreshSecret });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.tokenType !== 'refresh' || !payload.sid) {
      throw new UnauthorizedException('Invalid refresh token type');
    }

    const session = await this.usersService.findSession(payload.sid);
    if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh session is no longer valid');
    }

    if (!(await bcrypt.compare(refreshToken, session.refreshTokenHash))) {
      await this.usersService.revokeSession(session.id);
      throw new UnauthorizedException('Refresh token reuse detected; session revoked');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      await this.usersService.revokeSession(session.id);
      throw new UnauthorizedException('User no longer exists');
    }
    this.assertAccountEnabled(user);

    return this.rotateSession(user, session.id);
  }

  revokeSession(sessionId: string): Promise<void> {
    return this.usersService.revokeSession(sessionId);
  }

  async validateAccessToken(token: string): Promise<JwtPayload> {
    const payload = await this.jwtService.verifyAsync<JwtPayload>(token, { secret: this.accessSecret });
    if (payload.tokenType !== 'access') throw new UnauthorizedException('Invalid access token type');
    return payload;
  }

  private async createSession(user: User): Promise<AuthResponseDto> {
    const sessionId = randomUUID();
    const response = await this.signTokenPair(user, sessionId);
    await this.usersService.saveSession(
      sessionId,
      user.id,
      await bcrypt.hash(response.refresh_token, 10),
      new Date(Date.now() + this.refreshLifetimeSeconds * 1000),
    );
    return response;
  }

  private async rotateSession(user: User, sessionId: string): Promise<AuthResponseDto> {
    const response = await this.signTokenPair(user, sessionId);
    await this.usersService.rotateSession(
      sessionId,
      await bcrypt.hash(response.refresh_token, 10),
      new Date(Date.now() + this.refreshLifetimeSeconds * 1000),
    );
    return response;
  }

  private async signTokenPair(user: User, sessionId: string): Promise<AuthResponseDto> {
    const common = { sub: user.id, sid: sessionId, email: user.email, role: user.role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync({ ...common, tokenType: 'access' } satisfies JwtPayload, { secret: this.accessSecret, expiresIn: this.accessLifetimeSeconds }),
      this.jwtService.signAsync({ ...common, tokenType: 'refresh' } satisfies JwtPayload, { secret: this.refreshSecret, expiresIn: this.refreshLifetimeSeconds }),
    ]);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: user.id, email: user.email, full_name: user.fullName, role: user.role, status: user.status },
    };
  }

  private assertAccountEnabled(user: User): void {
    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DEACTIVATED) {
      throw new UnauthorizedException('Account is not permitted to sign in');
    }
  }
}
