import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AdminService } from './admin.service';
import { BootstrapAccountsDto } from './dtos/admin.dto';

@Controller('admin/bootstrap')
export class AdminBootstrapController {
  constructor(private readonly admin:AdminService) {}

  @Post('accounts')
  @HttpCode(HttpStatus.CREATED)
  bootstrapAccounts(
    @Headers('x-bootstrap-token') token:string|undefined,
    @Body() dto:BootstrapAccountsDto,
  ) {
    return this.admin.bootstrapAccounts(dto,token);
  }
}
