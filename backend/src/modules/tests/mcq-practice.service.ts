import { createHash, randomInt } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BundleTest } from '../../common/entities/bundle-test.entity';
import { Lecture } from '../../common/entities/lecture.entity';
import { Question, QuestionType } from '../../common/entities/question.entity';
import { TestAttempt, TestAttemptStatus, TestMode } from '../../common/entities/test-attempt.entity';
import { TestQuestion } from '../../common/entities/test-question.entity';
import { Test, TestType } from '../../common/entities/test.entity';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { Student } from '../users/entities/student.entity';
import { GeneratePracticeTestDto } from './dtos/tests.dto';

const PRACTICE_QUESTION_COUNT = 40;
const FINAL_QUESTION_COUNT = 200;
const FINAL_COURSE_COUNT = 5;
const FINAL_QUESTIONS_PER_COURSE = 40;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

type AccessibleLectureRow = { lecture_id: string };

type GeneratedPractice = {
  test: Test;
  attempt: TestAttempt & { test: Test };
  question_count: number;
};

@Injectable()
export class McqPracticeService {
  constructor(
    @InjectRepository(Question) private readonly questions: Repository<Question>,
    @InjectRepository(Lecture) private readonly lectures: Repository<Lecture>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    private readonly dataSource: DataSource,
  ) {}

