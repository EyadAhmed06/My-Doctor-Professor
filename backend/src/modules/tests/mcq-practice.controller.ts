import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RateLimit } from '../auth/decorators/rate-limit.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { GeneratePracticeTestDto } from './dtos/tests.dto';
import { McqPracticeService } from './mcq-practice.service';

@Controller('mcq-practice')
@UseGuards(JwtAuthGuard, RolesGuard)
export class McqPracticeController {
  constructor(private readonly practice: McqPracticeService) {}

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