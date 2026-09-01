import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';
import { EssayPracticeService } from './essay-practice.service';

/**
 * Essay practice must grant access the same way bundle content and MCQ practice do. A bundle
 * that attaches a whole course without picking individual weeks covers every week of that
 * course; joining bundle_weeks directly returned nothing for those bundles, so students could
 * browse the lectures and then be denied at generate.
 */
describe('EssayPracticeService bundle access', () => {
  const actor = {
    userId: '33333333-3333-4333-8333-333333333333',
    sessionId: '44444444-4444-4444-8444-444444444444',
    email: 'student@example.com',
    role: UserRole.STUDENT,
  };

  function harness() {
    const query = jest.fn().mockResolvedValue([]);
    const service = new EssayPracticeService(
      {} as never, {} as never,
      { exists: jest.fn().mockResolvedValue(true) } as never,
      {} as never, {} as never, {} as never, {} as never,
      { query } as never,
    );
    return { query, service };
  }

  async function accessSql() {
    const { query, service } = harness();
    await expect(service.generate({
      bundle_id: '11111111-1111-4111-8111-111111111111',
      lecture_ids: ['22222222-2222-4222-8222-222222222222'],
    } as never, actor)).rejects.toBeInstanceOf(ForbiddenException);
    return String(query.mock.calls[0][0]);
  }

  it('treats a course with no selected weeks as access to every week of that course', async () => {
    const sql = await accessSql();
    expect(sql).toContain('week.course_id = bundle_course.course_id');
    expect(sql).toContain('selected.week_id = week.id');
    expect(sql).toContain('NOT EXISTS');
    // The old query joined bundle_weeks in the FROM list, which silently dropped course-only
    // bundles. The predicate must live in WHERE so those rows survive.
    expect(sql).not.toContain('INNER JOIN bundle_weeks bundle_week');
  });

  it('still requires a live, non-revoked entitlement on a published bundle', async () => {
    const sql = await accessSql();
    expect(sql).toContain("enrollment.status <> 'REVOKED'");
    expect(sql).toContain("bundle.status IN ('PUBLISHED', 'ARCHIVED')");
    expect(sql).toContain('lecture.is_published = TRUE');
  });
});
