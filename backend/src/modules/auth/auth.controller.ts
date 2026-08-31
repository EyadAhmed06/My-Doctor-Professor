import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
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
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions, Request, Response } from 'express';
import { UsersService } from '../users/users.service';
import { isAllowedOrigin, parseAllowedOrigins } from '../../config/cors-policy';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { RateLimit } from './decorators/rate-limit.decorator';
import { AuthResponseDto, UserProfileDto } from './dtos/auth-response.dto';
import { ConfirmEmailVerificationDto, RequestEmailVerificationDto } from './dtos/email-verification.dto';
import { CompleteGoogleSignupDto, GoogleCredentialDto, GoogleOnboardingResponseDto } from './dtos/google-auth.dto';
import { JwtPayload } from './dtos/jwt-payload.dto';
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
const SIGNUP_RESPONSE = 'If registration can be completed, check your email to continue. Otherwise use sign in or account recovery.';

@Controller('auth')
export class AuthController {
  private readonly refreshLifetimeSeconds: number;
  private readonly refreshSecret: string;
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(
    private readonly authService: AuthService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.refreshLifetimeSeconds = this.readPositiveInteger('JWT_REFRESH_TTL_SECONDS', 604800);
    this.refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.allowedOrigins = parseAllowedOrigins(
      this.config.get('FRONTEND_URL'),
      this.config.get('CORS_ORIGINS'),
      this.config.get('NODE_ENV'),
    );
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    this.assertTrustedBrowserOriginIfPresent(request);
    const userAgent = (request.headers['user-agent'] as string) || null;
    const auth = await this.authService.login(
      dto,
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
      userAgent,
    );
    this.writeRefreshCookies(request, response, auth.refresh_token, dto.remember !== false);
    return this.forTransport(auth, request);
  }

  @Public()
  @Get('google/config')
  @Header('Cache-Control', 'public, max-age=300')
  googleConfiguration(): { enabled: boolean; client_id: string | null } {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim() || null;
    return { enabled: Boolean(clientId), client_id: clientId };
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async googleSignIn(
    @Body() dto: GoogleCredentialDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto | GoogleOnboardingResponseDto> {
    this.assertTrustedBrowserOriginIfPresent(request);
    const userAgent = (request.headers['user-agent'] as string) || null;
    const result = await this.googleAuthService.signIn(
      dto.credential,
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
      userAgent,
    );
    if ('refresh_token' in result) {
      this.writeRefreshCookies(request, response, result.refresh_token, dto.remember !== false);
      return this.forTransport(result, request);
    }
    return result;
  }

  @Public()
  @Post('google/signup')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  async completeGoogleSignup(
    @Body() dto: CompleteGoogleSignupDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    this.assertTrustedBrowserOriginIfPresent(request);
    const userAgent = (request.headers['user-agent'] as string) || null;
    const auth = await this.googleAuthService.completeSignup(
      dto,
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
      userAgent,
    );
    this.writeRefreshCookies(request, response, auth.refresh_token, true);
    return this.forTransport(auth, request);
  }

  @Post('google/link')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  linkGoogleAccount(
    @Body() dto: GoogleCredentialDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<MessageResponse> {
    return this.googleAuthService.linkExistingAccount(
      dto.credential,
      actor,
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
    );
  }

  @Public()
  @RateLimit({ key: 'auth-signup-route', maximum: 12, windowSeconds: 3600 })
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() dto: SignupDto): Promise<MessageResponse> {
    try {
      await this.authService.signup(dto);
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
    }
    return { message: SIGNUP_RESPONSE };
  }

  @Public()
  @Post('email-verification/request')
  @HttpCode(HttpStatus.ACCEPTED)
  requestEmailVerification(
    @Body() dto: RequestEmailVerificationDto,
    @Req() request: Request,
  ): Promise<MessageResponse> {
    return this.authService.requestEmailVerification(dto.email, request.ip ?? request.socket.remoteAddress ?? 'unknown');
  }

  @Public()
  @Post('email-verification/confirm')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  confirmEmailVerification(
    @Body() dto: ConfirmEmailVerificationDto,
    @Req() request: Request,
  ): Promise<MessageResponse> {
    return this.authService.confirmEmailVerification(dto.token, request.ip ?? request.socket.remoteAddress ?? 'unknown');
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<MessageResponse> {
    return this.authService.requestPasswordReset(dto.email, request.ip ?? request.socket.remoteAddress ?? 'unknown');
  }

  @Public()
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

  @Public()
  @RateLimit({ key: 'auth-refresh-route', maximum: 120, windowSeconds: 900 })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async refreshToken(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    this.assertTrustedBrowserOriginIfPresent(request);
    const cookieToken = this.readCookie(request, REFRESH_COOKIE);
    if (!dto.refresh_token && cookieToken) this.assertTrustedCookieOrigin(request);
    const refreshToken = dto.refresh_token || cookieToken;
    if (!refreshToken) throw new UnauthorizedException('Refresh session is required');
    const persistent = this.readCookie(request, REFRESH_MODE_COOKIE) === 'persistent';
    const auth = await this.authService.refreshAccessToken(refreshToken);
    this.writeRefreshCookies(request, response, auth.refresh_token, persistent);
    return this.forTransport(auth, request);
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
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.revokeSession(user.sessionId);
    this.clearRefreshCookies(request, response);
  }

  @Public()
  @Post('logout/browser')
  @HttpCode(HttpStatus.NO_CONTENT)
  async browserLogout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const refreshToken = this.readCookie(request, REFRESH_COOKIE);
    if (refreshToken) {
      this.assertTrustedCookieOrigin(request);
      try {
        const payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
          secret: this.refreshSecret,
        });
        if (payload.tokenType === 'refresh' && payload.sid) {
          await this.authService.revokeSession(payload.sid);
        }
      } catch {
        // Logout is idempotent. An expired or malformed cookie must still be cleared.
      }
    }
    this.clearRefreshCookies(request, response);
  }

