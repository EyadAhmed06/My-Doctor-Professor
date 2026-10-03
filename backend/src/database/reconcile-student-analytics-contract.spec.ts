import { QueryRunner } from 'typeorm';
import { ReconcileStudentAnalyticsContract2150000000000 } from './migrations/2150000000000-ReconcileStudentAnalyticsContract';

describe('ReconcileStudentAnalyticsContract2150000000000', () => {
  it('repairs analytics confidence and review marker columns idempotently', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const migration = new ReconcileStudentAnalyticsContract2150000000000();

    await migration.up({ query } as unknown as QueryRunner);

    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS confidence_level varchar(12)');
    expect(sql).toContain("confidence_level IN ('LOW', 'MEDIUM', 'HIGH')");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS flag_type varchar(10) NOT NULL DEFAULT 'NORMAL'");
    expect(sql).toContain("flag_type IN ('NORMAL', 'HARD')");
    expect(sql).toContain('UNIQUE (attempt_id, question_id, flag_type)');
  });
});
