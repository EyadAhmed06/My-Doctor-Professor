import { randomInt } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BundleTest } from '../../common/entities/bundle-test.entity';
import { EssayConfiguration } from '../../common/entities/essay-configuration.entity';
import { Lecture } from '../../common/entities/lecture.entity';
import { Question, QuestionType } from '../../common/entities/question.entity';
import { StudentAnswer } from '../../common/entities/student-answer.entity';
import { TestAttempt, TestAttemptStatus, TestMode } from '../../common/entities/test-attempt.entity';
import { TestQuestion } from '../../common/entities/test-question.entity';
import { Test, TestType } from '../../common/entities/test.entity';
import { BundleAccessService } from '../bundle-access/bundle-access.service';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { Student } from '../users/entities/student.entity';
import { GenerateEssayPracticeDto, SubmitEssayPracticeAnswerDto } from './dtos/essay-practice.dto';

const ESSAY_PRACTICE_SIZE = 10;
type AccessibleLectureRow = { lecture_id: string; read_only: boolean };

@Injectable()
export class EssayPracticeService {
  constructor(
    @InjectRepository(Question) private readonly questions: Repository<Question>,
    @InjectRepository(Lecture) private readonly lectures: Repository<Lecture>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(TestAttempt) private readonly attempts: Repository<TestAttempt>,
    private readonly bundleAccess: BundleAccessService,
    @InjectRepository(TestQuestion) private readonly testQuestions: Repository<TestQuestion>,
    @InjectRepository(StudentAnswer) private readonly answers: Repository<StudentAnswer>,
    @InjectRepository(EssayConfiguration) private readonly essayConfigs: Repository<EssayConfiguration>,
    private readonly dataSource: DataSource,
  ) {}

  async generate(dto: GenerateEssayPracticeDto, actor: AuthenticatedUser) {
    if (!(await this.students.exists({ where: { userId: actor.userId } }))) {
      throw new ForbiddenException('Student profile is required to generate an essay practice quiz');
    }
    const accessRows = await this.accessibleLectures(dto.bundle_id, actor.userId);
    if (!accessRows.length) throw new ForbiddenException('This bundle does not grant access to the selected content');
    if (accessRows.some((row) => row.read_only)) throw new ForbiddenException('This bundle is read-only');
    const accessibleIds = new Set(accessRows.map((row) => row.lecture_id));
    if (dto.lecture_ids.some((lectureId) => !accessibleIds.has(lectureId))) {
      throw new ForbiddenException('One or more lectures are outside this bundle');
    }

    const lectures = await this.lectures.createQueryBuilder('lecture')
      .leftJoinAndSelect('lecture.week', 'week')
      .leftJoinAndSelect('week.course', 'course')
      .where('lecture.id IN (:...lectureIds)', { lectureIds: dto.lecture_ids })
      .getMany();
    if (lectures.length !== dto.lecture_ids.length) throw new NotFoundException('One or more lectures were not found');
    const courseIds = new Set(lectures.map((lecture) => lecture.week.courseId));
    if (courseIds.size !== 1) throw new BadRequestException('All selected lectures must belong to the same course');

    const eligible = await this.questions.createQueryBuilder('question')
      .innerJoinAndSelect('question.topic', 'topic')
      .leftJoinAndSelect('question.essayConfiguration', 'essayConfiguration')
      .where('topic.lecture_id IN (:...lectureIds)', { lectureIds: dto.lecture_ids })
      .andWhere('question.is_active = TRUE')
      .andWhere('question.is_question_bank = TRUE')
      .andWhere('question.question_type = :type', { type: QuestionType.ESSAY })
      .andWhere('essayConfiguration.model_answer IS NOT NULL')
      .getMany();

    if (eligible.length < ESSAY_PRACTICE_SIZE) {
      throw new BadRequestException(`Only ${eligible.length} eligible essay questions are available for this selection; ${ESSAY_PRACTICE_SIZE} are required`);
    }
    for (let index = eligible.length - 1; index > 0; index -= 1) {
      const target = randomInt(index + 1);
      [eligible[index], eligible[target]] = [eligible[target], eligible[index]];
    }
    const selected = eligible.slice(0, ESSAY_PRACTICE_SIZE);
    const courseId = lectures[0].week.courseId;

    return this.dataSource.transaction(async (manager) => {
      const now = new Date();
      const total = selected.reduce((sum, question) => sum + Number(question.marks), 0);
      const test = await manager.save(Test, manager.create(Test, {
        title: `10-Question Essay Practice · ${now.toISOString().slice(0, 10)}`,
        description: `Generated from ${lectures.length} selected lecture${lectures.length === 1 ? '' : 's'}. Submit each response before revealing the model answer.`,
        testType: TestType.CUSTOM,
        courseId,
        weekId: null,
        lectureId: null,
        durationMinutes: null,
        totalMarks: total.toFixed(2),
        passingMarks: null,
        isPublished: true,
        availableFrom: null,
        availableUntil: null,
        createdBy: actor.userId,
      }));
      await manager.save(BundleTest, manager.create(BundleTest, { bundleId: dto.bundle_id, testId: test.id }));
      await manager.save(TestQuestion, selected.map((question, index) => manager.create(TestQuestion, {
        testId: test.id,
        questionId: question.id,
        displayOrder: index + 1,
        marks: question.marks,
        timeLimitSeconds: null,
      })));
      const attempt = await manager.save(TestAttempt, manager.create(TestAttempt, {
        studentId: actor.userId,
        testId: test.id,
        testMode: TestMode.TUTOR,
        status: TestAttemptStatus.IN_PROGRESS,
        score: null,
        startedAt: now,
        submittedAt: null,
        lastActivityAt: now,
        autoSubmitted: false,
      }));
      return { test, attempt: { ...attempt, test }, question_count: selected.length };
    });
  }

