import { Body, Controller, Header, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { ConfirmEmailVerificationCodeDto } from './dtos/email-verification-code.dto';

interface MessageResponse {
  message: string;
}

@Controller('auth/email-verification')
export class EmailVerificationCodeController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('confirm-code')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  confirmCode(
    @Body() dto: ConfirmEmailVerificationCodeDto,
    @Req() request: Request,
  ): Promise<MessageResponse> {
    return this.authService.confirmEmailVerificationCode(
      dto.email,
      dto.code,
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
    );
  }
}
