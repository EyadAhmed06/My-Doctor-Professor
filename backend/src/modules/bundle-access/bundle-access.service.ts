import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import {
  buildActiveEnrollmentSql,
  buildBundleWeekFallbackSql,
  buildCourseAccessExistsSql,
  buildDeckAccessExistsSql,
  buildLectureAccessExistsSql,
  buildTestAccessExistsSql,
  buildWeekAccessExistsSql,
} from './bundle-access.predicates';

@Injectable()
export class BundleAccessService {
  constructor(private readonly dataSource: DataSource) {}

  async assertCourseAccess(courseId: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.role === UserRole.SYSTEM_ADMIN) return;
    if (actor.role === UserRole.INSTRUCTOR) {
      const allowed = await this.exists(
        `SELECT 1 FROM course_instructors WHERE course_id = $1 AND instructor_id = $2`,
        [courseId, actor.userId],
      );
      if (!allowed) throw new NotFoundException('Course not found');
      return;
    }

    const allowed = await this.exists(
      `SELECT 1 FROM courses course WHERE course.id = $1 AND course.is_active = TRUE AND ${buildCourseAccessExistsSql('$1', '$2', 'course')}`,
      [courseId, actor.userId],
    );
    if (!allowed) throw new NotFoundException('Course not found');
  }

  async assertWeekAccess(weekId: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.role === UserRole.SYSTEM_ADMIN) return;
    if (actor.role === UserRole.INSTRUCTOR) {
      const allowed = await this.exists(
        `SELECT 1 FROM weeks week
         JOIN course_instructors assignment ON assignment.course_id = week.course_id
         WHERE week.id = $1 AND assignment.instructor_id = $2`,
        [weekId, actor.userId],
      );
      if (!allowed) throw new NotFoundException('Week not found');
      return;
    }

    const allowed = await this.exists(
      `SELECT 1 FROM weeks week
       JOIN courses course ON course.id = week.course_id
       WHERE week.id = $1 AND course.is_active = TRUE
         AND ${buildWeekAccessExistsSql('$1', '$2', 'course', 'week')}`,
      [weekId, actor.userId],
    );
    if (!allowed) throw new NotFoundException('Week not found');
  }

  async assertLectureAccess(lectureId: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.role === UserRole.SYSTEM_ADMIN) return;
    if (actor.role === UserRole.INSTRUCTOR) {
      const allowed = await this.exists(
        `SELECT 1 FROM lectures lecture
         JOIN weeks week ON week.id = lecture.week_id
         JOIN course_instructors assignment ON assignment.course_id = week.course_id
         WHERE lecture.id = $1 AND assignment.instructor_id = $2`,
        [lectureId, actor.userId],
      );
      if (!allowed) throw new NotFoundException('Lecture not found');
      return;
    }

    const allowed = await this.exists(
      `SELECT 1 FROM lectures lecture
       JOIN weeks week ON week.id = lecture.week_id
       JOIN courses course ON course.id = week.course_id
       WHERE lecture.id = $1 AND lecture.is_published = TRUE AND course.is_active = TRUE
         AND ${buildLectureAccessExistsSql('$1', '$2')}`,
      [lectureId, actor.userId],
    );
    if (!allowed) throw new NotFoundException('Lecture not found');
  }

  async assertTestAccess(
    testId: string,
    actor: AuthenticatedUser,
    options: { throwForbidden?: boolean } = {},
  ): Promise<void> {
    if (actor.role === UserRole.SYSTEM_ADMIN || actor.role === UserRole.INSTRUCTOR) return;

    const allowed = await this.exists(
      `SELECT 1 FROM tests test
       WHERE test.id = $1 AND test.is_published = TRUE
         AND ${buildTestAccessExistsSql('$1', '$2')}`,
      [testId, actor.userId],
    );
    if (!allowed) {
      if (options.throwForbidden) {
        throw new ForbiddenException('This test is not available in your bundles');
      }
      throw new NotFoundException('Test not found');
    }
  }

  async assertDeckAccess(deckId: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.role === UserRole.SYSTEM_ADMIN || actor.role === UserRole.INSTRUCTOR) return;

    const allowed = await this.exists(
      `SELECT 1 FROM flashcard_decks deck
       JOIN courses course ON course.id = deck.course_id
       LEFT JOIN lectures lecture ON lecture.id = deck.lecture_id
       WHERE deck.id = $1 AND deck.is_published = TRUE AND course.is_active = TRUE
         AND (lecture.id IS NULL OR lecture.is_published = TRUE)
         AND ${buildDeckAccessExistsSql('$1', '$2')}`,
      [deckId, actor.userId],
    );
    if (!allowed) throw new NotFoundException('Flashcard deck not found');
  }

  async getAccessibleWeekIds(courseId: string, studentId: string): Promise<string[]> {
    if (!studentId) return [];
    const rows = await this.dataSource.query<Array<{ id: string }>>(`
      SELECT DISTINCT week.id
      FROM weeks week
      JOIN courses course ON course.id = week.course_id
      JOIN bundle_courses bundle_course ON bundle_course.course_id = course.id
      JOIN bundles bundle ON bundle.id = bundle_course.bundle_id
      JOIN bundle_enrollments enrollment ON enrollment.bundle_id = bundle.id AND enrollment.student_id = $2
      WHERE week.course_id = $1
        AND course.is_active = TRUE
        AND ${buildActiveEnrollmentSql('enrollment', 'bundle')}
        AND ${buildBundleWeekFallbackSql('bundle', 'week.id', 'course.id')}
    `, [courseId, studentId]);
    return rows.map((row) => row.id);
  }

  async getAccessibleLectureIdsInBundle(
    bundleId: string,
    studentId: string,
    courseId?: string,
  ): Promise<string[]> {
    const rows = await this.dataSource.query<Array<{ lecture_id: string }>>(`
      SELECT DISTINCT lecture.id AS lecture_id
      FROM bundles bundle
      INNER JOIN bundle_enrollments enrollment
        ON enrollment.bundle_id = bundle.id AND enrollment.student_id = $2
      INNER JOIN bundle_courses bundle_course ON bundle_course.bundle_id = bundle.id
      INNER JOIN weeks week ON week.course_id = bundle_course.course_id
      INNER JOIN lectures lecture ON lecture.week_id = week.id
      WHERE bundle.id = $1
        AND ($3::uuid IS NULL OR bundle_course.course_id = $3::uuid)
        AND ${buildActiveEnrollmentSql('enrollment', 'bundle')}
        AND ${buildBundleWeekFallbackSql('bundle', 'week.id', 'bundle_course.course_id')}
        AND lecture.is_published = TRUE
    `, [bundleId, studentId, courseId ?? null]);
    return rows.map((row) => row.lecture_id);
  }

  applyStudentAccessScope<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    target: 'course' | 'question' | 'test' | 'deck' | 'card',
    studentId: string,
  ): SelectQueryBuilder<T> {
    switch (target) {
      case 'course':
        return qb.andWhere(
          buildCourseAccessExistsSql('course.id', ':studentId', 'course'),
          { studentId },
        );
      case 'question':
        return qb.andWhere(
          `EXISTS (`
          + ` SELECT 1`
          + ` FROM bundle_courses bundle_course`
          + ` JOIN bundles bundle ON bundle.id = bundle_course.bundle_id`
          + ` JOIN bundle_enrollments enrollment ON enrollment.bundle_id = bundle.id AND enrollment.student_id = :studentId`
          + ` WHERE bundle_course.course_id = course.id`
          + ` AND ${buildActiveEnrollmentSql('enrollment', 'bundle')}`
          + ` AND ${buildBundleWeekFallbackSql('bundle', 'week.id', 'course.id')}`
          + `)`,
          { studentId },
        );
      case 'test':
        return qb.andWhere(
          buildTestAccessExistsSql('test.id', ':studentId'),
          { studentId },
        );
      case 'deck':
        return qb.andWhere(
          `EXISTS (`
          + ` SELECT 1`
          + ` FROM bundle_courses bundle_course`
          + ` JOIN bundles bundle ON bundle.id = bundle_course.bundle_id`
          + ` JOIN bundle_enrollments enrollment ON enrollment.bundle_id = bundle.id AND enrollment.student_id = :studentId`
          + ` WHERE bundle_course.course_id = deck.course_id`
          + ` AND ${buildActiveEnrollmentSql('enrollment', 'bundle')}`
          + ` AND (`
          + `   ((deck.week_id IS NOT NULL OR deck.lecture_id IS NOT NULL) AND ${buildBundleWeekFallbackSql('bundle', 'COALESCE(deck.week_id, lecture.week_id)', 'deck.course_id')})`
          + `   OR (deck.week_id IS NULL AND deck.lecture_id IS NULL)`
          + ` )`
          + `)`,
          { studentId },
        );
      case 'card':
        return qb.andWhere(
          `EXISTS (`
          + ` SELECT 1`
          + ` FROM bundle_courses bundle_course`
          + ` JOIN bundles bundle ON bundle.id = bundle_course.bundle_id`
          + ` JOIN bundle_enrollments enrollment ON enrollment.bundle_id = bundle.id AND enrollment.student_id = :studentId`
          + ` WHERE bundle_course.course_id = deck.course_id`
          + ` AND ${buildActiveEnrollmentSql('enrollment', 'bundle')}`
          + ` AND (`
          + `   ((deck.week_id IS NOT NULL OR deck.lecture_id IS NOT NULL) AND ${buildBundleWeekFallbackSql('bundle', 'COALESCE(deck.week_id, lecture.week_id)', 'deck.course_id')})`
          + `   OR (deck.week_id IS NULL AND deck.lecture_id IS NULL)`
          + ` )`
          + `)`,
          { studentId },
        );
    }
  }

  private async exists(sql: string, params: unknown[]): Promise<boolean> {
    const rows = (await this.dataSource.query(sql, params)) as unknown[];
    return rows.length > 0;
  }
}
