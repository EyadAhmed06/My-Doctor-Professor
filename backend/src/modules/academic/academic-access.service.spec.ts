import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AcademicAccessService } from './academic-access.service';
import { UserRole } from '../users/entities/user.entity';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

describe('AcademicAccessService', () => {
  const student: AuthenticatedUser = {
    userId: 'student-1',
    sessionId: 'session-1',
    email: 'student@example.test',
    role: UserRole.STUDENT,
  };
  const admin: AuthenticatedUser = {
    ...student,
    userId: 'admin-1',
    role: UserRole.SYSTEM_ADMIN,
  };

  function setup(results: unknown[][] = []) {
    const query = jest.fn();
    for (const result of results) query.mockResolvedValueOnce(result);
    const service = new AcademicAccessService({ query } as unknown as DataSource);
    return { service, query };
  }

  it('hides a direct course identifier when the student has no enrolled bundle access', async () => {
    const { service } = setup([[]]);
    await expect(service.assertCourseReadable('course-1', student)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows an enrolled student to resolve a lecture', async () => {
    const { service } = setup([[{ allowed: 1 }]]);
    await expect(service.assertLectureReadable('lecture-1', student)).resolves.toBeUndefined();
  });

  it('walks question access through topic and lecture ownership', async () => {
    const { service, query } = setup([
      [{ topic_id: 'topic-1' }],
      [{ lecture_id: 'lecture-1' }],
      [{ allowed: 1 }],
    ]);
    await expect(service.assertQuestionReadable('question-1', student)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('does not reveal whether an inaccessible question exists', async () => {
    const { service } = setup([[{ topic_id: 'topic-1' }], [{ lecture_id: 'lecture-1' }], []]);
    await expect(service.assertQuestionReadable('question-1', student)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets system administrators bypass academic read scoping', async () => {
    const { service, query } = setup();
    await expect(service.assertCourseReadable('course-1', admin)).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });
});
