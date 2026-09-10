import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../users/entities/user.entity';
import { StudentStudioController } from './student-studio.controller';

describe('StudentStudioController saved-question workspace', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    email: 'student@example.test',
    role: UserRole.STUDENT,
  };

  function setup() {
    const query = jest.fn().mockResolvedValue([]);
    const controller = new StudentStudioController({ query } as unknown as DataSource);
    return { controller, query };
  }

  it('combines review-later and hard markers without exposing open attempts', async () => {
    const { controller, query } = setup();

    await controller.questions(actor);

    const sql = String(query.mock.calls[0][0]);
    expect(query.mock.calls[0][1]).toEqual([actor.userId, 'ALL']);
    expect(sql).toContain("BOOL_OR(flag.flag_type = 'NORMAL') AS is_flagged");
    expect(sql).toContain("BOOL_OR(flag.flag_type = 'HARD') AS is_hard");
    expect(sql).toContain("attempt.status IN ('SUBMITTED', 'EXPIRED')");
    expect(sql).not.toContain("attempt.status = 'IN_PROGRESS'");
  });

  it('requires a current paid/not-required active entitlement before revealing saved answers', async () => {
    const { controller, query } = setup();

    await controller.questions(actor, 'FLAGGED');

    const sql = String(query.mock.calls[0][0]);
    expect(query.mock.calls[0][1]).toEqual([actor.userId, 'FLAGGED']);
    expect(sql).toContain("enrollment.status = 'ACTIVE'");
    expect(sql).toContain("enrollment.payment_status IN ('NOT_REQUIRED', 'PAID')");
    expect(sql).toContain("bundle.status = 'PUBLISHED'");
    expect(sql).toContain('(enrollment.expires_at IS NULL OR enrollment.expires_at > CURRENT_TIMESTAMP)');
    expect(sql).toContain('(bundle.available_until IS NULL OR bundle.available_until > CURRENT_TIMESTAMP)');
  });

  it('accepts direct bundle-test entitlement or matching academic week entitlement', async () => {
    const { controller, query } = setup();

    await controller.questions(actor, 'HARD');

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('bundle_test.test_id = test.id');
    expect(sql).toContain('bundle_course.course_id = COALESCE(course.id, test_course.id)');
    expect(sql).toContain('selected.week_id = COALESCE(week.id, test_week.id, test_lecture_week.id)');
    expect(sql).toContain('NOT EXISTS');
  });

  it('keeps the legacy hard-questions route hard-only', async () => {
    const { controller, query } = setup();

    await controller.hardQuestions(actor);

    expect(query.mock.calls[0][1]).toEqual([actor.userId, 'HARD']);
  });

  it('rejects unknown Studio filters', async () => {
    const { controller, query } = setup();

    await expect(controller.questions(actor, 'WRONG')).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });
});
