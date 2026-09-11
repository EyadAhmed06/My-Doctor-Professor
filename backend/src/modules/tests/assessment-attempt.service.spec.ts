import { ConflictException } from '@nestjs/common';
import { McqOption } from '../../common/entities/mcq-option.entity';
import { Question, QuestionType } from '../../common/entities/question.entity';
import { StudentAnswer } from '../../common/entities/student-answer.entity';
import { TestAttempt, TestAttemptStatus, TestMode } from '../../common/entities/test-attempt.entity';
import { TestQuestion } from '../../common/entities/test-question.entity';
import { Test, TestType } from '../../common/entities/test.entity';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { AssessmentAttemptService } from './assessment-attempt.service';

const actor: AuthenticatedUser = {
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  email: 'student@example.test',
  role: UserRole.STUDENT,
};

function testRecord(overrides: Partial<Test> = {}): Test {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    title: 'Practice',
    description: null,
    testType: TestType.CUSTOM,
    courseId: null,
    weekId: null,
    lectureId: null,
    durationMinutes: 40,
    totalMarks: '40.00',
    passingMarks: null,
    isPublished: true,
    availableFrom: null,
    availableUntil: null,
    generationKey: null,
    generationFingerprint: null,
    createdBy: actor.userId,
    createdAt: new Date('2026-08-28T10:00:00.000Z'),
    updatedAt: new Date('2026-08-28T10:00:00.000Z'),
    course: null,
    week: null,
    lecture: null,
    creator: {} as Test['creator'],
    questions: [],
    attempts: [],
    ...overrides,
  };
}

function validMcq(): Question {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    questionType: QuestionType.MCQ,
    options: Array.from({ length: 5 }, (_, index) => ({
      id: `55555555-5555-4555-8555-55555555555${index}`,
      questionId: '44444444-4444-4444-8444-444444444444',
      optionText: `Option ${index + 1}`,
      isCorrect: index === 0,
      displayOrder: index + 1,
      explanation: null,
      createdAt: new Date(),
    } as McqOption)),
  } as Question;
}

function assignment(question = validMcq()): TestQuestion {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    testId: '33333333-3333-4333-8333-333333333333',
    questionId: question.id,
    displayOrder: 1,
    marks: '1.00',
    timeLimitSeconds: null,
    createdAt: new Date(),
    test: testRecord(),
    question,
  };
}

import { BundleAccessService } from '../bundle-access/bundle-access.service';

function baseService(options: {
  test?: Test;
  assignments?: TestQuestion[];
  dataSource?: Record<string, unknown>;
} = {}) {
  const test = options.test ?? testRecord();
  const assignments = options.assignments ?? [assignment()];
  const dataSource = {
    query: jest.fn().mockResolvedValue([{ allowed: 1 }]),
    ...options.dataSource,
  } as never;
  const bundleAccess = new BundleAccessService(dataSource);
  return new AssessmentAttemptService(
    { findOne: jest.fn().mockResolvedValue(test) } as never,
    { find: jest.fn().mockResolvedValue(assignments) } as never,
    {} as never,
    {} as never,
    {} as never,
    { exists: jest.fn().mockResolvedValue(true) } as never,
    dataSource,
    bundleAccess,
  );
}

