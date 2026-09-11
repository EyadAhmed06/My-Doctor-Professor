import { BadRequestException, ConflictException } from '@nestjs/common';
import { TestAttempt, TestMode } from '../../common/entities/test-attempt.entity';
import { TestQuestion } from '../../common/entities/test-question.entity';
import { Test } from '../../common/entities/test.entity';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { GeneratePracticeTestDto } from './dtos/tests.dto';
import { BundleAccessService } from '../bundle-access/bundle-access.service';
import { McqPracticeService } from './mcq-practice.service';

const actor: AuthenticatedUser = {
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  email: 'student@example.test',
  role: UserRole.STUDENT,
};

const dto: GeneratePracticeTestDto = {
  bundle_id: '33333333-3333-4333-8333-333333333333',
  lecture_ids: ['44444444-4444-4444-8444-444444444444'],
  question_count: 40,
  test_mode: TestMode.TUTOR,
};

function replayBuilder(test: Test) {
  return {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(test),
  };
}

describe('McqPracticeService idempotency', () => {
  const createService = (
    questions = {} as never,
    lectures = {} as never,
    students = { exists: jest.fn().mockResolvedValue(true) } as never,
    dataSource = { query: jest.fn() } as never,
  ) => {
    const bundleAccess = new BundleAccessService(dataSource);
    return new McqPracticeService(questions, lectures, students, dataSource, bundleAccess);
  };

  it('rejects malformed idempotency keys before any bundle query runs', async () => {
    const query = jest.fn();
    const service = createService(
      {} as never,
      {} as never,
      { exists: jest.fn().mockResolvedValue(true) } as never,
      { query } as never,
    );

    await expect(service.generate(dto, actor, 'bad key with spaces'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects duplicate lecture ids even if the caller bypasses DTO validation', async () => {
    const service = createService();

    await expect(service.generate({
      ...dto,
      lecture_ids: [dto.lecture_ids[0], dto.lecture_ids[0]],
    }, actor)).rejects.toThrow('lecture_ids must not contain duplicates');
  });

  it('replays the original generated test and attempt for the same key and payload', async () => {
    const query = jest.fn();
    const attempt = {
      id: '55555555-5555-4555-8555-555555555555',
      studentId: actor.userId,
      testId: '66666666-6666-4666-8666-666666666666',
      testMode: TestMode.TUTOR,
    } as TestAttempt;
    const dataSource = {
      query,
      getRepository: jest.fn(),
    };
    const service = createService(
      {} as never,
      {} as never,
      { exists: jest.fn().mockResolvedValue(true) } as never,
      dataSource as never,
    );
    const fingerprint = (service as unknown as { generationFingerprint(input: GeneratePracticeTestDto): string })
      .generationFingerprint(dto);
    const test = {
      id: attempt.testId,
      createdBy: actor.userId,
      generationKey: 'practice-retry-0001',
      generationFingerprint: fingerprint,
    } as Test;
    const builder = replayBuilder(test);
    dataSource.getRepository.mockImplementation((entity) => {
      if (entity === Test) return { createQueryBuilder: jest.fn().mockReturnValue(builder) };
      if (entity === TestAttempt) return { findOne: jest.fn().mockResolvedValue(attempt) };
      if (entity === TestQuestion) return { count: jest.fn().mockResolvedValue(40) };
      throw new Error('Unexpected repository access');
    });

    const result = await service.generate(dto, actor, 'practice-retry-0001');

    expect(result.test.id).toBe(test.id);
    expect(result.attempt.id).toBe(attempt.id);
    expect(result.question_count).toBe(40);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects reusing an idempotency key for a different request fingerprint', async () => {
    const dataSource = { query: jest.fn(), getRepository: jest.fn() };
    const service = createService(
      {} as never,
      {} as never,
      { exists: jest.fn().mockResolvedValue(true) } as never,
      dataSource as never,
    );
    const existing = {
      id: '66666666-6666-4666-8666-666666666666',
      createdBy: actor.userId,
      generationKey: 'practice-retry-0002',
      generationFingerprint: 'not-the-current-fingerprint',
    } as Test;
    dataSource.getRepository.mockImplementation((entity) => {
      if (entity === Test) return { createQueryBuilder: jest.fn().mockReturnValue(replayBuilder(existing)) };
      throw new Error('Unexpected repository access');
    });

    await expect(service.generate(dto, actor, 'practice-retry-0002'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
