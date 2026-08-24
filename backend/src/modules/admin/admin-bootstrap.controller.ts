import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AdminService } from './admin.service';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimit } from '../auth/decorators/rate-limit.decorator';
import { BootstrapAccountsDto } from './dtos/admin.dto';

@Public()
@Controller('admin/bootstrap')
export class AdminBootstrapController {
  constructor(private readonly admin:AdminService) {}

  @Post('accounts')
  @RateLimit({ key: 'admin-bootstrap', maximum: 5, windowSeconds: 3600, scope: 'ip' })
  @HttpCode(HttpStatus.CREATED)
  bootstrapAccounts(
    @Headers('x-bootstrap-token') token:string|undefined,
    @Body() dto:BootstrapAccountsDto,
  ) {
    return this.admin.bootstrapAccounts(dto,token);
  }
}
