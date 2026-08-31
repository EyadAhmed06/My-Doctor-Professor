import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from './decorators/public.decorator';
import {
  RequestPasswordResetOtpDto,
  VerifyPasswordResetOtpDto,
} from './dtos/password-reset-otp.dto';
import { PasswordResetOtpService } from './password-reset-otp.service';

interface MessageResponse {
  message: string;
}

interface VerifyResponse extends MessageResponse {
  reset_token: string;
}

@Controller('auth/password/otp')
export class PasswordResetOtpController {
  constructor(private readonly passwordResetOtp: PasswordResetOtpService) {}

  @Public()
  @Post('request')
  @HttpCode(HttpStatus.ACCEPTED)
  requestCode(
    @Body() dto: RequestPasswordResetOtpDto,
    @Req() request: Request,
  ): Promise<MessageResponse> {
    return this.passwordResetOtp.requestCode(
      dto.email,
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
    );
  }

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  verifyCode(
    @Body() dto: VerifyPasswordResetOtpDto,
    @Req() request: Request,
  ): Promise<VerifyResponse> {
    return this.passwordResetOtp.verifyCode(
      dto.email,
      dto.code,
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
    );
  }
}
