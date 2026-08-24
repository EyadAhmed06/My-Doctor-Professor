import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BundleTest } from '../../common/entities/bundle-test.entity';
import { Lecture } from '../../common/entities/lecture.entity';
import { Question, QuestionType } from '../../common/entities/question.entity';
import { TestAttempt, TestAttemptStatus, TestMode } from '../../common/entities/test-attempt.entity';
import { TestQuestion } from '../../common/entities/test-question.entity';
import { Test, TestType } from '../../common/entities/test.entity';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { Student } from '../users/entities/student.entity';
import { GeneratePracticeTestDto } from './dtos/tests.dto';

const ALLOWED_PRACTICE_SIZES = [40, 200] as const;

type AccessibleLectureRow = { lecture_id: string; read_only: boolean };

@Injectable()
export class McqPracticeService {
  constructor(
    @InjectRepository(Question) private readonly questions: Repository<Question>,
    @InjectRepository(Lecture) private readonly lectures: Repository<Lecture>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    private readonly dataSource: DataSource,
  ) {}

  async generate(dto: GeneratePracticeTestDto, actor: AuthenticatedUser) {
    if (!ALLOWED_PRACTICE_SIZES.includes(dto.question_count as 40 | 200)) {
      throw new BadRequestException('Lecture practice must contain either 40 or 200 MCQs');
    }
    if (![TestMode.TUTOR, TestMode.TIMED].includes(dto.test_mode)) {
      throw new BadRequestException('Lecture practice is available in Tutor or Timed mode');
    }
    if (dto.test_mode === TestMode.TIMED && dto.duration_minutes !== dto.question_count) {
      throw new BadRequestException(
        `A timed ${dto.question_count}-MCQ exam must last exactly ${dto.question_count} minutes`,
      );
    }
    if (!(await this.students.exists({ where: { userId: actor.userId } }))) {
      throw new ForbiddenException('Student profile is required to generate a practice test');
    }

    const accessRows = await this.dataSource.query<AccessibleLectureRow[]>(`
      SELECT lecture.id AS lecture_id, (
        bundle.status = 'ARCHIVED'
        OR enrollment.status = 'EXPIRED'
        OR (enrollment.expires_at IS NOT NULL AND enrollment.expires_at <= CURRENT_TIMESTAMP)
        OR (bundle.available_until IS NOT NULL AND bundle.available_until <= CURRENT_TIMESTAMP)
      ) AS read_only
      FROM bundles bundle
      INNER JOIN bundle_enrollments enrollment
        ON enrollment.bundle_id = bundle.id AND enrollment.student_id = $2
      INNER JOIN bundle_courses bundle_course ON bundle_course.bundle_id = bundle.id
      INNER JOIN bundle_weeks bundle_week ON bundle_week.bundle_id = bundle.id
      INNER JOIN weeks week
        ON week.id = bundle_week.week_id AND week.course_id = bundle_course.course_id
      INNER JOIN lectures lecture ON lecture.week_id = week.id
      WHERE bundle.id = $1
        AND enrollment.status <> 'REVOKED'
        AND enrollment.payment_status IN ('NOT_REQUIRED', 'PAID')
        AND bundle.status IN ('PUBLISHED', 'ARCHIVED')
        AND (bundle.available_from IS NULL OR bundle.available_from <= CURRENT_TIMESTAMP)
        AND lecture.is_published = TRUE
    `, [dto.bundle_id, actor.userId]);

    if (!accessRows.length) throw new ForbiddenException('This bundle does not grant access to the selected content');
    if (accessRows[0].read_only) throw new ForbiddenException('This bundle is read-only');
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

    const builder = this.questions.createQueryBuilder('question')
      .innerJoinAndSelect('question.topic', 'topic')
      .leftJoinAndSelect('question.options', 'options')
      .where('topic.lecture_id IN (:...lectureIds)', { lectureIds: dto.lecture_ids })
      .andWhere('question.is_active = TRUE')
      .andWhere('question.is_question_bank = TRUE')
      .andWhere('question.question_type = :questionType', { questionType: QuestionType.MCQ });
    if (dto.difficulty) builder.andWhere('question.difficulty = :difficulty', { difficulty: dto.difficulty });

    const eligible = await builder.getMany();
    if (eligible.length < dto.question_count) {
      throw new BadRequestException(`Only ${eligible.length} eligible MCQs are available for this selection; ${dto.question_count} are required`);
    }
    for (let index = eligible.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [eligible[index], eligible[target]] = [eligible[target], eligible[index]];
    }
    const selected = eligible.slice(0, dto.question_count);
    const courseId = lectures[0].week.courseId;

    return this.dataSource.transaction(async (manager) => {
      const now = new Date();
      const total = selected.reduce((sum, question) => sum + Number(question.marks), 0);
      const test = await manager.save(Test, manager.create(Test, {
        title: `${dto.question_count}-MCQ ${dto.test_mode === TestMode.TIMED ? 'Timed' : 'Tutor'} practice · ${now.toISOString().slice(0, 10)}`,
        description: `Generated from ${lectures.length} selected lecture${lectures.length === 1 ? '' : 's'}`,
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
}
