import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { CreatePromoCodeDto, UpdatePromoCodeDto } from './dtos/subscription.dto';
import { PromoCodesService } from './promo-codes.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@Controller('admin/promo-codes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYSTEM_ADMIN)
export class PromoCodesController {
  constructor(private readonly promoCodes: PromoCodesService) {}

  @Get()
  list() {
    return this.promoCodes.listAll();
  }

  @Post()
  create(@Body() dto: CreatePromoCodeDto) {
    return this.promoCodes.create(dto);
  }

  @Put(':promoCodeId')
  update(@Param('promoCodeId', uuid) promoCodeId: string, @Body() dto: UpdatePromoCodeDto) {
    return this.promoCodes.update(promoCodeId, dto);
  }
}
