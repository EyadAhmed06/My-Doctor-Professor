import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuestionType } from '../../common/entities/question.entity';
import { TestQuestion } from '../../common/entities/test-question.entity';
import { TestType } from '../../common/entities/test.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { TestsService } from './tests.service';

const uuid = new ParseUUIDPipe({ version: '4' });
const FINAL_QUESTION_COUNT = 200;

@Controller('test-launch')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TestLaunchController {
  constructor(
    private readonly tests: TestsService,
    @InjectRepository(TestQuestion) private readonly testQuestions: Repository<TestQuestion>,
  ) {}

  @Get(':testId')
  async getLaunchConfig(
    @Param('testId', uuid) testId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const test = await this.tests.getOne(testId, actor);
    const assignments = await this.testQuestions.find({
      where: { testId },
      relations: { question: true },
      order: { displayOrder: 'ASC' },
    });
    const questionCount = assignments.length;
    const mcqCount = assignments.filter((item) => item.question.questionType === QuestionType.MCQ).length;
    const isFinal = test.testType === TestType.COURSE || /\bfinal\b/i.test(test.title);
    const issues: string[] = [];

    if (questionCount === 0) issues.push('This assessment has no questions yet.');
    if (isFinal && questionCount !== FINAL_QUESTION_COUNT) {
      issues.push(`Final exams require exactly ${FINAL_QUESTION_COUNT} questions; ${questionCount} are currently configured.`);
    }
    if (isFinal && mcqCount !== FINAL_QUESTION_COUNT) {
      issues.push(`Final exams require ${FINAL_QUESTION_COUNT} MCQs; ${mcqCount} configured questions are MCQs.`);
    }
    if (!isFinal && mcqCount !== questionCount) {
      issues.push(`${questionCount - mcqCount} non-MCQ question${questionCount - mcqCount === 1 ? '' : 's'} are included by the instructor.`);
    }

    return {
      test,
      question_count: questionCount,
      mcq_count: mcqCount,
      is_final: isFinal,
      required_question_count: isFinal ? FINAL_QUESTION_COUNT : questionCount,
      timed_available: Boolean(test.durationMinutes),
      launch_ready: questionCount > 0 && (!isFinal || (questionCount === FINAL_QUESTION_COUNT && mcqCount === FINAL_QUESTION_COUNT)),
      issues,
    };
  }
}
