import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { GenerateEssayPracticeDto, SubmitEssayPracticeAnswerDto } from './dtos/essay-practice.dto';
import { EssayPracticeService } from './essay-practice.service';

@Controller('essay-practice')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
export class EssayPracticeController {
  constructor(private readonly practice: EssayPracticeService) {}

  @Post('generate')
  generate(@Body() dto: GenerateEssayPracticeDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.practice.generate(dto, actor);
  }

  @Get('attempts/:attemptId/workspace')
  workspace(@Param('attemptId') attemptId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.practice.workspace(attemptId, actor);
  }

  @Put('attempts/:attemptId/answers/:questionId')
  submitAnswer(
    @Param('attemptId') attemptId: string,
    @Param('questionId') questionId: string,
    @Body() dto: SubmitEssayPracticeAnswerDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.practice.submitAnswer(attemptId, questionId, dto, actor);
  }

  @Get('attempts/:attemptId/questions/:questionId/model-answer')
  modelAnswer(
    @Param('attemptId') attemptId: string,
    @Param('questionId') questionId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.practice.revealAnswer(attemptId, questionId, actor);
  }
}
