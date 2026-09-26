import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { CheckoutDto } from './dtos/subscription.dto';
import { PlanPurchasesService } from './plan-purchases.service';
import { SubscriptionsService } from './subscriptions.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@Controller('plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlansController {
  constructor(private readonly purchases: PlanPurchasesService) {}

  @Post(':planId/checkout')
  @Roles(UserRole.STUDENT)
  checkout(
    @Param('planId', uuid) planId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CheckoutDto,
  ) {
    return this.purchases.checkout(actor.userId, planId, dto);
  }
}

@Controller('users/me')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserPlansController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('plans')
  myActivePlans(@CurrentUser() actor: AuthenticatedUser) {
    return this.subscriptions.myActivePlans(actor.userId);
  }
}
