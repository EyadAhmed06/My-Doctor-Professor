import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TestAttempt } from '../../common/entities/test-attempt.entity';
import { TestQuestion } from '../../common/entities/test-question.entity';
import { Test } from '../../common/entities/test.entity';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { ReorderTestQuestionsDto } from './dtos/tests.dto';

type ValidationIssue = {
  code: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
};

@Injectable()
export class AssessmentAuthoringService {
  constructor(
    @InjectRepository(Test) private readonly tests: Repository<Test>,
    @InjectRepository(TestQuestion) private readonly testQuestions: Repository<TestQuestion>,
    @InjectRepository(TestAttempt) private readonly attempts: Repository<TestAttempt>,
    private readonly dataSource: DataSource,
  ) {}

  async getAuthoringState(testId: string, actor: AuthenticatedUser) {
    const test = await this.requireOwnedTest(testId, actor);
    const items = await this.testQuestions.find({
      where: { testId },
      relations: { question: true },
      order: { displayOrder: 'ASC' },
    });
    const attemptCount = await this.attempts.count({ where: { testId } });
    const issues = this.validate(test, items);
    return {
      validation: {
        publishable: !issues.some((issue) => issue.severity === 'ERROR'),
        issues,
        question_count: items.length,
        total_marks: Number(test.totalMarks || 0),
      },
      permissions: {
        mutable: !test.isPublished && attemptCount === 0,
        can_unpublish: test.isPublished && attemptCount === 0,
        can_delete: !test.isPublished && attemptCount === 0,
        can_duplicate: true,
      },
      activity: [
        { type: 'CREATED', at: test.createdAt, label: 'Assessment created' },
        ...(test.updatedAt.getTime() !== test.createdAt.getTime() ? [{ type: 'UPDATED', at: test.updatedAt, label: 'Assessment definition updated' }] : []),
        ...(test.isPublished ? [{ type: 'PUBLISHED', at: test.updatedAt, label: 'Assessment is currently published' }] : []),
        ...(attemptCount ? [{ type: 'ATTEMPTS', at: test.updatedAt, label: `${attemptCount} attempt${attemptCount === 1 ? '' : 's'} recorded` }] : []),
        ...items.slice(-5).map((item) => ({ type: 'QUESTION_ATTACHED', at: item.createdAt, label: `Question added at position ${item.displayOrder}` })),
      ].sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime()),
    };
  }

  async duplicate(testId: string, actor: AuthenticatedUser) {
    const source = await this.requireOwnedTest(testId, actor);
    const items = await this.testQuestions.find({ where: { testId }, order: { displayOrder: 'ASC' } });
    return this.dataSource.transaction(async (manager) => {
      const copy = await manager.save(Test, manager.create(Test, {
        title: this.copyTitle(source.title),
        description: source.description,
        testType: source.testType,
        courseId: source.courseId,
        weekId: source.weekId,
        lectureId: source.lectureId,
        durationMinutes: source.durationMinutes,
        totalMarks: source.totalMarks,
        passingMarks: source.passingMarks,
        isPublished: false,
        availableFrom: source.availableFrom,
        availableUntil: source.availableUntil,
        createdBy: actor.userId,
      }));
      if (items.length) {
        await manager.save(TestQuestion, items.map((item) => manager.create(TestQuestion, {
          testId: copy.id,
          questionId: item.questionId,
          displayOrder: item.displayOrder,
          marks: item.marks,
          timeLimitSeconds: item.timeLimitSeconds,
        })));
      }
      return copy;
    });
  }

  async reorder(testId: string, dto: ReorderTestQuestionsDto, actor: AuthenticatedUser) {
    const test = await this.requireOwnedTest(testId, actor);
    if (test.isPublished) throw new ConflictException('Unpublish the assessment before reordering questions');
    if (await this.attempts.exists({ where: { testId } })) throw new ConflictException('Questions cannot be reordered after attempts exist');

    const current = await this.testQuestions.find({ where: { testId } });
    if (current.length !== dto.items.length) throw new BadRequestException('Reorder payload must include every attached question exactly once');
    const currentIds = new Set(current.map((item) => item.questionId));
    const questionIds = dto.items.map((item) => item.question_id);
    const orderValues = dto.items.map((item) => item.display_order);
    if (new Set(questionIds).size !== questionIds.length || questionIds.some((id) => !currentIds.has(id))) {
      throw new BadRequestException('Reorder payload contains duplicate or unknown questions');
    }
    if (new Set(orderValues).size !== orderValues.length) throw new BadRequestException('Display orders must be unique');
    const expected = Array.from({ length: current.length }, (_, index) => index + 1);
    if ([...orderValues].sort((a, b) => a - b).some((value, index) => value !== expected[index])) {
      throw new BadRequestException('Display orders must form a continuous sequence starting at 1');
    }

    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(TestQuestion);
      for (let index = 0; index < current.length; index += 1) {
        await repository.update({ id: current[index].id }, { displayOrder: -(index + 1) });
      }
      for (const item of dto.items) {
        const record = current.find((currentItem) => currentItem.questionId === item.question_id)!;
        await repository.update({ id: record.id }, { displayOrder: item.display_order });
      }
    });

    return this.testQuestions.find({
      where: { testId },
      relations: { question: { options: true, essayConfiguration: true } },
      order: { displayOrder: 'ASC' },
    });
  }

  private validate(test: Test, items: TestQuestion[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const total = Number(test.totalMarks || 0);
    const passing = Number(test.passingMarks || 0);
    if (!items.length) issues.push({ code: 'NO_QUESTIONS', severity: 'ERROR', message: 'Attach at least one active question before publishing.' });
    if (items.some((item) => !item.question?.isActive)) issues.push({ code: 'INACTIVE_QUESTIONS', severity: 'ERROR', message: 'One or more attached questions are inactive.' });
    if (items.some((item) => Number(item.marks) <= 0)) issues.push({ code: 'INVALID_MARKS', severity: 'ERROR', message: 'Every attached question must award more than zero marks.' });
    if (total <= 0) issues.push({ code: 'ZERO_TOTAL', severity: 'ERROR', message: 'Total marks must be greater than zero.' });
    if (!test.durationMinutes || test.durationMinutes <= 0) issues.push({ code: 'INVALID_DURATION', severity: 'ERROR', message: 'Set a positive assessment duration.' });
    if (passing > total && total > 0) issues.push({ code: 'PASS_ABOVE_TOTAL', severity: 'ERROR', message: 'Passing marks cannot exceed total marks.' });
    if (test.availableFrom && test.availableUntil && test.availableUntil <= test.availableFrom) issues.push({ code: 'INVALID_WINDOW', severity: 'ERROR', message: 'Availability end must be after availability start.' });
    if (!test.courseId && !test.weekId && !test.lectureId) issues.push({ code: 'UNSCOPED', severity: 'WARNING', message: 'This assessment is not linked to a course, week, or lecture.' });
    const order = items.map((item) => item.displayOrder);
    const expected = Array.from({ length: items.length }, (_, index) => index + 1);
    if ([...order].sort((a, b) => a - b).some((value, index) => value !== expected[index])) issues.push({ code: 'ORDER_GAPS', severity: 'WARNING', message: 'Question order has gaps. Reorder before publishing for predictable navigation.' });
    return issues;
  }

  private async requireOwnedTest(id: string, actor: AuthenticatedUser) {
    const test = await this.tests.findOne({ where: { id } });
    if (!test) throw new NotFoundException('Test not found');
    if (actor.role === UserRole.INSTRUCTOR && test.createdBy !== actor.userId) throw new ForbiddenException('You can manage only your own assessments');
    if (![UserRole.INSTRUCTOR, UserRole.SYSTEM_ADMIN].includes(actor.role as UserRole)) throw new ForbiddenException('Instructor access is required');
    return test;
  }

  private copyTitle(title: string) {
    const suffix = ' (Copy)';
    return `${title.slice(0, Math.max(1, 200 - suffix.length))}${suffix}`;
  }
}