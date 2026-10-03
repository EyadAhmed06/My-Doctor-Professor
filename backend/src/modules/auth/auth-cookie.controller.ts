import { Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';

const REFRESH_COOKIE = 'mdp_refresh';
const REFRESH_MODE_COOKIE = 'mdp_refresh_mode';

@Controller('auth')
export class AuthCookieController {
  private readonly production: boolean;

  constructor(private readonly config: ConfigService) {
    this.production = config.get<string>('NODE_ENV') === 'production';
  }

  @Post('session-cookie/clear')
  @HttpCode(HttpStatus.NO_CONTENT)
  clearSessionCookie(@Res({ passthrough: true }) response: Response): void {
    const options: CookieOptions = {
      httpOnly: true,
      secure: this.production,
      sameSite: 'lax',
      path: this.config.get<string>('AUTH_COOKIE_PATH')?.trim() || '/api/v1/auth',
    };
    response.clearCookie(REFRESH_COOKIE, options);
    response.clearCookie(REFRESH_MODE_COOKIE, options);
  }
}