  async workspace(attemptId: string, actor: AuthenticatedUser) {
    const attempt = await this.requireOpenAttempt(attemptId, actor);
    const assignments = await this.testQuestions.find({
      where: { testId: attempt.testId },
      relations: { question: { topic: { lecture: { week: true } }, essayConfiguration: true } },
      order: { displayOrder: 'ASC' },
    });
    const answers = await this.answers.find({ where: { attemptId } });
    const byQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
    return {
      attempt: { id: attempt.id, testId: attempt.testId, status: attempt.status, startedAt: attempt.startedAt },
      questions: assignments.map((assignment) => ({
        question_id: assignment.questionId,
        display_order: assignment.displayOrder,
        marks: assignment.marks,
        title: assignment.question.title,
        question_text: assignment.question.questionText,
        lecture: {
          id: assignment.question.topic.lecture.id,
          title: assignment.question.topic.lecture.title,
          week_number: assignment.question.topic.lecture.week.weekNumber,
        },
        minimum_word_count: assignment.question.essayConfiguration?.minimumWordCount ?? null,
        maximum_word_count: assignment.question.essayConfiguration?.maximumWordCount ?? null,
        submitted_answer: byQuestion.get(assignment.questionId)?.essayAnswer ?? null,
        submitted: Boolean(byQuestion.get(assignment.questionId)?.essayAnswer),
      })),
    };
  }

