import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
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

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body() dto: LoginDto,
    @Req() request: Request,
  ): Promise<AuthResponseDto> {
    return this.authService.login(dto, request.ip ?? request.socket.remoteAddress ?? 'unknown');
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  googleSignIn(
    @Body() dto: GoogleCredentialDto,
    @Req() request: Request,
  ): Promise<AuthResponseDto | GoogleOnboardingResponseDto> {
    return this.googleAuthService.signIn(
      dto.credential,
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
    );
  }

  @Post('google/signup')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  completeGoogleSignup(
    @Body() dto: CompleteGoogleSignupDto,
    @Req() request: Request,
  ): Promise<AuthResponseDto> {
    return this.googleAuthService.completeSignup(
      dto,
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
    );
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
  refreshToken(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refreshAccessToken(dto.refresh_token);
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
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.revokeSession(user.sessionId);
  }
}
