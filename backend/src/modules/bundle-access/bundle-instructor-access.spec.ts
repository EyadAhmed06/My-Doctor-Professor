import { BundleAccessService } from './bundle-access.service';
import { UserRole } from '../users/entities/user.entity';

describe('Global instructor academic access', () => {
  const actor = { userId: 'instructor-1', role: UserRole.INSTRUCTOR } as any;

  it.each(['assertCourseAccess', 'assertWeekAccess', 'assertLectureAccess'] as const)(
    '%s permits existing content without instructor assignments', async method => {
      const query = jest.fn().mockResolvedValue([{ id: 'content-1' }]);
      const service = new BundleAccessService({ query } as any);
      await expect(service[method]('content-1', actor)).resolves.toBeUndefined();
      const [sql, params] = query.mock.calls[0];
      expect(sql).not.toContain('course_instructors');
      expect(sql).not.toContain('bundle_instructors');
      expect(params).toEqual(['content-1']);
    },
  );

  it.each(['assertCourseAccess', 'assertWeekAccess', 'assertLectureAccess'] as const)(
    '%s still rejects nonexistent content', async method => {
      const service = new BundleAccessService({ query: jest.fn().mockResolvedValue([]) } as any);
      await expect(service[method]('missing-content', actor)).rejects.toThrow('not found');
    },
  );
});