  async submitAnswer(attemptId: string, questionId: string, dto: SubmitEssayPracticeAnswerDto, actor: AuthenticatedUser) {
    const attempt = await this.requireOpenAttempt(attemptId, actor);
    const assignment = await this.testQuestions.findOne({
      where: { testId: attempt.testId, questionId },
      relations: { question: { essayConfiguration: true } },
    });
    if (!assignment || assignment.question.questionType !== QuestionType.ESSAY) {
      throw new NotFoundException('Essay question is not assigned to this practice attempt');
    }
    const existing = await this.answers.findOne({ where: { attemptId, questionId } });
    if (existing?.essayAnswer) throw new ConflictException('This essay response has already been submitted and is locked');
    const essayAnswer = dto.essay_answer.trim();
    if (!essayAnswer) throw new BadRequestException('Write an answer before submitting');
    const words = essayAnswer.split(/\s+/).length;
    const config = assignment.question.essayConfiguration;
    if (config?.minimumWordCount && words < config.minimumWordCount) throw new BadRequestException(`Essay requires at least ${config.minimumWordCount} words`);
    if (config?.maximumWordCount && words > config.maximumWordCount) throw new BadRequestException(`Essay allows at most ${config.maximumWordCount} words`);

    const answer = existing ?? this.answers.create({
      attemptId,
      questionId,
      selectedOptionId: null,
      essayAnswer: null,
      awardedMarks: null,
      isCorrect: null,
      feedback: null,
      gradedBy: null,
      gradedAt: null,
      answeredAt: null,
    });
    answer.essayAnswer = essayAnswer;
    answer.answeredAt = new Date();
    await this.answers.save(answer);
    attempt.lastActivityAt = new Date();
    await this.attempts.save(attempt);
    return { question_id: questionId, submitted: true, essay_answer: essayAnswer, word_count: words, reveal_available: true };
  }

  async revealAnswer(attemptId: string, questionId: string, actor: AuthenticatedUser) {
    const attempt = await this.requireOpenAttempt(attemptId, actor);
    const assignment = await this.testQuestions.findOne({ where: { testId: attempt.testId, questionId } });
    if (!assignment) throw new NotFoundException('Question is not assigned to this practice attempt');
    const answer = await this.answers.findOne({ where: { attemptId, questionId } });
    if (!answer?.essayAnswer?.trim()) throw new ForbiddenException('Submit your own answer before revealing the model answer');
    const config = await this.essayConfigs.findOne({ where: { questionId } });
    if (!config?.modelAnswer?.trim()) throw new NotFoundException('No model answer is published for this essay question');
    return { question_id: questionId, model_answer: config.modelAnswer, grading_rubric: config.gradingRubric };
  }

  private async requireOpenAttempt(id: string, actor: AuthenticatedUser) {
    const attempt = await this.attempts.findOne({ where: { id }, relations: { test: true } });
    if (!attempt) throw new NotFoundException('Practice attempt not found');
    if (attempt.studentId !== actor.userId) throw new ForbiddenException('This practice attempt belongs to another student');
    if (attempt.status !== TestAttemptStatus.IN_PROGRESS) throw new ConflictException('This practice attempt is no longer open');
    return attempt;
  }

  private accessibleLectures(bundleId: string, studentId: string) {
    return this.dataSource.query<AccessibleLectureRow[]>(`
      SELECT lecture.id AS lecture_id, (
        bundle.status = 'ARCHIVED'
        OR enrollment.status = 'EXPIRED'
        OR (enrollment.expires_at IS NOT NULL AND enrollment.expires_at <= CURRENT_TIMESTAMP)
        OR (bundle.available_until IS NOT NULL AND bundle.available_until <= CURRENT_TIMESTAMP)
      ) AS read_only
      FROM bundles bundle
      INNER JOIN bundle_enrollments enrollment ON enrollment.bundle_id = bundle.id AND enrollment.student_id = $2
      INNER JOIN bundle_courses bundle_course ON bundle_course.bundle_id = bundle.id
      INNER JOIN bundle_weeks bundle_week ON bundle_week.bundle_id = bundle.id
      INNER JOIN weeks week ON week.id = bundle_week.week_id AND week.course_id = bundle_course.course_id
      INNER JOIN lectures lecture ON lecture.week_id = week.id
      WHERE bundle.id = $1
        AND enrollment.status <> 'REVOKED'
        AND bundle.status IN ('PUBLISHED', 'ARCHIVED')
        AND (bundle.available_from IS NULL OR bundle.available_from <= CURRENT_TIMESTAMP)
        AND lecture.is_published = TRUE
    `, [bundleId, studentId]);
  }
}
