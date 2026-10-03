import { BundleAccessService } from './bundle-access.service';
import { UserRole } from '../users/entities/user.entity';

describe('Bundle instructor academic access', () => {
  const actor = { userId: 'instructor-1', role: UserRole.INSTRUCTOR } as any;
  it.each(['assertCourseAccess', 'assertWeekAccess', 'assertLectureAccess'] as const)(
    '%s recognizes bundle assignments with bound instructor IDs', async method => {
      const query = jest.fn().mockResolvedValue([{ allowed: 1 }]);
      const service = new BundleAccessService({ query } as any);
      await expect(service[method]('content-1', actor)).resolves.toBeUndefined();
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('course_instructors assignment');
      expect(sql).toContain('bundle_courses instructor_course');
      expect(sql).toContain('bundle_instructors instructor_bundle');
      expect(sql).toContain('instructor_bundle.bundle_id = instructor_course.bundle_id');
      expect(params).toEqual(['content-1', 'instructor-1']);
      expect(sql).not.toContain(actor.userId);
    },
  );
  it.each(['assertCourseAccess', 'assertWeekAccess', 'assertLectureAccess'] as const)(
    '%s denies content after all assignments are removed', async method => {
      const service = new BundleAccessService({ query: jest.fn().mockResolvedValue([]) } as any);
      await expect(service[method]('unassigned-content', actor)).rejects.toThrow('not found');
    },
  );
});
