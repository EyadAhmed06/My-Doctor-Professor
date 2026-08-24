import { ForbiddenException } from '@nestjs/common';
import { TestsService } from './tests.service';

describe('TestsService security', () => {
  const createService = (query: jest.Mock) => new TestsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { query } as never,
    {} as never,
  );

  it('denies lecture practice without an active, current, paid-or-free published bundle entitlement', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = createService(query);

    await expect((service as any).requireBundleLectureAccess(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      ['33333333-3333-4333-8333-333333333333'],
      true,
    )).rejects.toBeInstanceOf(ForbiddenException);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("enrollment.status = 'ACTIVE'");
    expect(sql).toContain('enrollment.starts_at <= CURRENT_TIMESTAMP');
    expect(sql).toContain('enrollment.expires_at > CURRENT_TIMESTAMP');
    expect(sql).toContain("enrollment.payment_status IN ('NOT_REQUIRED', 'PAID')");
    expect(sql).toContain("bundle.status = 'PUBLISHED'");
    expect(sql).toContain('bundle.available_until > CURRENT_TIMESTAMP');
  });

  it('removes correctness and explanations from questions shown during a student attempt', () => {
    const service = createService(jest.fn());
    const view = (service as any).questionView({
      id: 'question',
      explanation: 'secret explanation',
      hint: 'secret hint',
      reference: 'secret reference',
      createdBy: 'instructor',
      creator: { id: 'instructor' },
      options: [{
        id: 'option',
        questionId: 'question',
        optionText: 'Answer',
        displayOrder: 1,
        isCorrect: true,
        explanation: 'secret option explanation',
        createdAt: new Date(),
      }],
      essayConfiguration: null,
    }, false);

    expect(view).not.toHaveProperty('explanation');
    expect(view).not.toHaveProperty('hint');
    expect(view.options[0]).not.toHaveProperty('isCorrect');
    expect(view.options[0]).not.toHaveProperty('explanation');
  });
});
