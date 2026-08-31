this.bundleAccess.applyStudentAccessScope(builder, 'test', actor.userId);import { randomInt } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BundleTest } from '../../common/entities/bundle-test.entity';
import { Course } from '../../common/entities/course.entity';
import { Lecture } from '../../common/entities/lecture.entity';
import { McqOption } from '../../common/entities/mcq-option.entity';
import { NotificationType } from '../../common/entities/notification.entity';
import { QuestionFlag, QuestionFlagType } from '../../common/entities/question-flag.entity';
import { QuestionNote } from '../../common/entities/question-note.entity';
import { Question, QuestionType } from '../../common/entities/question.entity';
import { StudentAnswer } from '../../common/entities/student-answer.entity';
import {
  TestAttempt,
  TestAttemptStatus,
  TestMode,
} from '../../common/entities/test-attempt.entity';
import { TestQuestion } from '../../common/entities/test-question.entity';
import { Test, TestType } from '../../common/entities/test.entity';
import { Week } from '../../common/entities/week.entity';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { NotificationsService } from '../notifications/notifications.service';
import { Student } from '../users/entities/student.entity';
import { UserRole } from '../users/entities/user.entity';
import {
  AddTestQuestionDto,
  CreateTestDto,
  GeneratePracticeTestDto,
  GradeEssayDto,
  QuestionNoteDto,
  SaveAnswerDto,
  StartTestAttemptDto,
  TestQueryDto,
  UpdateTestDto,
} from './dtos/tests.dto';

@Injectable()
export class TestsService implements OnModuleInit {
  constructor(
    @InjectRepository(Test) private readonly tests: Repository<Test>,
    @InjectRepository(TestQuestion) private readonly testQuestions: Repository<TestQuestion>,
    @InjectRepository(TestAttempt) private readonly attempts: Repository<TestAttempt>,
    @InjectRepository(StudentAnswer) private readonly answers: Repository<StudentAnswer>,
    @InjectRepository(QuestionFlag) private readonly flags: Repository<QuestionFlag>,
    @InjectRepository(QuestionNote) private readonly notes: Repository<QuestionNote>,
    @InjectRepository(Question) private readonly questions: Repository<Question>,
    @InjectRepository(McqOption) private readonly options: Repository<McqOption>,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(Week) private readonly weeks: Repository<Week>,
    @InjectRepository(Lecture) private readonly lectures: Repository<Lecture>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly bundleAccess: BundleAccessService,
  ) {}

