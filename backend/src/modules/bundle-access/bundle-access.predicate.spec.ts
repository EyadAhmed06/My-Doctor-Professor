import { DataSource, SelectQueryBuilder } from 'typeorm';
import { UserRole } from '../users/entities/user.entity';
import {
  buildActiveEnrollmentSql,
  buildBundleWeekFallbackSql,
  buildCourseAccessExistsSql,
} from './bundle-access.predicates';
import { BundleAccessService } from './bundle-access.service';

describe('Bundle Access Canonical Predicate (Spec-Driven)', () => {
  const student = {
    userId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    email: 'student@example.test',
    role: UserRole.STUDENT,
  };

  function setup(queryMock = jest.fn()) {
    const dataSource = { query: queryMock } as unknown as DataSource;
    const service = new BundleAccessService(dataSource);
    return { service, queryMock };
  }

  describe('Lifecycle & Entitlement Invariants', () => {
    it('enforces ACTIVE status only, rejecting EXPIRED and REVOKED', () => {
      const sql = buildActiveEnrollmentSql('enrollment', 'bundle');
      expect(sql).toContain("enrollment.status = 'ACTIVE'");
      expect(sql).not.toContain("enrollment.status <> 'REVOKED'");
    });

    it('enforces starts_at NULL-or-past and expires_at NULL-or-future', () => {
      const sql = buildActiveEnrollmentSql('enrollment', 'bundle');
      expect(sql).toContain('(enrollment.starts_at IS NULL OR enrollment.starts_at <= CURRENT_TIMESTAMP)');
      expect(sql).toContain('(enrollment.expires_at IS NULL OR enrollment.expires_at > CURRENT_TIMESTAMP)');
    });

    it('enforces payment_status in NOT_REQUIRED or PAID, rejecting PENDING and CANCELLED', () => {
      const sql = buildActiveEnrollmentSql('enrollment', 'bundle');
      expect(sql).toContain("enrollment.payment_status IN ('NOT_REQUIRED', 'PAID')");
      expect(sql).not.toContain('bundle.is_free = TRUE');
    });

    it('enforces bundle.status = PUBLISHED and bundle availability window, rejecting DRAFT and ARCHIVED', () => {
      const sql = buildActiveEnrollmentSql('enrollment', 'bundle');
      expect(sql).toContain("bundle.status = 'PUBLISHED'");
      expect(sql).not.toContain('ARCHIVED');
      expect(sql).toContain('(bundle.available_from IS NULL OR bundle.available_from <= CURRENT_TIMESTAMP)');
      expect(sql).toContain('(bundle.available_until IS NULL OR bundle.available_until > CURRENT_TIMESTAMP)');
    });

    it('enforces two-way week fallback: explicit selection OR empty selection grants whole course', () => {
      const sql = buildBundleWeekFallbackSql('bundle', 'week.id', 'course.id');
      expect(sql).toContain('EXISTS ( SELECT 1 FROM bundle_weeks selected WHERE selected.bundle_id = bundle.id AND selected.week_id = week.id)');
      expect(sql).toContain('OR NOT EXISTS ( SELECT 1 FROM bundle_weeks selected JOIN weeks selected_week ON selected_week.id = selected.week_id WHERE selected.bundle_id = bundle.id AND selected_week.course_id = course.id)');
    });
  });

  describe('Service Invocations & SQL Emission Invariants', () => {
    it('assertCourseAccess passes when DB returns matching row, throws 404 when empty', async () => {
      const { service, queryMock } = setup(jest.fn().mockResolvedValueOnce([{ ok: 1 }]));
      await expect(service.assertCourseAccess('course-1', student)).resolves.toBeUndefined();

      const executedSql = String(queryMock.mock.calls[0][0]);
      expect(executedSql).toContain("enrollment.status = 'ACTIVE'");
      expect(executedSql).toContain("enrollment.payment_status IN ('NOT_REQUIRED', 'PAID')");
      expect(executedSql).toContain("bundle.status = 'PUBLISHED'");
      expect(executedSql).toContain('course.is_active = TRUE');

      queryMock.mockResolvedValueOnce([]);
      await expect(service.assertCourseAccess('course-2', student)).rejects.toThrow('Course not found');
    });

    it('assertWeekAccess executes two-way week fallback SQL and throws 404 on denial', async () => {
      const { service, queryMock } = setup(jest.fn().mockResolvedValueOnce([{ ok: 1 }]));
      await expect(service.assertWeekAccess('week-1', student)).resolves.toBeUndefined();

      const executedSql = String(queryMock.mock.calls[0][0]);
      expect(executedSql).toContain('selected.week_id = week.id');
      expect(executedSql).toContain('NOT EXISTS');

      queryMock.mockResolvedValueOnce([]);
      await expect(service.assertWeekAccess('week-2', student)).rejects.toThrow('Week not found');
    });

    it('assertTestAccess throws 404 by default and 403 when throwForbidden is requested', async () => {
      const { service } = setup(jest.fn().mockResolvedValue([]));
      await expect(service.assertTestAccess('test-1', student)).rejects.toThrow('Test not found');
      await expect(service.assertTestAccess('test-1', student, { throwForbidden: true })).rejects.toThrow(
        'This test is not available in your bundles',
      );
    });

    it('getAccessibleWeekIds executes canonical two-way fallback and active enrollment lifecycle', async () => {
      const { service, queryMock } = setup(jest.fn().mockResolvedValueOnce([{ id: 'week-1' }, { id: 'week-2' }]));
      const ids = await service.getAccessibleWeekIds('course-1', student.userId);
      expect(ids).toEqual(['week-1', 'week-2']);

      const executedSql = String(queryMock.mock.calls[0][0]);
      expect(executedSql).toContain("enrollment.status = 'ACTIVE'");
      expect(executedSql).toContain("enrollment.payment_status IN ('NOT_REQUIRED', 'PAID')");
      expect(executedSql).toContain('NOT EXISTS');
    });

    it('QueryBuilder scoping and raw SQL generator emit identical normalized predicates', () => {
      const rawCourseSql = buildCourseAccessExistsSql('$1', '$2', 'course');
      const andWhereCalls: string[] = [];
      const fakeQb = {
        andWhere: jest.fn((sql: string) => {
          andWhereCalls.push(sql);
          return fakeQb;
        }),
      } as unknown as SelectQueryBuilder<unknown>;

      const { service } = setup();
      service.applyStudentAccessScope(fakeQb, 'course', student.userId);

      const normalize = (s: string) => s.replace(/\s+/g, ' ').replace(/\$1/g, 'course.id').replace(/\$2/g, ':studentId').trim();
      expect(normalize(andWhereCalls[0])).toEqual(normalize(rawCourseSql));
    });
  });
});
