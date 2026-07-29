import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthResponseDto, UserProfileDto } from './dtos/auth-response.dto';
import { ConfirmEmailVerificationDto, RequestEmailVerificationDto } from './dtos/email-verification.dto';
import { LoginDto } from './dtos/login.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dtos/password-reset.dto';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { SignupDto } from './dtos/signup.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthenticatedUser } from './strategies/jwt.strategy';

interface MessageResponse { message: string }

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
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
    return this.authService.requestEmailVerification(dto.email, request.ip);
  }

  @Post('email-verification/confirm')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  confirmEmailVerification(@Body() dto: ConfirmEmailVerificationDto): Promise<MessageResponse> {
    return this.authService.confirmEmailVerification(dto.token);
  }

  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<MessageResponse> {
    return this.authService.requestPasswordReset(dto.email, request.ip);
  }

  @Post('password/reset')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  resetPassword(@Body() dto: ResetPasswordDto): Promise<MessageResponse> {
    return this.authService.resetPassword(dto.token, dto.new_password, dto.confirm_password);
  }

  @Post('refresh')
  refreshToken(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refreshAccessToken(dto.refresh_token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getCurrentUser(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileDto> {
    return this.usersService.getUserProfile(user.userId);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.revokeSession(user.sessionId);
  }
}