  private assertTrustedBrowserOriginIfPresent(request: Request): void {
    const origin = request.headers.origin;
    if (origin && !isAllowedOrigin(origin, this.allowedOrigins)) {
      throw new ForbiddenException('Untrusted browser origin');
    }
  }

  private assertTrustedCookieOrigin(request: Request): void {
    const origin = request.headers.origin;
    if (!origin || !isAllowedOrigin(origin, this.allowedOrigins)) {
      throw new ForbiddenException('Untrusted browser origin');
    }
  }

  private forTransport(auth: AuthResponseDto, request: Request): AuthResponseDto {
    if (!this.isFrontendBrowserRequest(request)) return auth;
    const { refresh_token: refreshToken, ...browserAuth } = auth;
    void refreshToken;
    return browserAuth as AuthResponseDto;
  }

  private isFrontendBrowserRequest(request: Request): boolean {
    const origin = request.headers.origin;
    return Boolean(origin && isAllowedOrigin(origin, this.allowedOrigins));
  }

  private writeRefreshCookies(
    request: Request,
    response: Response,
    refreshToken: string,
    persistent: boolean,
  ) {
    const base = this.refreshCookieOptions(request);
    const maxAge = persistent ? this.refreshLifetimeSeconds * 1000 : undefined;
    response.cookie(REFRESH_COOKIE, refreshToken, { ...base, ...(maxAge ? { maxAge } : {}) });
    response.cookie(REFRESH_MODE_COOKIE, persistent ? 'persistent' : 'session', { ...base, ...(maxAge ? { maxAge } : {}) });
  }

  private clearRefreshCookies(request: Request, response: Response) {
    const options = this.refreshCookieOptions(request);
    response.clearCookie(REFRESH_COOKIE, options);
    response.clearCookie(REFRESH_MODE_COOKIE, options);
  }

  private refreshCookieOptions(request: Request): CookieOptions {
    const forwardedProtocol = request.headers['x-forwarded-proto'];
    const protocol = Array.isArray(forwardedProtocol)
      ? forwardedProtocol[0]
      : forwardedProtocol?.split(',')[0]?.trim();
    const secure = this.config.get<string>('NODE_ENV') === 'production'
      || request.secure
      || protocol === 'https';
    return {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/api/v1/auth',
    };
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