describe('AssessmentAttemptService', () => {
  it('returns the same active attempt for a repeated same-mode start request', async () => {
    const existing = {
      id: '77777777-7777-4777-8777-777777777777',
      studentId: actor.userId,
      testId: testRecord().id,
      testMode: TestMode.TUTOR,
      status: TestAttemptStatus.IN_PROGRESS,
      startedAt: new Date(),
    } as TestAttempt;
    const save = jest.fn();
    const attemptRepository = { findOne: jest.fn().mockResolvedValue(existing), save, create: jest.fn() };
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockReturnValue(attemptRepository),
    };
    const service = baseService({
      dataSource: { transaction: jest.fn().mockImplementation(async (callback) => callback(manager)) },
    });

    const result = await service.startAttempt(testRecord().id, { test_mode: TestMode.TUTOR }, actor);

    expect(result.id).toBe(existing.id);
    expect(attemptRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({
      lock: { mode: 'pessimistic_write' },
    }));
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects a different mode while another mode is actively running', async () => {
    const existing = {
      id: '77777777-7777-4777-8777-777777777777',
      studentId: actor.userId,
      testId: testRecord().id,
      testMode: TestMode.TIMED,
      status: TestAttemptStatus.IN_PROGRESS,
      startedAt: new Date(),
    } as TestAttempt;
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockReturnValue({ findOne: jest.fn().mockResolvedValue(existing) }),
    };
    const service = baseService({
      dataSource: { transaction: jest.fn().mockImplementation(async (callback) => callback(manager)) },
    });

    await expect(service.startAttempt(testRecord().id, { test_mode: TestMode.TUTOR }, actor))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks starting when an attached MCQ has fewer than five options', async () => {
    const malformed = validMcq();
    malformed.options = malformed.options.slice(0, 4);
    const transaction = jest.fn();
    const service = baseService({
      assignments: [assignment(malformed)],
      dataSource: { transaction },
    });

    await expect(service.startAttempt(testRecord().id, { test_mode: TestMode.TUTOR }, actor))
      .rejects.toThrow('exactly five options');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('makes repeated submit idempotent once the attempt is already closed', async () => {
    const test = testRecord();
    const submitted = {
      id: '77777777-7777-4777-8777-777777777777',
      studentId: actor.userId,
      testId: test.id,
      testMode: TestMode.TIMED,
      status: TestAttemptStatus.SUBMITTED,
      score: '32.00',
      startedAt: new Date('2026-08-28T10:00:00.000Z'),
      submittedAt: new Date('2026-08-28T10:30:00.000Z'),
      lastActivityAt: new Date('2026-08-28T10:30:00.000Z'),
      autoSubmitted: false,
    } as TestAttempt;
    const attemptFind = jest.fn().mockResolvedValue(submitted);
    const testFind = jest.fn().mockResolvedValue(test);
    const manager = {
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === TestAttempt) return { findOne: attemptFind };
        if (entity === Test) return { findOne: testFind };
        throw new Error('Unexpected repository access');
      }),
    };
    const service = baseService({
      test,
      dataSource: { transaction: jest.fn().mockImplementation(async (callback) => callback(manager)) },
    });

    const result = await service.submit(submitted.id, actor);

    expect(result.status).toBe(TestAttemptStatus.SUBMITTED);
    expect(result.score).toBe('32.00');
    expect(attemptFind).toHaveBeenCalledWith(expect.objectContaining({
      lock: { mode: 'pessimistic_write' },
    }));
  });

  it('locks the attempt before saving an answer so autosave cannot race submission', async () => {
    const test = testRecord();
    const attempt = {
      id: '77777777-7777-4777-8777-777777777777',
      studentId: actor.userId,
      testId: test.id,
      testMode: TestMode.TUTOR,
      status: TestAttemptStatus.IN_PROGRESS,
      startedAt: new Date(),
      lastActivityAt: new Date(),
    } as TestAttempt;
    const question = validMcq();
    const item = assignment(question);
    item.testId = test.id;
    const option = question.options[0];
    const savedAnswer = {
      id: '88888888-8888-4888-8888-888888888888',
      attemptId: attempt.id,
      questionId: question.id,
      selectedOptionId: option.id,
      isCorrect: true,
      awardedMarks: '1.00',
    } as StudentAnswer;
    const attemptFind = jest.fn().mockResolvedValue(attempt);
    const answerSave = jest.fn().mockResolvedValue(savedAnswer);
    const answerCreate = jest.fn().mockImplementation((value) => value);
    const manager = {
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === TestAttempt) return { findOne: attemptFind, save: jest.fn().mockResolvedValue(attempt) };
        if (entity === Test) return { findOne: jest.fn().mockResolvedValue(test) };
        if (entity === TestQuestion) return { findOne: jest.fn().mockResolvedValue(item) };
        if (entity === McqOption) return { findOne: jest.fn().mockResolvedValue(option) };
        if (entity === StudentAnswer) return {
          findOne: jest.fn().mockResolvedValue(null),
          create: answerCreate,
          save: answerSave,
        };
        throw new Error('Unexpected repository access');
      }),
    };
    const service = baseService({
      test,
      dataSource: { transaction: jest.fn().mockImplementation(async (callback) => callback(manager)) },
    });

    const result = await service.saveAnswer(attempt.id, question.id, {
      selected_option_id: option.id,
      confidence_level: 'HIGH',
    }, actor);

    expect(attemptFind).toHaveBeenCalledWith(expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    expect(answerSave).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({ explanation: question.explanation }));
  });
});
