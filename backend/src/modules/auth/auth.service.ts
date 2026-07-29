import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/entities/user.entity';
import { LoginDto } from './dtos/login.dto';
import { SignupDto } from './dtos/signup.dto';
import { AuthResponseDto } from './dtos/auth-response.dto';
import { JwtPayload } from './dtos/jwt-payload.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if account is locked
    const isLocked = await this.usersService.isAccountLocked(user.id);
    if (isLocked) {
      throw new UnauthorizedException(
        'Account is temporarily locked due to multiple failed login attempts. Try again later.',
      );
    }

    // Validate password
    const isPasswordValid = await this.usersService.validatePassword(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      await this.usersService.recordFailedLogin(user.id);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Reset failed login attempts on successful login
    await this.usersService.resetFailedLoginAttempts(user.id);
    await this.usersService.updateLastLogin(user.id);

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        role: user.role,
        status: user.status,
      },
    };
  }

  async signup(signupDto: SignupDto): Promise<AuthResponseDto> {
    // Validate role
    if (!Object.values(UserRole).includes(signupDto.role)) {
      throw new BadRequestException('Invalid user role');
    }

    // Create user
    const user = await this.usersService.createUser({
      full_name: signupDto.full_name,
      email: signupDto.email,
      password: signupDto.password,
      phone_number: signupDto.phone_number,
      role: signupDto.role,
      date_of_birth: signupDto.date_of_birth
        ? new Date(signupDto.date_of_birth)
        : undefined,
      gender: signupDto.gender,
    });

    // Create role-specific profile
    switch (signupDto.role) {
      case UserRole.STUDENT:
        if (!signupDto.student_number) {
          throw new BadRequestException('Student number is required for students');
        }
        await this.usersService.createStudent(user, {
          student_number: signupDto.student_number,
          current_semester: signupDto.current_semester || 1,
        });
        break;

      case UserRole.INSTRUCTOR:
        await this.usersService.createInstructor(user, {
          specialization: signupDto.specialization,
          office_location: signupDto.office_location,
        });
        break;

      case UserRole.SYSTEM_ADMIN:
        await this.usersService.createSystemAdmin(user);
        break;
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        role: user.role,
        status: user.status,
      },
    };
  }

  private async generateTokens(
    user: User,
  ): Promise<{ access_token: string; refresh_token: string }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const access_token = this.jwtService.sign(payload, {
      expiresIn: '24h',
    });

    const refresh_token = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-key',
      expiresIn: '7d',
    });

    return { access_token, refresh_token };
  }

  async validateJwt(token: string): Promise<JwtPayload> {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthResponseDto> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-key',
      }) as JwtPayload;

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const tokens = await this.generateTokens(user);

      return {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.fullName,
          role: user.role,
          status: user.status,
        },
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}


