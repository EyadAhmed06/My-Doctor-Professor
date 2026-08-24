import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';
import { EssayCasesService } from './essay-cases.service';

describe('EssayCasesService security', () => {
  it('does not let an instructor claim an unassigned course through a management request', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new EssayCasesService({ query } as never);

    await expect(service.importPdfSeed(
      '11111111-1111-4111-8111-111111111111',
      {
        userId: '22222222-2222-4222-8222-222222222222',
        sessionId: '33333333-3333-4333-8333-333333333333',
        email: 'instructor@example.com',
        role: UserRole.INSTRUCTOR,
      },
    )).rejects.toBeInstanceOf(ForbiddenException);

    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toContain('course_instructors');
    expect(query.mock.calls.some(([sql]) => /INSERT\s+INTO\s+course_instructors/i.test(String(sql)))).toBe(false);
  });

  it('does not select model answers for an unrevealed student attempt', async () => {
    const queries: string[] = [];
    const query = jest.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes('FROM essay_cases c JOIN weeks')) {
        return [{
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          week_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          course_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          week_number: 1,
          title: 'Case',
          stem: 'Stem',
          is_published: true,
        }];
      }
      if (sql.includes('FROM bundle_courses')) return [{ allowed: 1 }];
      if (sql.includes('FROM essay_case_attempts')) return [];
      if (sql.includes('FROM essay_case_questions')) {
        return [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', prompt: 'Question', display_order: 1 }];
      }
      return [];
    });
    const service = new EssayCasesService({ query } as never);

    const result = await service.getCase(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      {
        userId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        sessionId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        email: 'student@example.com',
        role: UserRole.STUDENT,
      },
    );

    const questionSql = queries.find((sql) => sql.includes('FROM essay_case_questions'));
    expect(questionSql).toBeDefined();
    expect(questionSql).not.toContain('model_answer');
    expect(result.questions[0]).not.toHaveProperty('modelAnswer');
  });
});
