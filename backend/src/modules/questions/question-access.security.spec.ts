import { BundleAccessService } from '../bundle-access/bundle-access.service';
import { UserRole } from '../users/entities/user.entity';
import { InstructorQuestionAccessService } from './instructor-question-access.service';
import { StudentQuestionAccessService } from './student-question-access.service';

function builderHarness() {
  const andWhere = jest.fn();
  const builder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere,
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  andWhere.mockReturnValue(builder);
  return builder;
}

describe('question access security', () => {
  it('scopes student catalog reads to active paid/not-required bundle enrollment and selected weeks', async () => {
    const builder = builderHarness();
    const bundleAccess = new BundleAccessService({} as never);
    const service = new StudentQuestionAccessService({
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    } as never, bundleAccess);

    await service.list({ page: 1, limit: 20 }, {
      userId: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222',
      email: 'student@example.test',
      role: UserRole.STUDENT,
    });

    const combined = builder.andWhere.mock.calls.map((call) => String(call[0])).join('\n');
    expect(combined).toContain("enrollment.payment_status IN ('NOT_REQUIRED', 'PAID')");
    expect(combined).toContain("enrollment.status = 'ACTIVE'");
    expect(combined).toContain('selected.week_id = week.id');
    expect(combined).toContain('NOT EXISTS');
    expect(combined).toContain('week.is_locked = FALSE');
    expect(combined).toContain('lecture.is_locked = FALSE');
    expect(combined).toContain('topic.is_locked = FALSE');
    expect(builder.andWhere).toHaveBeenCalledWith(expect.stringContaining('bundle_course.course_id = course.id'), {
      studentId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('scopes instructor question-bank reads to courses assigned to that instructor', async () => {
    const builder = builderHarness();
    const service = new InstructorQuestionAccessService({
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    } as never);

    await service.list({ page: 1, limit: 20 }, {
      userId: '33333333-3333-4333-8333-333333333333',
      sessionId: '44444444-4444-4444-8444-444444444444',
      email: 'instructor@example.test',
      role: UserRole.INSTRUCTOR,
    });

    expect(builder.where).toHaveBeenCalledWith(expect.stringContaining('course_instructors assignment'), {
      instructorId: '33333333-3333-4333-8333-333333333333',
    });
  });

  it('applies instructor course, lecture, and missing-explanation filters server-side', async () => {
    const builder = builderHarness();
    const service = new InstructorQuestionAccessService({
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    } as never);

    await service.list({
      page: 1,
      limit: 20,
      course_id: '55555555-5555-4555-8555-555555555555',
      lecture_id: '66666666-6666-4666-8666-666666666666',
      has_explanation: false,
    }, {
      userId: '33333333-3333-4333-8333-333333333333',
      sessionId: '44444444-4444-4444-8444-444444444444',
      email: 'instructor@example.test',
      role: UserRole.INSTRUCTOR,
    });

    expect(builder.andWhere).toHaveBeenCalledWith(expect.stringContaining('NOT (NULLIF(BTRIM(question.explanation)'));
    expect(builder.andWhere).toHaveBeenCalledWith('course.id = :courseId', {
      courseId: '55555555-5555-4555-8555-555555555555',
    });
    expect(builder.andWhere).toHaveBeenCalledWith('lecture.id = :lectureId', {
      lectureId: '66666666-6666-4666-8666-666666666666',
    });
  });
});