  async generate(dto: GeneratePracticeTestDto, actor: AuthenticatedUser, rawIdempotencyKey?: string): Promise<GeneratedPractice> {
    if (![PRACTICE_QUESTION_COUNT, FINAL_QUESTION_COUNT].includes(dto.question_count)) {
      throw new BadRequestException('Assessments must contain either 40 practice MCQs or 200 final MCQs');
    }
    if (![TestMode.TUTOR, TestMode.TIMED].includes(dto.test_mode)) {
      throw new BadRequestException('Lecture practice is available in Tutor or Timed mode');
    }
    if (dto.test_mode === TestMode.TIMED && dto.duration_minutes !== dto.question_count) {
      throw new BadRequestException(
        `A timed ${dto.question_count}-MCQ exam must last exactly ${dto.question_count} minutes`,
      );
    }
    const uniqueLectureIds = [...new Set(dto.lecture_ids)];
    if (uniqueLectureIds.length !== dto.lecture_ids.length) {
      throw new BadRequestException('lecture_ids must not contain duplicates');
    }
    if (!(await this.students.exists({ where: { userId: actor.userId } }))) {
      throw new ForbiddenException('Student profile is required to generate a practice test');
    }

    const idempotencyKey = this.normalizeIdempotencyKey(rawIdempotencyKey);
    const fingerprint = idempotencyKey ? this.generationFingerprint(dto) : null;
    if (idempotencyKey && fingerprint) {
      const replay = await this.findGeneration(actor.userId, idempotencyKey, fingerprint);
      if (replay) return replay;
    }

    const accessRows = await this.dataSource.query<AccessibleLectureRow[]>(`
      SELECT DISTINCT lecture.id AS lecture_id
      FROM bundles bundle
      INNER JOIN bundle_enrollments enrollment
        ON enrollment.bundle_id = bundle.id AND enrollment.student_id = $2
      INNER JOIN bundle_courses bundle_course ON bundle_course.bundle_id = bundle.id
      INNER JOIN weeks week ON week.course_id = bundle_course.course_id
      INNER JOIN lectures lecture ON lecture.week_id = week.id
      WHERE bundle.id = $1
        AND (
          EXISTS (
            SELECT 1 FROM bundle_weeks selected
            WHERE selected.bundle_id = bundle.id AND selected.week_id = week.id
          )
          OR NOT EXISTS (
            SELECT 1
            FROM bundle_weeks selected
            INNER JOIN weeks selected_week ON selected_week.id = selected.week_id
            WHERE selected.bundle_id = bundle.id
              AND selected_week.course_id = bundle_course.course_id
          )
        )
        AND enrollment.status = 'ACTIVE'
        AND (enrollment.starts_at IS NULL OR enrollment.starts_at <= CURRENT_TIMESTAMP)
        AND (enrollment.expires_at IS NULL OR enrollment.expires_at > CURRENT_TIMESTAMP)
        AND enrollment.payment_status IN ('NOT_REQUIRED', 'PAID')
        AND bundle.status = 'PUBLISHED'
        AND (bundle.available_from IS NULL OR bundle.available_from <= CURRENT_TIMESTAMP)
        AND (bundle.available_until IS NULL OR bundle.available_until > CURRENT_TIMESTAMP)
        AND lecture.is_published = TRUE
    `, [dto.bundle_id, actor.userId]);

    if (!accessRows.length) {
      throw new ForbiddenException('This bundle does not grant active access to the selected content');
    }
    const accessibleIds = new Set(accessRows.map((row) => row.lecture_id));
    if (uniqueLectureIds.some((lectureId) => !accessibleIds.has(lectureId))) {
      throw new ForbiddenException('One or more lectures are outside this bundle');
    }

    const lectures = await this.lectures.createQueryBuilder('lecture')
      .leftJoinAndSelect('lecture.week', 'week')
      .leftJoinAndSelect('week.course', 'course')
      .where('lecture.id IN (:...lectureIds)', { lectureIds: uniqueLectureIds })
      .getMany();
    if (lectures.length !== uniqueLectureIds.length) throw new NotFoundException('One or more lectures were not found');
    const courseIds = new Set(lectures.map((lecture) => lecture.week.courseId));
    const bundleFinal = dto.question_count === FINAL_QUESTION_COUNT;
    if (!bundleFinal && courseIds.size !== 1) {
      throw new BadRequestException('A non-final practice must use lectures from one course');
    }
    if (bundleFinal && courseIds.size !== FINAL_COURSE_COUNT) {
      throw new BadRequestException('A 200-MCQ bundle final must contain exactly five courses');
    }

    const builder = this.questions.createQueryBuilder('question')
      .innerJoinAndSelect('question.topic', 'topic')
      .leftJoinAndSelect('question.options', 'options')
      .where('topic.lecture_id IN (:...lectureIds)', { lectureIds: uniqueLectureIds })
      .andWhere('question.is_active = TRUE')
      .andWhere('question.is_question_bank = TRUE')
      .andWhere('question.question_type = :questionType', { questionType: QuestionType.MCQ });
    if (dto.difficulty) builder.andWhere('question.difficulty = :difficulty', { difficulty: dto.difficulty });

    const eligibleById = new Map<string, Question>();
    for (const question of await builder.getMany()) {
      if (
        question.options.length === 5
        && question.options.filter((option) => option.isCorrect).length === 1
      ) {
        eligibleById.set(question.id, question);
      }
    }
    const eligible = [...eligibleById.values()];
    if (eligible.length < dto.question_count) {
      throw new BadRequestException(`Only ${eligible.length} eligible MCQs are available for this selection; ${dto.question_count} are required`);
    }
    const shuffle = <T>(items: T[]) => {
      for (let index = items.length - 1; index > 0; index -= 1) {
        const target = randomInt(index + 1);
        [items[index], items[target]] = [items[target], items[index]];
      }
      return items;
    };
    let selected: Question[];
    if (bundleFinal) {
      const courseByLecture = new Map(lectures.map((lecture) => [lecture.id, lecture.week.courseId]));
      const byCourse = new Map<string, Question[]>();
      for (const question of eligible) {
        const courseId = courseByLecture.get(question.topic.lectureId);
        if (!courseId) continue;
        const items = byCourse.get(courseId) ?? [];
        items.push(question);
        byCourse.set(courseId, items);
      }
      for (const courseId of courseIds) {
        const available = byCourse.get(courseId)?.length ?? 0;
        if (available < FINAL_QUESTIONS_PER_COURSE) {
          throw new BadRequestException(`Course ${courseId} has only ${available} eligible five-option MCQs; 40 are required`);
        }
      }
      selected = [...courseIds].flatMap((courseId) =>
        shuffle(byCourse.get(courseId)!).slice(0, FINAL_QUESTIONS_PER_COURSE),
      );
    } else {
      selected = shuffle(eligible).slice(0, dto.question_count);
    }
    const courseId = bundleFinal ? null : lectures[0].week.courseId;

    return this.dataSource.transaction(async (manager) => {
      if (idempotencyKey && fingerprint) {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`practice-generation:${actor.userId}:${idempotencyKey}`],
        );
        const replay = await this.findGeneration(actor.userId, idempotencyKey, fingerprint, manager);
        if (replay) return replay;
      }

      const now = new Date();
      const total = selected.reduce((sum, question) => sum + Number(question.marks), 0);
      const test = await manager.save(Test, manager.create(Test, {
        title: bundleFinal
          ? `200-MCQ Bundle Final · ${now.toISOString().slice(0, 10)}`
          : `${dto.question_count}-MCQ ${dto.test_mode === TestMode.TIMED ? 'Timed' : 'Tutor'} practice · ${now.toISOString().slice(0, 10)}`,
        description: bundleFinal
          ? 'Generated as 40 MCQs from each of five courses.'
          : `Generated from ${lectures.length} selected lecture${lectures.length === 1 ? '' : 's'}`,
        testType: TestType.CUSTOM,
        courseId,
        weekId: null,
        lectureId: null,
        durationMinutes: dto.test_mode === TestMode.TIMED ? dto.duration_minutes! : null,
        totalMarks: total.toFixed(2),
        passingMarks: null,
        isPublished: true,
        availableFrom: null,
        availableUntil: null,
        generationKey: idempotencyKey,
        generationFingerprint: fingerprint,
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
        testMode: dto.test_mode,
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

  private normalizeIdempotencyKey(raw?: string): string | null {
    const key = raw?.trim();
    if (!key) return null;
    if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw new BadRequestException('Idempotency-Key must be 8-128 characters using letters, numbers, dot, underscore, colon, or dash');
    }
    return key;
  }

  private generationFingerprint(dto: GeneratePracticeTestDto): string {
    const canonical = {
      bundle_id: dto.bundle_id,
      lecture_ids: [...new Set(dto.lecture_ids)].sort(),
      question_count: dto.question_count,
      test_mode: dto.test_mode,
      duration_minutes: dto.duration_minutes ?? null,
      difficulty: dto.difficulty ?? null,
    };
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  private async findGeneration(
    actorId: string,
    key: string,
    fingerprint: string,
    manager?: EntityManager,
  ): Promise<GeneratedPractice | null> {
    const testRepository = manager?.getRepository(Test) ?? this.dataSource.getRepository(Test);
    const test = await testRepository.createQueryBuilder('test')
      .addSelect('test.generationKey')
      .addSelect('test.generationFingerprint')
      .where('test.created_by = :actorId', { actorId })
      .andWhere('test.generation_key = :key', { key })
      .getOne();
    if (!test) return null;
    if (test.generationFingerprint !== fingerprint) {
      throw new ConflictException('This Idempotency-Key was already used for a different practice request');
    }
    const attemptRepository = manager?.getRepository(TestAttempt) ?? this.dataSource.getRepository(TestAttempt);
    const questionRepository = manager?.getRepository(TestQuestion) ?? this.dataSource.getRepository(TestQuestion);
    const attempt = await attemptRepository.findOne({
      where: { testId: test.id, studentId: actorId },
      order: { createdAt: 'ASC' },
    });
    if (!attempt) throw new ConflictException('The prior idempotent practice request is incomplete; contact support before retrying');
    const questionCount = await questionRepository.count({ where: { testId: test.id } });
    return { test, attempt: { ...attempt, test }, question_count: questionCount };
  }
}
