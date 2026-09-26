import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RateLimit } from '../auth/decorators/rate-limit.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { GeneratePracticeTestDto, PracticeCatalogQueryDto } from './dtos/tests.dto';
import { McqPracticeCatalogService } from './mcq-practice-catalog.service';
import { McqPracticeService } from './mcq-practice.service';

@Controller('mcq-practice')
@UseGuards(JwtAuthGuard, RolesGuard)
export class McqPracticeController {
  constructor(
    private readonly practice: McqPracticeService,
    private readonly catalogService: McqPracticeCatalogService,
  ) {}

  @Get('catalog')
  @Roles(UserRole.STUDENT)
  catalog(
    @Query() query: PracticeCatalogQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.catalogService.catalog(query.bundle_id, query.course_id, actor);
  }

  @RateLimit({ key: 'practice-generate', maximum: 30, windowSeconds: 3600 })
  @Post('generate')
  @Roles(UserRole.STUDENT)
  generate(
    @Body() dto: GeneratePracticeTestDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.practice.generate(dto, actor, idempotencyKey);
  }
}
