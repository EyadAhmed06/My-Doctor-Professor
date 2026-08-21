import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { SetAllowedPlansDto, UpdatePlanDto } from './dtos/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@Controller('subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('plans')
  listPlans() {
    return this.subscriptions.listPlans();
  }

  @Put('plans/:planId')
  @Roles(UserRole.SYSTEM_ADMIN)
  updatePlan(@Param('planId', uuid) planId: string, @Body() dto: UpdatePlanDto) {
    return this.subscriptions.updatePlan(planId, dto);
  }

  @Get('bundles')
  @Roles(UserRole.STUDENT)
  listBundles(@CurrentUser() actor: AuthenticatedUser) {
    return this.subscriptions.listBundlesForStudent(actor.userId);
  }

  @Post('bundles/:bundleId/open')
  @Roles(UserRole.STUDENT)
  openBundle(@Param('bundleId', uuid) bundleId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.subscriptions.openBundle(actor.userId, bundleId);
  }

  @Post('bundles/:bundleId/purchase')
  @Roles(UserRole.STUDENT)
  purchaseBundle(@Param('bundleId', uuid) bundleId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.subscriptions.purchaseBundle(actor.userId, bundleId);
  }

  @Get('bundles/:bundleId/allowed-plans')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  getAllowedPlans(@Param('bundleId', uuid) bundleId: string) {
    return this.subscriptions.allowedPlansFor(bundleId);
  }

  @Put('bundles/:bundleId/allowed-plans')
  @Roles(UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN)
  setAllowedPlans(
    @Param('bundleId', uuid) bundleId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SetAllowedPlansDto,
  ) {
    return this.subscriptions.setAllowedPlans(bundleId, actor, dto.plan_ids);
  }
}
