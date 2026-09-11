import { QuestionType } from '../../common/entities/question.entity';
import { TestAttemptStatus, TestMode } from '../../common/entities/test-attempt.entity';
import { TestType } from '../../common/entities/test.entity';
import { UserRole } from '../users/entities/user.entity';
import { TestLaunchController } from './test-launch.controller';
import { TestsService } from './tests.service';

const student = {
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'student@example.test',
  role: UserRole.STUDENT,
};

function testRecord(type: TestType, title = 'Practice') {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    title,
    description: null,
    testType: type,
    durationMinutes: null,
  };
}

function validOptions() {
  return Array.from({ length: 5 }, (_, index) => ({ isCorrect: index === 0 }));
}

function assignments(count: number, questionType = QuestionType.MCQ, malformedIndex: number | null = null) {
  return Array.from({ length: count }, (_, index) => ({
    id: `assignment-${index}`,
    displayOrder: index + 1,
    question: {
      questionType,
      options: questionType === QuestionType.MCQ
        ? malformedIndex === index ? validOptions().slice(0, 4) : validOptions()
        : [],
    },
  }));
}

function controller({
  type = TestType.CUSTOM,
  title = 'Practice',
  questionCount = 40,
  malformedIndex = null as number | null,
  activeAttempt = null as null | {
    id: string;
    testMode: TestMode;
    status: TestAttemptStatus;
    startedAt: Date;
  },
} = {}) {
  const tests = {
    getOne: jest.fn().mockResolvedValue(testRecord(type, title)),
  };
  const testQuestions = {
    find: jest.fn().mockResolvedValue(assignments(questionCount, QuestionType.MCQ, malformedIndex)),
  };
  const attempts = {
    findOne: jest.fn().mockResolvedValue(activeAttempt),
  };
  return {
    subject: new TestLaunchController(
      tests as unknown as TestsService,
      testQuestions as never,
      attempts as never,
    ),
    tests,
    testQuestions,
    attempts,
  };
}

describe('TestLaunchController', () => {
  it('allows a legacy short custom practice to resume its existing active attempt without creating a new one', async () => {
    const activeAttempt = {
      id: '33333333-3333-4333-8333-333333333333',
      testMode: TestMode.TUTOR,
      status: TestAttemptStatus.IN_PROGRESS,
      startedAt: new Date('2026-08-11T17:00:00.000Z'),
    };
    const { subject, attempts } = controller({ questionCount: 1, activeAttempt });

    const result = await subject.getLaunchConfig('22222222-2222-4222-8222-222222222222', student);

    expect(attempts.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: TestAttemptStatus.IN_PROGRESS }),
    }));
    expect(result.launch_ready).toBe(true);
    expect(result.active_attempt).toEqual({
      id: activeAttempt.id,
      test_mode: TestMode.TUTOR,
      started_at: activeAttempt.startedAt,
    });
    expect(result.issues.join(' ')).toContain('legacy 1-question practice');
  });

  it('blocks starting a legacy custom practice when no resumable attempt exists', async () => {
    const { subject } = controller({ questionCount: 1 });

    const result = await subject.getLaunchConfig('22222222-2222-4222-8222-222222222222', student);

    expect(result.launch_ready).toBe(false);
    expect(result.required_question_count).toBe(40);
    expect(result.active_attempt).toBeNull();
    expect(result.issues.join(' ')).toContain('cannot be started again');
  });

  it('allows a newly generated custom practice only when exactly forty valid MCQs are configured', async () => {
    const { subject } = controller({ questionCount: 40 });

    const result = await subject.getLaunchConfig('22222222-2222-4222-8222-222222222222', student);

    expect(result.launch_ready).toBe(true);
    expect(result.question_count).toBe(40);
    expect(result.mcq_count).toBe(40);
    expect(result.malformed_mcq_count).toBe(0);
    expect(result.required_question_count).toBe(40);
    expect(result.issues).toEqual([]);
  });

  it('blocks a malformed MCQ even when an unfinished attempt exists', async () => {
    const activeAttempt = {
      id: '33333333-3333-4333-8333-333333333333',
      testMode: TestMode.TIMED,
      status: TestAttemptStatus.IN_PROGRESS,
      startedAt: new Date('2026-08-28T10:00:00.000Z'),
    };
    const { subject } = controller({ questionCount: 40, malformedIndex: 12, activeAttempt });

    const result = await subject.getLaunchConfig('22222222-2222-4222-8222-222222222222', student);

    expect(result.launch_ready).toBe(false);
    expect(result.malformed_mcq_count).toBe(1);
    expect(result.issues.join(' ')).toContain('exactly five options');
  });

  it('keeps the 200-MCQ invariant for finals', async () => {
    const { subject } = controller({ type: TestType.COURSE, title: 'Cardiovascular Final', questionCount: 200 });

    const result = await subject.getLaunchConfig('22222222-2222-4222-8222-222222222222', student);

    expect(result.is_final).toBe(true);
    expect(result.launch_ready).toBe(true);
    expect(result.required_question_count).toBe(200);
    expect(result.mcq_count).toBe(200);
  });

  it('treats a generated custom 200-MCQ final as a final instead of legacy 40-question practice', async () => {
    const { subject } = controller({
      type: TestType.CUSTOM,
      title: '200-MCQ Bundle Final · 2026-08-28',
      questionCount: 200,
    });

    const result = await subject.getLaunchConfig('22222222-2222-4222-8222-222222222222', student);

    expect(result.is_final).toBe(true);
    expect(result.launch_ready).toBe(true);
    expect(result.required_question_count).toBe(200);
    expect(result.mcq_count).toBe(200);
    expect(result.issues).toEqual([]);
  });
});