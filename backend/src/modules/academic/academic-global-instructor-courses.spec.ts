import { AcademicService } from './academic.service';
import { UserRole } from '../users/entities/user.entity';

describe('Academic course listing', () => {
  function setup() {
    const qb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'unassigned-course' }], 1]),
    };
    const context = {
      courses: { createQueryBuilder: jest.fn(() => qb) },
      bundleAccess: { applyStudentAccessScope: jest.fn() },
    };
    return { qb, context };
  }

  it('returns unassigned courses to instructors without filtering by assignments', async () => {
    const { qb, context } = setup();
    const result = await AcademicService.prototype.listCourses.call(context as never, { limit: 100 }, {
      userId: 'instructor-1', role: UserRole.INSTRUCTOR,
    } as never);
    expect(result.data).toEqual([{ id: 'unassigned-course' }]);
    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it('retains student entitlement filtering', async () => {
    const { qb, context } = setup();
    await AcademicService.prototype.listCourses.call(context as never, { limit: 100 }, {
      userId: 'student-1', role: UserRole.STUDENT,
    } as never);
    expect(qb.andWhere).toHaveBeenCalledWith('course.is_active = TRUE');
    expect(context.bundleAccess.applyStudentAccessScope).toHaveBeenCalled();
  });
});
