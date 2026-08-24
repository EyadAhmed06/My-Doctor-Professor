import { ForbiddenException } from '@nestjs/common';
import { TestMode } from '../../common/entities/test-attempt.entity';
import { UserRole } from '../users/entities/user.entity';
import { McqPracticeService } from './mcq-practice.service';

describe('McqPracticeService security', () => {
  it('requires an ACTIVE, current, paid-or-free entitlement before selecting lectures', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new McqPracticeService(
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
    }, {
      userId: '33333333-3333-4333-8333-333333333333',
      sessionId: '44444444-4444-4444-8444-444444444444',
      email: 'student@example.com',
      role: UserRole.STUDENT,
    })).rejects.toBeInstanceOf(ForbiddenException);

    const entitlementSql = String(query.mock.calls[0][0]);
    expect(entitlementSql).toContain("enrollment.status = 'ACTIVE'");
    expect(entitlementSql).toContain('enrollment.starts_at <= CURRENT_TIMESTAMP');
    expect(entitlementSql).toContain("bundle.status = 'PUBLISHED'");
    expect(entitlementSql).toContain('bundle.available_until > CURRENT_TIMESTAMP');
  });
});
