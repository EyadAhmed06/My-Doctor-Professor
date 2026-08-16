import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
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

  @Post('generate')
  @Roles(UserRole.STUDENT)
  generate(@Body() dto: GeneratePracticeTestDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.practice.generate(dto, actor);
  }
}