  async onModuleInit(): Promise<void> {
    // The migration is canonical, but local databases can have a stale or
    // partially-applied migration history. Every statement here is idempotent
    // so restarting Nest never crashes on an already-created constraint/index.
    await this.dataSource.transaction(async manager => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext('mdp_tests_runtime_schema'))`);
      await manager.query(`
        ALTER TABLE student_answers
        ADD COLUMN IF NOT EXISTS confidence_level varchar(12)
      `);
      await manager.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'chk_student_answer_confidence'
              AND conrelid = 'student_answers'::regclass
          ) THEN
            ALTER TABLE student_answers
            ADD CONSTRAINT chk_student_answer_confidence
            CHECK (confidence_level IS NULL OR confidence_level IN ('LOW', 'MEDIUM', 'HIGH'));
          END IF;
        END $$;
      `);
      await manager.query(`
        ALTER TABLE question_flags
        ADD COLUMN IF NOT EXISTS flag_type varchar(10) NOT NULL DEFAULT 'NORMAL'
      `);
      await manager.query(`ALTER TABLE question_flags DROP CONSTRAINT IF EXISTS uq_flag`);
      await manager.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'chk_question_flag_type'
              AND conrelid = 'question_flags'::regclass
          ) THEN
            ALTER TABLE question_flags
            ADD CONSTRAINT chk_question_flag_type
            CHECK (flag_type IN ('NORMAL', 'HARD'));
          END IF;
        END $$;
      `);
      // A unique constraint is backed by an index with this name. CREATE INDEX
      // handles both a previously-created constraint index and a standalone one.
      await manager.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_flag_type
        ON question_flags (attempt_id, question_id, flag_type)
      `);

    });
  }

  async create(dto: CreateTestDto, actor: AuthenticatedUser) {
    const scope = await this.resolveScope(dto.test_type, dto.course_id, dto.week_id, dto.lecture_id);
    this.assertWindow(dto.available_from, dto.available_until);
    return this.tests.save(this.tests.create({
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      testType: dto.test_type,
      ...scope,
      durationMinutes: dto.duration_minutes ?? null,
      totalMarks: null,
      passingMarks: dto.passing_marks === undefined ? null : dto.passing_marks.toFixed(2),
      isPublished: false,
      availableFrom: dto.available_from ? new Date(dto.available_from) : null,
      availableUntil: dto.available_until ? new Date(dto.available_until) : null,
      createdBy: actor.userId,
    }));
  }

  async list(query: TestQueryDto, actor: AuthenticatedUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const builder = this.tests.createQueryBuilder('test')
      .leftJoinAndSelect('test.course', 'course')
      .leftJoinAndSelect('test.week', 'week')
      .leftJoinAndSelect('test.lecture', 'lecture')
      .orderBy('test.created_at', 'DESC')
      .skip((page - 1) * limit).take(limit);
    if (actor.role === UserRole.STUDENT) {
      const now = new Date();
      builder.andWhere('test.is_published = TRUE')
        .andWhere('(test.available_from IS NULL OR test.available_from <= :now)', { now })
        .andWhere('(test.available_until IS NULL OR test.available_until > :now)', { now })
        .andWhere(`EXISTS (
            SELECT 1 FROM bundle_tests bundle_test
            INNER JOIN bundle_enrollments enrollment
              ON enrollment.bundle_id = bundle_test.bundle_id
            INNER JOIN bundles bundle ON bundle.id = bundle_test.bundle_id
            WHERE bundle_test.test_id = test.id
              AND enrollment.student_id = :actorId
              AND enrollment.status = 'ACTIVE'
              AND (enrollment.starts_at IS NULL OR enrollment.starts_at <= :now)
              AND (enrollment.expires_at IS NULL OR enrollment.expires_at > :now)
              AND enrollment.payment_status IN ('NOT_REQUIRED', 'PAID')
              AND bundle.status = 'PUBLISHED'
              AND (bundle.available_from IS NULL OR bundle.available_from <= :now)
              AND (bundle.available_until IS NULL OR bundle.available_until > :now)
          )`, { actorId: actor.userId });
    } else if (actor.role === UserRole.INSTRUCTOR) {
      builder.andWhere('test.created_by = :actorId', { actorId: actor.userId });
    }
    if (query.test_type) builder.andWhere('test.test_type = :type', { type: query.test_type });
    if (query.course_id) builder.andWhere('test.course_id = :courseId', { courseId: query.course_id });
    if (query.is_published !== undefined && actor.role !== UserRole.STUDENT) {
      builder.andWhere('test.is_published = :published', { published: query.is_published });
    }
    const [data, total] = await builder.getManyAndCount();
    return { data, page, limit, total, total_pages: Math.ceil(total / limit) };
  }

  async getOne(id: string, actor: AuthenticatedUser) {
    const test = await this.requireTest(id);
    await this.assertCanViewTest(test, actor);
    if (actor.role === UserRole.STUDENT) this.assertAvailable(test);
    return test;
  }

  async practiceCatalog(bundleId: string, courseId: string, actor: AuthenticatedUser) {
    if (actor.role !== UserRole.STUDENT) throw new ForbiddenException('Student access is required');
    const accessibleLectureIds = await this.requireBundleLectureAccess(
      bundleId, actor.userId, undefined, false, courseId,
    );
    const course = await this.courses.findOne({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    const weeks = await this.weeks.find({
      where: { courseId }, relations: { lectures: true },
      order: { weekNumber: 'ASC', lectures: { lectureNumber: 'ASC' } },
    });
    const allowed = new Set(accessibleLectureIds);
    for (const week of weeks) week.lectures = week.lectures.filter((lecture) => allowed.has(lecture.id));
    const counts = await this.questions.createQueryBuilder('question')
      .innerJoin('question.topic', 'topic')
      .select('topic.lecture_id', 'lecture_id')
      .addSelect('COUNT(question.id)::integer', 'question_count')
      .where('question.is_active = TRUE')
      .andWhere('question.is_question_bank = TRUE')
      .andWhere('question.question_type = :mcqType', { mcqType: QuestionType.MCQ })
      .andWhere(`(
        SELECT COUNT(*) FROM mcq_options option
        WHERE option.question_id = question.id
      ) = 5`)
      .andWhere(`(
        SELECT COUNT(*) FROM mcq_options option
        WHERE option.question_id = question.id AND option.is_correct = TRUE
      ) = 1`)
      .andWhere('topic.lecture_id IN (:...lectureIds)', {
        lectureIds: weeks.flatMap((week) => week.lectures.map((lecture) => lecture.id)).length
          ? weeks.flatMap((week) => week.lectures.map((lecture) => lecture.id)) : ['00000000-0000-0000-0000-000000000000'],
      })
      .groupBy('topic.lecture_id').getRawMany<{ lecture_id:string; question_count:number }>();
    const byLecture = new Map(counts.map((item) => [item.lecture_id, Number(item.question_count)]));
    return { course, weeks: weeks.map((week) => ({ ...week, lectures: week.lectures.map((lecture) => ({
      ...lecture, question_count: byLecture.get(lecture.id) ?? 0,
    })) })) };
  }

  async generatePractice(dto: GeneratePracticeTestDto, actor: AuthenticatedUser) {
    if (!(await this.students.exists({ where: { userId: actor.userId } }))) {
      throw new ForbiddenException('Student profile is required to generate a practice test');
    }
    if (![40, 200].includes(dto.question_count)) {
      throw new BadRequestException('Practice exams must contain either 40 or 200 MCQs');
    }
    if (dto.test_mode === TestMode.TIMED && dto.duration_minutes !== dto.question_count) {
      throw new BadRequestException(
        `A timed ${dto.question_count}-MCQ exam must last exactly ${dto.question_count} minutes`,
      );
    }
    await this.requireBundleLectureAccess(
      dto.bundle_id, actor.userId, dto.lecture_ids, true,
    );
    const lectures = await this.lectures.createQueryBuilder('lecture')
      .leftJoinAndSelect('lecture.week', 'week')
      .leftJoinAndSelect('week.course', 'course')
      .where('lecture.id IN (:...lectureIds)', { lectureIds: dto.lecture_ids }).getMany();
    if (lectures.length !== dto.lecture_ids.length) throw new NotFoundException('One or more lectures were not found');
    const courseIds = new Set(lectures.map((lecture) => lecture.week.courseId));
    if (courseIds.size !== 1) throw new BadRequestException('All selected lectures must belong to the same course');
    const builder = this.questions.createQueryBuilder('question')
      .innerJoinAndSelect('question.topic', 'topic')
      .leftJoinAndSelect('question.options', 'options')
      .leftJoinAndSelect('question.essayConfiguration', 'essayConfiguration')
      .where('topic.lecture_id IN (:...lectureIds)', { lectureIds: dto.lecture_ids })
      .andWhere('question.is_active = TRUE').andWhere('question.is_question_bank = TRUE')
      .andWhere('question.question_type = :mcqType', { mcqType: QuestionType.MCQ });
    if (dto.difficulty) builder.andWhere('question.difficulty = :difficulty', { difficulty: dto.difficulty });
    const eligible = await builder.getMany();
    if (eligible.length < dto.question_count) {
      throw new BadRequestException(`Only ${eligible.length} eligible questions are available for this selection`);
    }
    for (let index = eligible.length - 1; index > 0; index -= 1) {
      const target = randomInt(index + 1);
      [eligible[index], eligible[target]] = [eligible[target], eligible[index]];
    }
    const selected = eligible.slice(0, dto.question_count);
    const courseId = lectures[0].week.courseId;
    return this.dataSource.transaction(async (manager) => {
      const now = new Date();
      const total = selected.reduce((sum, question) => sum + Number(question.marks), 0);
      const test = await manager.save(Test, manager.create(Test, {
        title: `Custom practice · ${now.toISOString().slice(0, 10)}`,
        description: `Generated from ${lectures.length} selected lecture${lectures.length === 1 ? '' : 's'}`,
        testType: TestType.CUSTOM, courseId, weekId: null, lectureId: null,
        durationMinutes: dto.test_mode === TestMode.TIMED ? dto.duration_minutes! : null,
        totalMarks: total.toFixed(2), passingMarks: null, isPublished: true,
        availableFrom: null, availableUntil: null, createdBy: actor.userId,
      }));
      await manager.save(BundleTest, manager.create(BundleTest, {
        bundleId: dto.bundle_id, testId: test.id,
      }));
      await manager.save(TestQuestion, selected.map((question, index) => manager.create(TestQuestion, {
        testId: test.id, questionId: question.id, displayOrder: index + 1,
        marks: question.marks, timeLimitSeconds: null,
      })));
      const attempt = await manager.save(TestAttempt, manager.create(TestAttempt, {
        studentId: actor.userId, testId: test.id, testMode: dto.test_mode,
        status: TestAttemptStatus.IN_PROGRESS, score: null, startedAt: now,
        submittedAt: null, lastActivityAt: now, autoSubmitted: false,
      }));
      return { test, attempt: { ...attempt, test }, question_count: selected.length };
    });
  }

  async update(id: string, dto: UpdateTestDto, actor: AuthenticatedUser) {
    const test = await this.requireOwnedTest(id, actor);
    const wasPublished = test.isPublished;
    if (Object.keys(dto).length === 0) throw new BadRequestException('At least one test field must be provided');
    const attemptCount = await this.attempts.count({ where: { testId: id } });
    const changesDefinition = Object.keys(dto).some((key) => key !== 'is_published');
    if (test.isPublished && changesDefinition && dto.is_published !== false) {
      throw new ConflictException('Unpublish the test before changing its definition');
    }
    if (attemptCount > 0 && (changesDefinition || dto.is_published === false)) {
      throw new ConflictException('A test cannot be changed or unpublished after attempts exist');
    }
    const from = dto.available_from !== undefined ? dto.available_from : test.availableFrom?.toISOString();
    const until = dto.available_until !== undefined ? dto.available_until : test.availableUntil?.toISOString();
    this.assertWindow(from, until);
    if (dto.title !== undefined) test.title = dto.title.trim();
    if (dto.description !== undefined) test.description = dto.description.trim() || null;
    if (dto.duration_minutes !== undefined) test.durationMinutes = dto.duration_minutes;
    if (dto.passing_marks !== undefined) test.passingMarks = dto.passing_marks.toFixed(2);
    if (dto.available_from !== undefined) test.availableFrom = new Date(dto.available_from);
    if (dto.available_until !== undefined) test.availableUntil = new Date(dto.available_until);
    if (dto.is_published !== undefined) {
      if (dto.is_published) await this.assertPublishable(test);
      test.isPublished = dto.is_published;
    }
    const saved = await this.tests.save(test);
    if (!wasPublished && saved.isPublished && saved.courseId) {
      await this.notifications.notifyCourseStudents(saved.courseId, {
        title: 'New assessment available',
        message: saved.title,
        target_url: `/tests/${saved.id}`,
        notification_type: NotificationType.TEST,
      }, actor);
    }
    return saved;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const test = await this.requireOwnedTest(id, actor);
    if (test.isPublished) throw new ConflictException('Unpublish the test before deleting it');
    if (await this.attempts.exists({ where: { testId: id } })) {
      throw new ConflictException('A test with attempts cannot be deleted');
    }
    await this.tests.remove(test);
  }

  async addQuestion(testId: string, dto: AddTestQuestionDto, actor: AuthenticatedUser) {
    const test = await this.requireMutableTest(testId, actor);
    const question = await this.questions.findOne({
      where: { id: dto.question_id },
      relations: { topic: { lecture: { week: { course: true } } } },
    });
    if (!question || !question.isActive) throw new NotFoundException('Active question not found');
    this.assertQuestionScope(test, question);
    return this.dataSource.transaction(async (manager) => {
      const item = await manager.save(TestQuestion, manager.create(TestQuestion, {
        testId, questionId: question.id, displayOrder: dto.display_order,
        marks: dto.marks.toFixed(2), timeLimitSeconds: dto.time_limit_seconds ?? null,
      }));
      await this.recalculateTotal(testId, manager.getRepository(TestQuestion), manager.getRepository(Test));
      return item;
    });
  }

  async listQuestions(testId: string, actor: AuthenticatedUser) {
    const test = await this.requireTest(testId);
    await this.assertCanViewTest(test, actor);
    if (actor.role === UserRole.STUDENT) {
      this.assertAvailable(test);
      const activeAttempt = await this.attempts.findOne({
        where: { testId, studentId: actor.userId, status: TestAttemptStatus.IN_PROGRESS },
        relations: { test: true },
      });
      if (activeAttempt) await this.expireIfNeeded(activeAttempt, activeAttempt.test);
      if (!activeAttempt || activeAttempt.status !== TestAttemptStatus.IN_PROGRESS) {
        throw new ForbiddenException('Start an active attempt before accessing its questions');
      }
    }
    const items = await this.testQuestions.find({
      where: { testId },
      relations: { question: { options: true, essayConfiguration: true } },
      order: { displayOrder: 'ASC' },
    });
    return items.map((item) => ({
      ...item,
      question: this.questionView(item.question, actor.role !== UserRole.STUDENT),
    }));
  }

  async removeQuestion(testId: string, questionId: string, actor: AuthenticatedUser): Promise<void> {
    await this.requireMutableTest(testId, actor);
    const item = await this.testQuestions.findOne({ where: { testId, questionId } });
    if (!item) throw new NotFoundException('Question is not assigned to this test');
    await this.dataSource.transaction(async (manager) => {
      await manager.remove(item);
      await this.recalculateTotal(testId, manager.getRepository(TestQuestion), manager.getRepository(Test));
    });
  }

  async listAttempts(testId: string, actor: AuthenticatedUser) {
    await this.requireOwnedTest(testId, actor);
    return this.attempts.find({ where: { testId }, order: { createdAt: 'DESC' } });
  }

  async startAttempt(testId: string, dto: StartTestAttemptDto, actor: AuthenticatedUser) {
    const test = await this.requireTest(testId);
    this.assertAvailable(test);
    await this.assertStudentTestAccess(test, actor.userId, true);
    if (!(await this.students.exists({ where: { userId: actor.userId } }))) {
      throw new ForbiddenException('Student profile is required to start an attempt');
    }
    const questionCount = await this.testQuestions.count({ where: { testId } });
    if (questionCount === 0) throw new ConflictException('Test has no questions');
    if (dto.test_mode === TestMode.TIMED && !test.durationMinutes) {
      throw new ConflictException('Timed mode is unavailable because this test has no duration');
    }
    const active = await this.attempts.findOne({
      where: { testId, studentId: actor.userId, status: TestAttemptStatus.IN_PROGRESS },
    });
    if (active) {
      await this.expireIfNeeded(active, test);
      if (active.status === TestAttemptStatus.IN_PROGRESS) {
        throw new ConflictException('An active attempt already exists for this test');
      }
    }
    const now = new Date();
    return this.attempts.save(this.attempts.create({
      studentId: actor.userId, testId, testMode: dto.test_mode,
      status: TestAttemptStatus.IN_PROGRESS, score: null,
      startedAt: now, submittedAt: null, lastActivityAt: now, autoSubmitted: false,
    }));
  }

  async getAttempt(id: string, actor: AuthenticatedUser) {
    const attempt = await this.requireAttempt(id);
    await this.assertAttemptAccess(attempt, actor);
    await this.expireIfNeeded(attempt, attempt.test);
    return this.attemptView(attempt);
  }

  async saveAnswer(attemptId: string, questionId: string, dto: SaveAnswerDto, actor: AuthenticatedUser) {
    const attempt = await this.requireStudentOpenAttempt(attemptId, actor);
    const assignment = await this.testQuestions.findOne({
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
      selectedOption = await this.options.findOne({ where: { id: dto.selected_option_id, questionId } });
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
    let answer = await this.answers.findOne({ where: { attemptId, questionId } });
    answer ??= this.answers.create({ attemptId, questionId });
    answer.selectedOptionId = selectedOption?.id ?? null;
    answer.essayAnswer = essayAnswer;
    answer.confidenceLevel = question.questionType === QuestionType.MCQ ? dto.confidence_level! : null;
    answer.answeredAt = new Date();
    answer.feedback = null; answer.gradedBy = null; answer.gradedAt = null;
    if (question.questionType === QuestionType.MCQ && attempt.testMode === TestMode.TUTOR) {
      answer.isCorrect = selectedOption!.isCorrect;
      answer.awardedMarks = selectedOption!.isCorrect ? assignment.marks : '0.00';
    } else {
      answer.isCorrect = null; answer.awardedMarks = null;
    }
    attempt.lastActivityAt = new Date();
    await this.attempts.save(attempt);
    const saved = await this.answers.save(answer);
    return attempt.testMode === TestMode.TUTOR && question.questionType === QuestionType.MCQ
      ? { ...saved, explanation: question.explanation } : this.hideGrade(saved);
  }

  async submit(id: string, actor: AuthenticatedUser) {
    const attempt = await this.requireStudentOpenAttempt(id, actor);
    const [assignments, attemptAnswers] = await Promise.all([
      this.testQuestions.find({ where: { testId: attempt.testId }, relations: { question: true } }),
      this.answers.find({ where: { attemptId: id } }),
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
    if (attempt.testMode === TestMode.TUTOR && incomplete.length) {
      throw new BadRequestException(`Answer every question and choose a confidence level for every MCQ before submitting. ${incomplete.length} question(s) remain incomplete.`);
    }
    await this.finalizeAttempt(attempt, false);
    return this.attemptView(attempt);
  }

  async getWorkspaceState(id: string, actor: AuthenticatedUser) {
    const attempt = await this.requireAttempt(id);
    await this.assertAttemptAccess(attempt, actor);
    await this.expireIfNeeded(attempt, attempt.test);
    const [answers, flags, notes] = await Promise.all([
      this.answers.find({ where: { attemptId: id }, order: { answeredAt: 'ASC' } }),
      this.flags.find({ where: { attemptId: id } }),
      this.notes.find({ where: { attemptId: id } }),
    ]);
    return {
      attempt: this.attemptView(attempt),
      answers: actor.role === UserRole.STUDENT && attempt.status === TestAttemptStatus.IN_PROGRESS
        ? answers.map((answer) => this.hideGrade(answer)) : answers,
      flagged_question_ids: flags.filter((flag) => flag.flagType === QuestionFlagType.NORMAL).map((flag) => flag.questionId),
      hard_question_ids: flags.filter((flag) => flag.flagType === QuestionFlagType.HARD).map((flag) => flag.questionId),
      notes: notes.map((note) => ({ question_id: note.questionId, note: note.note })),
    };
  }

  async getAnswers(id: string, actor: AuthenticatedUser) {
    const attempt = await this.requireAttempt(id);
    await this.assertAttemptAccess(attempt, actor);
    await this.expireIfNeeded(attempt, attempt.test);
    const answers = await this.answers.find({ where: { attemptId: id }, order: { answeredAt: 'ASC' } });
    return actor.role === UserRole.STUDENT && attempt.status === TestAttemptStatus.IN_PROGRESS
      ? answers.map((answer) => this.hideGrade(answer)) : answers;
  }

  async getReview(id: string, actor: AuthenticatedUser) {
    const attempt = await this.requireAttempt(id);
    await this.assertAttemptAccess(attempt, actor);
    await this.expireIfNeeded(attempt, attempt.test);
    if (attempt.status === TestAttemptStatus.IN_PROGRESS) {
      throw new ConflictException('Review is available only after submission or expiry');
    }
    const assignments = await this.testQuestions.find({
      where: { testId: attempt.testId },
      relations: { question: { options: true, essayConfiguration: true } },
      order: { displayOrder: 'ASC' },
    });
    const answers = await this.answers.find({ where: { attemptId: id } });
    const byQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
    return {
      attempt: this.attemptView(attempt),
      grading_pending: answers.some((answer) => answer.essayAnswer !== null && answer.awardedMarks === null),
      questions: assignments.map((item) => ({
        ...item,
        question: this.questionView(item.question, true),
        answer: byQuestion.get(item.questionId) ?? null,
      })),
    };
  }

  async flag(attemptId: string, questionId: string, actor: AuthenticatedUser, flagType = QuestionFlagType.NORMAL) {
    const attempt = await this.requireStudentOpenAttempt(attemptId, actor);
    await this.requireAssignedQuestion(attempt.testId, questionId);
    const existing = await this.flags.findOne({ where: { attemptId, questionId, flagType } });
    return existing ?? this.flags.save(this.flags.create({ attemptId, questionId, flagType }));
  }

  async unflag(attemptId: string, questionId: string, actor: AuthenticatedUser, flagType = QuestionFlagType.NORMAL): Promise<void> {
    await this.requireStudentOpenAttempt(attemptId, actor);
    const flag = await this.flags.findOne({ where: { attemptId, questionId, flagType } });
    if (!flag) throw new NotFoundException('Question flag not found');
    await this.flags.remove(flag);
  }

  async setNote(attemptId: string, questionId: string, dto: QuestionNoteDto, actor: AuthenticatedUser) {
    const attempt = await this.requireStudentOpenAttempt(attemptId, actor);
    await this.requireAssignedQuestion(attempt.testId, questionId);
    let note = await this.notes.findOne({ where: { attemptId, questionId } });
    note ??= this.notes.create({ attemptId, questionId });
    note.note = dto.note.trim();
    return this.notes.save(note);
  }

  async removeNote(attemptId: string, questionId: string, actor: AuthenticatedUser): Promise<void> {
    await this.requireStudentOpenAttempt(attemptId, actor);
    const note = await this.notes.findOne({ where: { attemptId, questionId } });
    if (!note) throw new NotFoundException('Question note not found');
    await this.notes.remove(note);
  }

  async gradeEssay(attemptId: string, answerId: string, dto: GradeEssayDto, actor: AuthenticatedUser) {
    const attempt = await this.requireAttempt(attemptId);
    this.assertOwner(attempt.test, actor);
    if (![TestAttemptStatus.SUBMITTED, TestAttemptStatus.EXPIRED].includes(attempt.status)) {
      throw new ConflictException('Essay answers can be graded only after the attempt closes');
    }
    const answer = await this.answers.findOne({
      where: { id: answerId, attemptId },
      relations: { question: true },
    });
    if (!answer) throw new NotFoundException('Answer not found in this attempt');
    if (answer.question.questionType !== QuestionType.ESSAY || !answer.essayAnswer) {
      throw new ConflictException('Only submitted essay answers can be manually graded');
    }
    const assignment = await this.requireAssignedQuestion(attempt.testId, answer.questionId);
    if (dto.awarded_marks > Number(assignment.marks)) {
      throw new BadRequestException('Awarded marks cannot exceed the question marks');
    }
    answer.awardedMarks = dto.awarded_marks.toFixed(2);
    answer.isCorrect = dto.awarded_marks === Number(assignment.marks);
    answer.feedback = dto.feedback?.trim() || null;
    answer.gradedBy = actor.userId;
    answer.gradedAt = new Date();
    await this.answers.save(answer);
    await this.recalculateScore(attempt);
    await this.notifications.notifyUser(attempt.studentId, {
      title: 'Assessment grade updated',
      message: `Feedback is available for ${attempt.test.title}.`,
      target_url: `/tests/attempts/${attempt.id}/review`,
      notification_type: NotificationType.GRADE,
    }, actor);
    return answer;
  }

  private async requireTest(id: string): Promise<Test> {
    const test = await this.tests.findOne({
      where: { id }, relations: { course: true, week: true, lecture: true },
    });
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }

  private async requireOwnedTest(id: string, actor: AuthenticatedUser): Promise<Test> {
    const test = await this.requireTest(id);
    this.assertOwner(test, actor);
    return test;
  }

  private assertOwner(test: Test, actor: AuthenticatedUser): void {
    if (actor.role !== UserRole.SYSTEM_ADMIN && test.createdBy !== actor.userId) {
      throw new ForbiddenException('You can manage only tests you created');
    }
  }

  private async assertCanViewTest(test: Test, actor: AuthenticatedUser): Promise<void> {
    if (actor.role === UserRole.STUDENT) {
      if (!test.isPublished) throw new NotFoundException('Test not found');
      await this.assertStudentTestAccess(test, actor.userId, false);
    }
    if (actor.role === UserRole.INSTRUCTOR) this.assertOwner(test, actor);
  }

  private async assertStudentTestAccess(
    test: Test,
    studentId: string,
    requireWritable: boolean,
  ): Promise<void> {
    await this.bundleAccess.assertTestAccess(
      test.id,
      { role: UserRole.STUDENT, userId: studentId } as AuthenticatedUser,
      { throwForbidden: requireWritable },
    );
  }

  private async requireBundleLectureAccess(
    bundleId: string,
    studentId: string,
    lectureIds?: string[],
    _requireWritable = false,
    courseId?: string,
  ): Promise<string[]> {
    const accessibleLectureIds = await this.bundleAccess.getAccessibleLectureIdsInBundle(
      bundleId,
      studentId,
      courseId,
    );
    if (!accessibleLectureIds.length) {
      throw new ForbiddenException('This bundle does not grant access to the selected content');
    }
    const accessible = new Set(accessibleLectureIds);
    if (lectureIds?.some((lectureId) => !accessible.has(lectureId))) {
      throw new ForbiddenException('One or more lectures are outside this bundle');
    }
    return [...accessible];
  }

  private assertAvailable(test: Test): void {
    const now = new Date();
    if (!test.isPublished) throw new NotFoundException('Test not found');
    if (test.availableFrom && test.availableFrom > now) throw new ConflictException('Test is not available yet');
    if (test.availableUntil && test.availableUntil <= now) throw new ConflictException('Test availability has ended');
  }

  private async requireMutableTest(id: string, actor: AuthenticatedUser): Promise<Test> {
    const test = await this.requireOwnedTest(id, actor);
    if (test.isPublished) throw new ConflictException('Unpublish the test before changing its questions');
    if (await this.attempts.exists({ where: { testId: id } })) {
      throw new ConflictException('Test questions cannot change after attempts exist');
    }
    return test;
  }

  private async requireAttempt(id: string): Promise<TestAttempt> {
    const attempt = await this.attempts.findOne({ where: { id }, relations: { test: true } });
    if (!attempt) throw new NotFoundException('Test attempt not found');
    return attempt;
  }

  private async assertAttemptAccess(attempt: TestAttempt, actor: AuthenticatedUser): Promise<void> {
    if (actor.role === UserRole.STUDENT) {
      if (attempt.studentId !== actor.userId) throw new ForbiddenException('You can access only your attempts');
    } else this.assertOwner(attempt.test, actor);
  }

  private async requireStudentOpenAttempt(id: string, actor: AuthenticatedUser): Promise<TestAttempt> {
    const attempt = await this.requireAttempt(id);
    if (attempt.studentId !== actor.userId) throw new ForbiddenException('You can modify only your attempts');
    await this.expireIfNeeded(attempt, attempt.test);
    if (attempt.status !== TestAttemptStatus.IN_PROGRESS) {
      throw new ConflictException('Attempt is no longer open');
    }
    return attempt;
  }

  private async expireIfNeeded(attempt: TestAttempt, test: Test): Promise<void> {
    if (attempt.status !== TestAttemptStatus.IN_PROGRESS || !attempt.startedAt) return;
    const deadlines: number[] = [];
    if (attempt.testMode === TestMode.TIMED && test.durationMinutes) {
      deadlines.push(attempt.startedAt.getTime() + test.durationMinutes * 60_000);
    }
    if (test.availableUntil) deadlines.push(test.availableUntil.getTime());
    if (deadlines.length && Date.now() >= Math.min(...deadlines)) await this.finalizeAttempt(attempt, true);
  }

  private async finalizeAttempt(attempt: TestAttempt, expired: boolean): Promise<void> {
    const test = attempt.test;
    const finalized = await this.dataSource.transaction(async (manager) => {
      const locked = await manager.getRepository(TestAttempt).findOne({
        where: { id: attempt.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException('Test attempt not found');
      if (locked.status !== TestAttemptStatus.IN_PROGRESS) return locked;
      const assignments = await manager.getRepository(TestQuestion).find({
        where: { testId: locked.testId },
      });
      const attemptAnswers = await manager.getRepository(StudentAnswer).find({
        where: { attemptId: locked.id },
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
      const score = attemptAnswers.reduce(
        (total, answer) => total + Number(answer.awardedMarks ?? 0),
        0,
      );
      locked.status = expired ? TestAttemptStatus.EXPIRED : TestAttemptStatus.SUBMITTED;
      locked.autoSubmitted = expired;
      locked.score = score.toFixed(2);
      locked.submittedAt = new Date();
      locked.lastActivityAt = new Date();
      return manager.getRepository(TestAttempt).save(locked);
    });
    Object.assign(attempt, finalized);
    attempt.test = test;
  }

  private async recalculateScore(attempt: TestAttempt): Promise<void> {
    const result = await this.answers.createQueryBuilder('answer')
      .select('COALESCE(SUM(answer.awarded_marks), 0)', 'score')
      .where('answer.attempt_id = :attemptId', { attemptId: attempt.id })
      .getRawOne<{ score: string }>();
    attempt.score = Number(result?.score ?? 0).toFixed(2);
    await this.attempts.save(attempt);
  }

  private async requireAssignedQuestion(testId: string, questionId: string): Promise<TestQuestion> {
    const item = await this.testQuestions.findOne({ where: { testId, questionId } });
    if (!item) throw new NotFoundException('Question is not assigned to this test');
    return item;
  }

  private async assertPublishable(test: Test): Promise<void> {
    const items = await this.testQuestions.find({ where: { testId: test.id }, relations: { question: true } });
    if (items.length === 0) throw new ConflictException('Add at least one question before publishing');
    if (items.some((item) => !item.question.isActive)) {
      throw new ConflictException('All test questions must be active before publishing');
    }
    const total = items.reduce((sum, item) => sum + Number(item.marks), 0);
    if (test.passingMarks !== null && Number(test.passingMarks) > total) {
      throw new ConflictException('Passing marks cannot exceed total marks');
    }
    this.assertWindow(test.availableFrom?.toISOString(), test.availableUntil?.toISOString());
    test.totalMarks = total.toFixed(2);
  }

  private assertWindow(from?: string, until?: string): void {
    if (from && until && new Date(until) <= new Date(from)) {
      throw new BadRequestException('available_until must be later than available_from');
    }
  }

  private async resolveScope(type: TestType, courseId?: string, weekId?: string, lectureId?: string) {
    let course: Course | null = null;
    let week: Week | null = null;
    let lecture: Lecture | null = null;
    if (lectureId) {
      lecture = await this.lectures.findOne({ where: { id: lectureId }, relations: { week: { course: true } } });
      if (!lecture) throw new NotFoundException('Lecture not found');
      week = lecture.week; course = lecture.week.course;
    } else if (weekId) {
      week = await this.weeks.findOne({ where: { id: weekId }, relations: { course: true } });
      if (!week) throw new NotFoundException('Week not found');
      course = week.course;
    } else if (courseId) {
      course = await this.courses.findOne({ where: { id: courseId } });
      if (!course) throw new NotFoundException('Course not found');
    }
    if (courseId && course?.id !== courseId) throw new BadRequestException('Course does not match the selected hierarchy');
    if (weekId && week?.id !== weekId) throw new BadRequestException('Week does not match the selected lecture');
    if (type === TestType.LECTURE && !lecture) throw new BadRequestException('LECTURE tests require lecture_id');
    if (type === TestType.WEEK && (!week || lecture)) throw new BadRequestException('WEEK tests require week_id and cannot use lecture_id');
    if (type === TestType.COURSE && (!course || week || lecture)) throw new BadRequestException('COURSE tests require course_id only');
    return { courseId: course?.id ?? null, weekId: week?.id ?? null, lectureId: lecture?.id ?? null };
  }

  private assertQuestionScope(test: Test, question: Question): void {
    const lecture = question.topic.lecture;
    if (test.courseId && lecture.week.courseId !== test.courseId) {
      throw new BadRequestException('Question is outside the test course');
    }
    if (test.weekId && lecture.weekId !== test.weekId) {
      throw new BadRequestException('Question is outside the test week');
    }
    if (test.lectureId && lecture.id !== test.lectureId) {
      throw new BadRequestException('Question is outside the test lecture');
    }
  }

  private async recalculateTotal(testId: string, assignments: Repository<TestQuestion>, tests: Repository<Test>) {
    const result = await assignments.createQueryBuilder('item')
      .select('COALESCE(SUM(item.marks), 0)', 'total')
      .where('item.test_id = :testId', { testId }).getRawOne<{ total: string }>();
    const total = Number(result?.total ?? 0);
    await tests.update(testId, { totalMarks: total > 0 ? total.toFixed(2) : null });
  }

  private questionView(question: Question, revealAnswers: boolean) {
    const options = [...(question.options ?? [])]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((option) => revealAnswers ? option : ({
      id: option.id, questionId: option.questionId, optionText: option.optionText,
      displayOrder: option.displayOrder, createdAt: option.createdAt,
      }));
    const essayConfiguration = question.essayConfiguration && revealAnswers
      ? question.essayConfiguration
      : question.essayConfiguration ? {
          questionId: question.essayConfiguration.questionId,
          minimumWordCount: question.essayConfiguration.minimumWordCount,
          maximumWordCount: question.essayConfiguration.maximumWordCount,
        } : null;
    if (revealAnswers) return { ...question, options, essayConfiguration };
    const {
      explanation: _explanation,
      hint: _hint,
      reference: _reference,
      createdBy: _createdBy,
      creator: _creator,
      ...safeQuestion
    } = question;
    return { ...safeQuestion, options, essayConfiguration };
  }

  private hideGrade(answer: StudentAnswer) {
    const { awardedMarks: _marks, isCorrect: _correct, feedback: _feedback,
      gradedBy: _grader, gradedAt: _gradedAt, ...safe } = answer;
    return safe;
  }

  private attemptView(attempt: TestAttempt) {
    const deadlines: number[] = [];
    if (attempt.startedAt && attempt.testMode === TestMode.TIMED && attempt.test.durationMinutes) {
      deadlines.push(attempt.startedAt.getTime() + attempt.test.durationMinutes * 60_000);
    }
    if (attempt.test.availableUntil) deadlines.push(attempt.test.availableUntil.getTime());
    const deadline = deadlines.length ? new Date(Math.min(...deadlines)) : null;
    return { ...attempt, deadline };
  }
}
