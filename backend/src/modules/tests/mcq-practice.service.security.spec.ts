import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TestMode } from '../../common/entities/test-attempt.entity';
import { UserRole } from '../users/entities/user.entity';
import { BundleAccessService } from '../bundle-access/bundle-access.service';
import { McqPracticeService } from './mcq-practice.service';

describe('McqPracticeService security', () => {
  const actor = {
    userId: '33333333-3333-4333-8333-333333333333',
    sessionId: '44444444-4444-4444-8444-444444444444',
    email: 'student@example.com',
    role: UserRole.STUDENT,
  };

  const createService = (
    questions = {} as never,
    lectures = {} as never,
    students = { exists: jest.fn().mockResolvedValue(true) } as never,
    dataSource = { query: jest.fn() } as never,
  ) => {
    const bundleAccess = new BundleAccessService(dataSource);
    return new McqPracticeService(questions, lectures, students, dataSource, bundleAccess);
  };

  it('rejects legacy 10/20-question payloads so generated quizzes match the 40-question launch contract', async () => {
    const service = createService();

    await expect(service.generate({
      bundle_id: '11111111-1111-4111-8111-111111111111',
      lecture_ids: ['22222222-2222-4222-8222-222222222222'],
      question_count: 20,
      test_mode: TestMode.TUTOR,
    }, actor)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires an ACTIVE, current, paid-or-free entitlement before selecting lectures', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = createService(
      {} as never,
      {} as never,
      { exists: jest.fn().mockResolvedValue(true) } as never,
      { query } as never,
    );

    await expect(service.generate({
      bundle_id: '11111111-1111-4111-8111-111111111111',
      lecture_ids: ['22222222-2222-4222-8222-222222222222'],
      question_count: 40,
      test_mode: TestMode.TIMED,
      duration_minutes: 40,
    }, actor)).rejects.toBeInstanceOf(ForbiddenException);

    const entitlementSql = String(query.mock.calls[0][0]);
    expect(entitlementSql).toContain("enrollment.status = 'ACTIVE'");
    expect(entitlementSql).toContain('(enrollment.starts_at IS NULL OR enrollment.starts_at <= CURRENT_TIMESTAMP)');
    expect(entitlementSql).toContain("bundle.status = 'PUBLISHED'");
    expect(entitlementSql).toContain('bundle.available_until > CURRENT_TIMESTAMP');
  });

  it('treats every 200-question request as a five-course final instead of allowing 200 questions from one course', async () => {
    const lectureId = '22222222-2222-4222-8222-222222222222';
    const lectureBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: lectureId, week: { courseId: 'course-1' } }]),
    };
    const service = createService(
      {} as never,
      { createQueryBuilder: jest.fn().mockReturnValue(lectureBuilder) } as never,
      { exists: jest.fn().mockResolvedValue(true) } as never,
      { query: jest.fn().mockResolvedValue([{ lecture_id: lectureId }]) } as never,
    );

    await expect(service.generate({
      bundle_id: '11111111-1111-4111-8111-111111111111',
      lecture_ids: [lectureId],
      question_count: 200,
      test_mode: TestMode.TIMED,
      duration_minutes: 200,
    }, actor)).rejects.toThrow('exactly five courses');
  });

  it('requires at least 40 eligible MCQs in each of the five final courses, not only 200 in total', async () => {
    const lectureIds = Array.from({ length: 5 }, (_, index) => `lecture-${index + 1}`);
    const courseIds = Array.from({ length: 5 }, (_, index) => `course-${index + 1}`);
    const lectures = lectureIds.map((id, index) => ({ id, week: { courseId: courseIds[index] } }));
    const lectureBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(lectures),
    };
    const validOptions = Array.from({ length: 5 }, (_, index) => ({ isCorrect: index === 0 }));
    const counts = [39, 41, 40, 40, 40];
    const questions = counts.flatMap((count, courseIndex) => Array.from({ length: count }, (_, questionIndex) => ({
      id: `question-${courseIndex + 1}-${questionIndex + 1}`,
      topic: { lectureId: lectureIds[courseIndex] },
      options: validOptions,
    })));
    expect(questions).toHaveLength(200);
    const questionBuilder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(questions),
    };
    const service = createService(
      { createQueryBuilder: jest.fn().mockReturnValue(questionBuilder) } as never,
      { createQueryBuilder: jest.fn().mockReturnValue(lectureBuilder) } as never,
      { exists: jest.fn().mockResolvedValue(true) } as never,
      { query: jest.fn().mockResolvedValue(lectureIds.map((lecture_id) => ({ lecture_id }))) } as never,
    );

    await expect(service.generate({
      bundle_id: '11111111-1111-4111-8111-111111111111',
      lecture_ids: lectureIds,
      question_count: 200,
      test_mode: TestMode.TIMED,
      duration_minutes: 200,
    }, actor)).rejects.toThrow('Course course-1 has only 39 eligible five-option MCQs; 40 are required');
  });

  it('counts duplicate question rows only once before enforcing the 40-question invariant', async () => {
    const lectureId = '22222222-2222-4222-8222-222222222222';
    const courseId = '55555555-5555-4555-8555-555555555555';
    const lectureBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: lectureId, week: { courseId } }]),
    };
    const validOptions = Array.from({ length: 5 }, (_, index) => ({ isCorrect: index === 0 }));
    const uniqueQuestions = Array.from({ length: 39 }, (_, index) => ({
      id: `question-${index}`,
      topic: { lectureId },
      options: validOptions,
    }));
    const questions = [...uniqueQuestions, uniqueQuestions[0]];
    expect(questions).toHaveLength(40);
    const questionBuilder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(questions),
    };
    const service = createService(
      { createQueryBuilder: jest.fn().mockReturnValue(questionBuilder) } as never,
      { createQueryBuilder: jest.fn().mockReturnValue(lectureBuilder) } as never,
      { exists: jest.fn().mockResolvedValue(true) } as never,
      { query: jest.fn().mockResolvedValue([{ lecture_id: lectureId }]) } as never,
    );

    await expect(service.generate({
      bundle_id: '11111111-1111-4111-8111-111111111111',
      lecture_ids: [lectureId],
      question_count: 40,
      test_mode: TestMode.TUTOR,
    }, actor)).rejects.toThrow('Only 39 eligible MCQs');
  });

  it('does not count malformed historical MCQs with fewer than five options as eligible', async () => {
    const lectureId = '22222222-2222-4222-8222-222222222222';
    const courseId = '55555555-5555-4555-8555-555555555555';
    const lectureBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: lectureId, week: { courseId } }]),
    };
    const validOptions = Array.from({ length: 5 }, (_, index) => ({ isCorrect: index === 0 }));
    const questions = Array.from({ length: 40 }, (_, index) => ({
      id: `question-${index}`,
      options: index === 39 ? validOptions.slice(0, 4) : validOptions,
    }));
    const questionBuilder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(questions),
    };
    const service = createService(
      { createQueryBuilder: jest.fn().mockReturnValue(questionBuilder) } as never,
      { createQueryBuilder: jest.fn().mockReturnValue(lectureBuilder) } as never,
      { exists: jest.fn().mockResolvedValue(true) } as never,
      { query: jest.fn().mockResolvedValue([{ lecture_id: lectureId }]) } as never,
    );

    await expect(service.generate({
      bundle_id: '11111111-1111-4111-8111-111111111111',
      lecture_ids: [lectureId],
      question_count: 40,
      test_mode: TestMode.TUTOR,
    }, actor)).rejects.toThrow('Only 39 eligible MCQs');
  });
});
