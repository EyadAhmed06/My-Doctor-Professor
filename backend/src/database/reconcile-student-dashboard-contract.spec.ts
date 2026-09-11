import { QueryRunner } from 'typeorm';
import { ReconcileStudentDashboardContract2160000000000 } from './migrations/2160000000000-ReconcileStudentDashboardContract';

describe('ReconcileStudentDashboardContract2160000000000', () => {
  it('repairs the scheduler and answer timestamp contract idempotently', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const migration = new ReconcileStudentDashboardContract2160000000000();

    await migration.up({ query } as unknown as QueryRunner);

    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0][0]);

    expect(sql).toContain("to_regtype('public.study_plan_item_type')");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS student_study_plans');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS study_plan_items');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS completed_at timestamp');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS answered_at timestamp');
    expect(sql).toContain('SET answered_at = COALESCE(answered_at, created_at, CURRENT_TIMESTAMP)');
    expect(sql).toContain('Student dashboard schema contract is incomplete after reconciliation');
    expect(sql).toContain("('essay_case_attempts','submitted_at')");
  });
});
