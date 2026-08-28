import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { McqOption } from '../../common/entities/mcq-option.entity';
import { Question, QuestionType } from '../../common/entities/question.entity';
import { StudentAnswer } from '../../common/entities/student-answer.entity';
import { TestAttempt, TestAttemptStatus, TestMode } from '../../common/entities/test-attempt.entity';
import { TestQuestion } from '../../common/entities/test-question.entity';
import { Test } from '../../common/entities/test.entity';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { Student } from '../users/entities/student.entity';
import { SaveAnswerDto, StartTestAttemptDto } from './dtos/tests.dto';

@Injectable()
export class AssessmentAttemptService {
  constructor(
    @InjectRepository(Test) private readonly tests: Repository<Test>,
    @InjectRepository(TestQuestion) private readonly testQuestions: Repository<TestQuestion>,
    @InjectRepository(TestAttempt) private readonly attempts: Repository<TestAttempt>,
    @InjectRepository(StudentAnswer) private readonly answers: Repository<StudentAnswer>,
    @InjectRepository(McqOption) private readonly options: Repository<McqOption>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    private readonly dataSource: DataSource,
  ) {}

  async startAttempt(testId: string, dto: StartTestAttemptDto, actor: AuthenticatedUser) {
    const test = await this.requireTest(testId);
    this.assertAvailable(test);
    await this.assertStudentTestAccess(test, actor.userId);
    if (!(await this.students.exists({ where: { userId: actor.userId } }))) {
      throw new ForbiddenException('Student profile is required to start an attempt');
    }
    const assignments = await this.testQuestions.find({
      where: { testId },
      relations: { question: { options: true } },
    });
    if (!assignments.length) throw new ConflictException('Test has no questions');
    this.assertMcqIntegrity(assignments.map((item) => item.question));
    if (dto.test_mode === TestMode.TIMED && !test.durationMinutes) {
      throw new ConflictException('Timed mode is unavailable because this test has no duration');
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`assessment-start:${actor.userId}:${testId}`],
      );
      const repository = manager.getRepository(TestAttempt);
      const active = await repository.findOne({
        where: { testId, studentId: actor.userId, status: TestAttemptStatus.IN_PROGRESS },
        lock: { mode: 'pessimistic_write' },
      });
      if (active) {
        active.test = test;
        if (this.deadlineReached(active, test)) {
          await this.finalizeLockedAttempt(manager, active, test, true);
        } else if (active.testMode === dto.test_mode) {
          return active;
        } else {
          throw new ConflictException(`An active ${active.testMode.toLowerCase()} attempt already exists for this test`);
        }
      }
      const now = new Date();
      const attempt = repository.create({
        studentId: actor.userId,
        testId,
        testMode: dto.test_mode,
        status: TestAttemptStatus.IN_PROGRESS,
        score: null,
        startedAt: now,
        submittedAt: null,
        lastActivityAt: now,
        autoSubmitted: false,
      });
      return repository.save(attempt);
    });
  }

  async saveAnswer(attemptId: string, questionId: string, dto: SaveAnswerDto, actor: AuthenticatedUser) {
    const result = await this.dataSource.transaction(async (manager) => {
      const { attempt, test } = await this.lockAttempt(manager, attemptId, actor);
      if (attempt.status !== TestAttemptStatus.IN_PROGRESS) {
        throw new ConflictException('Attempt is no longer open');
      }
      if (this.deadlineReached(attempt, test)) {
        await this.finalizeLockedAttempt(manager, attempt, test, true);
        return { expired: true as const, value: null };
      }

      const assignment = await manager.getRepository(TestQuestion).findOne({
        where: { testId: attempt.testId, questionId },
        relations: { question: { essayConfiguration: true } },
      });
      if (!assignment) throw new NotFoundException('Question is not assigned to this attempt');
      const question = assignment.question;
      let selectedOption: McqOption | null = null;
      let essayAnswer: string | null = null;

      if (question.questionType === QuestionType.MCQ) {
        if (!dto.selected_option_id || dto.essay_answer !== undefined || !dto.confidence_level) {
          throw new BadRequestException('MCQ answers require selected_option_id and confidence_level');
        }
        selectedOption = await manager.getRepository(McqOption).findOne({
          where: { id: dto.selected_option_id, questionId },
        });
        if (!selectedOption) throw new BadRequestException('Selected option does not belong to this question');
      } else {
        if (dto.selected_option_id !== undefined || !dto.essay_answer?.trim()) {
          throw new BadRequestException('Essay answers require a non-empty essay_answer only');
        }
        essayAnswer = dto.essay_answer.trim();
        const words = essayAnswer.split(/\s+/).length;
        const config = question.essayConfiguration;
        if (config?.minimumWordCount && words < config.minimumWordCount) {
          throw new BadRequestException(`Essay requires at least ${config.minimumWordCount} words`);
        }
        if (config?.maximumWordCount && words > config.maximumWordCount) {
          throw new BadRequestException(`Essay cannot exceed ${config.maximumWordCount} words`);
        }
      }

      const repository = manager.getRepository(StudentAnswer);
      let answer = await repository.findOne({ where: { attemptId, questionId } });
      answer ??= repository.create({ attemptId, questionId });
      answer.selectedOptionId = selectedOption?.id ?? null;
      answer.essayAnswer = essayAnswer;
      answer.confidenceLevel = question.questionType === QuestionType.MCQ ? dto.confidence_level! : null;
      answer.answeredAt = new Date();
      answer.feedback = null;
      answer.gradedBy = null;
      answer.gradedAt = null;
      if (question.questionType === QuestionType.MCQ && attempt.testMode === TestMode.TUTOR) {
        answer.isCorrect = selectedOption!.isCorrect;
        answer.awardedMarks = selectedOption!.isCorrect ? assignment.marks : '0.00';
      } else {
        answer.isCorrect = null;
        answer.awardedMarks = null;
      }
      attempt.lastActivityAt = new Date();
      await manager.getRepository(TestAttempt).save(attempt);
      const saved = await repository.save(answer);
      const value = attempt.testMode === TestMode.TUTOR && question.questionType === QuestionType.MCQ
        ? { ...saved, explanation: question.explanation }
        : this.hideGrade(saved);
      return { expired: false as const, value };
    });

    if (result.expired) throw new ConflictException('Attempt deadline has passed and the attempt was auto-submitted');
    return result.value;
  }

  async submit(attemptId: string, actor: AuthenticatedUser) {
    return this.dataSource.transaction(async (manager) => {
      const { attempt, test } = await this.lockAttempt(manager, attemptId, actor);
      if ([TestAttemptStatus.SUBMITTED, TestAttemptStatus.EXPIRED].includes(attempt.status)) {
        return this.attemptView(attempt, test);
      }
      if (attempt.status !== TestAttemptStatus.IN_PROGRESS) {
        throw new ConflictException('Attempt is no longer open');
      }
      if (this.deadlineReached(attempt, test)) {
        const expired = await this.finalizeLockedAttempt(manager, attempt, test, true);
        return this.attemptView(expired, test);
      }

      if (attempt.testMode === TestMode.TUTOR) {
        const [assignments, attemptAnswers] = await Promise.all([
          manager.getRepository(TestQuestion).find({
            where: { testId: attempt.testId },
            relations: { question: true },
          }),
          manager.getRepository(StudentAnswer).find({ where: { attemptId } }),
        ]);
        const byQuestion = new Map(attemptAnswers.map((answer) => [answer.questionId, answer]));
        const incomplete = assignments.filter((assignment) => {
          const answer = byQuestion.get(assignment.questionId);
          if (!answer) return true;
          if (assignment.question.questionType === QuestionType.MCQ) {
            return !answer.selectedOptionId || !answer.confidenceLevel;
          }
          return !answer.essayAnswer?.trim();
        });
        if (incomplete.length) {
          throw new BadRequestException(`Answer every question and choose a confidence level for every MCQ before submitting. ${incomplete.length} question(s) remain incomplete.`);
        }
      }

      const finalized = await this.finalizeLockedAttempt(manager, attempt, test, false);
      return this.attemptView(finalized, test);
    });
  }

  private async requireTest(id: string): Promise<Test> {
    const test = await this.tests.findOne({
      where: { id },
      relations: { course: true, week: true, lecture: true },
    });
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }

  private assertAvailable(test: Test): void {
    const now = new Date();
    if (!test.isPublished) throw new NotFoundException('Test not found');
    if (test.availableFrom && test.availableFrom > now) throw new ConflictException('Test is not available yet');
    if (test.availableUntil && test.availableUntil <= now) throw new ConflictException('Test availability has ended');
  }

  private async assertStudentTestAccess(test: Test, studentId: string): Promise<void> {
    const rows = await this.dataSource.query<Array<{ allowed: number }>>(`
      SELECT 1 AS allowed
      FROM bundle_tests bundle_test
      INNER JOIN bundles bundle ON bundle.id = bundle_test.bundle_id
      INNER JOIN bundle_enrollments enrollment
        ON enrollment.bundle_id = bundle.id AND enrollment.student_id = $2
      WHERE bundle_test.test_id = $1
        AND enrollment.status = 'ACTIVE'
        AND (enrollment.starts_at IS NULL OR enrollment.starts_at <= CURRENT_TIMESTAMP)
        AND (enrollment.expires_at IS NULL OR enrollment.expires_at > CURRENT_TIMESTAMP)
        AND enrollment.payment_status IN ('NOT_REQUIRED', 'PAID')
        AND bundle.status = 'PUBLISHED'
        AND (bundle.available_from IS NULL OR bundle.available_from <= CURRENT_TIMESTAMP)
        AND (bundle.available_until IS NULL OR bundle.available_until > CURRENT_TIMESTAMP)
      LIMIT 1
    `, [test.id, studentId]);
    if (!rows.length) throw new ForbiddenException('This test is not available in your bundles');
  }

  private assertMcqIntegrity(questions: Question[]): void {
    const invalid = questions.filter((question) => question.questionType === QuestionType.MCQ && (
      question.options?.length !== 5
      || question.options.filter((option) => option.isCorrect).length !== 1
    ));
    if (invalid.length) {
      throw new ConflictException(`${invalid.length} MCQ question(s) are malformed. Every MCQ must have exactly five options and exactly one correct answer.`);
    }
  }

  private async lockAttempt(manager: EntityManager, attemptId: string, actor: AuthenticatedUser) {
    const attempt = await manager.getRepository(TestAttempt).findOne({
      where: { id: attemptId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!attempt) throw new NotFoundException('Test attempt not found');
    if (attempt.studentId !== actor.userId) throw new ForbiddenException('You can modify only your attempts');
    const test = await manager.getRepository(Test).findOne({ where: { id: attempt.testId } });
    if (!test) throw new NotFoundException('Test not found');
    attempt.test = test;
    return { attempt, test };
  }

  private deadlineReached(attempt: TestAttempt, test: Test): boolean {
    if (attempt.status !== TestAttemptStatus.IN_PROGRESS || !attempt.startedAt) return false;
    const deadlines: number[] = [];
    if (attempt.testMode === TestMode.TIMED && test.durationMinutes) {
      deadlines.push(attempt.startedAt.getTime() + test.durationMinutes * 60_000);
    }
    if (test.availableUntil) deadlines.push(test.availableUntil.getTime());
    return Boolean(deadlines.length && Date.now() >= Math.min(...deadlines));
  }

  private async finalizeLockedAttempt(
    manager: EntityManager,
    attempt: TestAttempt,
    test: Test,
    expired: boolean,
  ): Promise<TestAttempt> {
    if (attempt.status !== TestAttemptStatus.IN_PROGRESS) return attempt;
    const assignments = await manager.getRepository(TestQuestion).find({
      where: { testId: attempt.testId },
    });
    const attemptAnswers = await manager.getRepository(StudentAnswer).find({
      where: { attemptId: attempt.id },
      relations: { selectedOption: true, question: true },
    });
    const marks = new Map(assignments.map((item) => [item.questionId, item.marks]));
    for (const answer of attemptAnswers) {
      if (answer.question.questionType === QuestionType.MCQ) {
        answer.isCorrect = answer.selectedOption?.isCorrect ?? false;
        answer.awardedMarks = answer.isCorrect ? (marks.get(answer.questionId) ?? '0.00') : '0.00';
      }
    }
    await manager.getRepository(StudentAnswer).save(attemptAnswers);
    const score = attemptAnswers.reduce((total, answer) => total + Number(answer.awardedMarks ?? 0), 0);
    attempt.status = expired ? TestAttemptStatus.EXPIRED : TestAttemptStatus.SUBMITTED;
    attempt.autoSubmitted = expired;
    attempt.score = score.toFixed(2);
    attempt.submittedAt = new Date();
    attempt.lastActivityAt = new Date();
    const saved = await manager.getRepository(TestAttempt).save(attempt);
    saved.test = test;
    return saved;
  }

  private hideGrade(answer: StudentAnswer) {
    const {
      awardedMarks: _marks,
      isCorrect: _correct,
      feedback: _feedback,
      gradedBy: _grader,
      gradedAt: _gradedAt,
      ...safe
    } = answer;
    return safe;
  }

  private attemptView(attempt: TestAttempt, test: Test) {
    const deadlines: number[] = [];
    if (attempt.startedAt && attempt.testMode === TestMode.TIMED && test.durationMinutes) {
      deadlines.push(attempt.startedAt.getTime() + test.durationMinutes * 60_000);
    }
    if (test.availableUntil) deadlines.push(test.availableUntil.getTime());
    const deadline = deadlines.length ? new Date(Math.min(...deadlines)) : null;
    return { ...attempt, test, deadline };
  }
}
