import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthResponseDto, UserProfileDto } from './dtos/auth-response.dto';
import { ConfirmEmailVerificationDto, RequestEmailVerificationDto } from './dtos/email-verification.dto';
import { CompleteGoogleSignupDto, GoogleCredentialDto, GoogleOnboardingResponseDto } from './dtos/google-auth.dto';
import { LoginDto } from './dtos/login.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dtos/password-reset.dto';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { SignupDto } from './dtos/signup.dto';
import { GoogleAuthService } from './google-auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedUser } from './strategies/jwt.strategy';

interface MessageResponse { message: string }
const REFRESH_COOKIE = 'mdp_refresh';
const REFRESH_MODE_COOKIE = 'mdp_refresh_mode';

@Controller('auth')
export class AuthController {
  private readonly refreshLifetimeSeconds: number;
  private readonly production: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {
    this.refreshLifetimeSeconds = this.readPositiveInteger('JWT_REFRESH_TTL_SECONDS', 604800);
    this.production = this.config.get<string>('NODE_ENV') === 'production';
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const auth = await this.authService.login(dto, request.ip ?? request.socket.remoteAddress ?? 'unknown');
    this.writeRefreshCookies(response, auth.refresh_token, dto.remember !== false);
    return auth;
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async googleSignIn(
    @Body() dto: GoogleCredentialDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto | GoogleOnboardingResponseDto> {
    const result = await this.googleAuthService.signIn(
      dto.credential,
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
    );
    if ('refresh_token' in result) {
      this.writeRefreshCookies(response, result.refresh_token, dto.remember !== false);
    }
    return result;
  }

  @Post('google/signup')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  async completeGoogleSignup(
    @Body() dto: CompleteGoogleSignupDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const auth = await this.googleAuthService.completeSignup(
      dto,
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
    );
    this.writeRefreshCookies(response, auth.refresh_token, true);
    return auth;
  }

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  signup(@Body() dto: SignupDto): Promise<MessageResponse> {
    return this.authService.signup(dto);
  }

  @Post('email-verification/request')
  @HttpCode(HttpStatus.ACCEPTED)
  requestEmailVerification(
    @Body() dto: RequestEmailVerificationDto,
    @Req() request: Request,
  ): Promise<MessageResponse> {
    return this.authService.requestEmailVerification(dto.email, request.ip ?? request.socket.remoteAddress ?? 'unknown');
  }

  @Post('email-verification/confirm')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  confirmEmailVerification(
    @Body() dto: ConfirmEmailVerificationDto,
    @Req() request: Request,
  ): Promise<MessageResponse> {
    return this.authService.confirmEmailVerification(dto.token, request.ip ?? request.socket.remoteAddress ?? 'unknown');
  }

  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<MessageResponse> {
    return this.authService.requestPasswordReset(dto.email, request.ip ?? request.socket.remoteAddress ?? 'unknown');
  }

  @Post('password/reset')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() request: Request,
  ): Promise<MessageResponse> {
    return this.authService.resetPassword(
      dto.token,
      dto.new_password,
      dto.confirm_password,
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async refreshToken(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const refreshToken = dto.refresh_token || this.readCookie(request, REFRESH_COOKIE);
    if (!refreshToken) throw new UnauthorizedException('Refresh session is required');
    const persistent = this.readCookie(request, REFRESH_MODE_COOKIE) === 'persistent';
    const auth = await this.authService.refreshAccessToken(refreshToken);
    this.writeRefreshCookies(response, auth.refresh_token, persistent);
    return auth;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getCurrentUser(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileDto> {
    return this.usersService.getUserProfile(user.userId);
  }

  @Get('security')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  getSecurityOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getSecurityOverview(user.userId, user.sessionId);
  }

  @Post('sessions/revoke-others')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeOtherSessions(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.usersService.revokeOtherSessions(user.userId, user.sessionId);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.revokeSession(user.sessionId);
    this.clearRefreshCookies(response);
  }

  private writeRefreshCookies(response: Response, refreshToken: string, persistent: boolean) {
    const base: CookieOptions = {
      httpOnly: true,
      secure: this.production,
      sameSite: 'lax',
      path: '/api/v1/auth',
    };
    const maxAge = persistent ? this.refreshLifetimeSeconds * 1000 : undefined;
    response.cookie(REFRESH_COOKIE, refreshToken, { ...base, ...(maxAge ? { maxAge } : {}) });
    response.cookie(REFRESH_MODE_COOKIE, persistent ? 'persistent' : 'session', { ...base, ...(maxAge ? { maxAge } : {}) });
  }

  private clearRefreshCookies(response: Response) {
    const options: CookieOptions = {
      httpOnly: true,
      secure: this.production,
      sameSite: 'lax',
      path: '/api/v1/auth',
    };
    response.clearCookie(REFRESH_COOKIE, options);
    response.clearCookie(REFRESH_MODE_COOKIE, options);
  }

  private readCookie(request: Request, name: string): string | null {
    const header = request.headers.cookie;
    if (!header) return null;
    for (const part of header.split(';')) {
      const separator = part.indexOf('=');
      if (separator < 0) continue;
      if (part.slice(0, separator).trim() !== name) continue;
      const value = part.slice(separator + 1).trim();
      try { return decodeURIComponent(value); } catch { return value; }
    }
    return null;
  }

  private readPositiveInteger(key: string, fallback: number): number {
    const value = Number(this.config.get<string | number>(key) ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`);
    return value;
  }
}
