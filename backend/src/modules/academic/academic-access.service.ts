import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';

@Injectable()
export class AcademicAccessService {
  constructor(private readonly dataSource: DataSource) {}

  async assertCourseReadable(courseId: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.role === UserRole.SYSTEM_ADMIN) return;
    const allowed = actor.role === UserRole.INSTRUCTOR
      ? await this.exists(
          `SELECT 1 FROM course_instructors
           WHERE course_id = $1 AND instructor_id = $2`,
          [courseId, actor.userId],
        )
      : await this.exists(
          `SELECT 1
           FROM bundle_enrollments enrollment
           JOIN bundles bundle ON bundle.id = enrollment.bundle_id
           JOIN bundle_courses bundle_course ON bundle_course.bundle_id = bundle.id
           JOIN courses course ON course.id = bundle_course.course_id
           WHERE enrollment.student_id = $2
             AND bundle_course.course_id = $1
             AND enrollment.status = 'ACTIVE'
             AND (enrollment.starts_at IS NULL OR enrollment.starts_at <= CURRENT_TIMESTAMP)
             AND (enrollment.expires_at IS NULL OR enrollment.expires_at > CURRENT_TIMESTAMP)
             AND enrollment.payment_status IN ('NOT_REQUIRED','PAID')
             AND bundle.status = 'PUBLISHED'
             AND (bundle.available_from IS NULL OR bundle.available_from <= CURRENT_TIMESTAMP)
             AND (bundle.available_until IS NULL OR bundle.available_until > CURRENT_TIMESTAMP)
             AND course.is_active = TRUE`,
          [courseId, actor.userId],
        );
    if (!allowed) throw new NotFoundException('Course not found');
  }

  async assertWeekReadable(weekId: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.role === UserRole.SYSTEM_ADMIN) return;
    const allowed = actor.role === UserRole.INSTRUCTOR
      ? await this.exists(
          `SELECT 1
           FROM weeks week
           JOIN course_instructors assignment ON assignment.course_id = week.course_id
           WHERE week.id = $1 AND assignment.instructor_id = $2`,
          [weekId, actor.userId],
        )
      : await this.exists(
          `SELECT 1
           FROM weeks week
           JOIN courses course ON course.id = week.course_id
           JOIN bundle_courses bundle_course ON bundle_course.course_id = course.id
           JOIN bundles bundle ON bundle.id = bundle_course.bundle_id
           JOIN bundle_enrollments enrollment
             ON enrollment.bundle_id = bundle.id AND enrollment.student_id = $2
           WHERE week.id = $1
             AND enrollment.status = 'ACTIVE'
             AND (enrollment.starts_at IS NULL OR enrollment.starts_at <= CURRENT_TIMESTAMP)
             AND (enrollment.expires_at IS NULL OR enrollment.expires_at > CURRENT_TIMESTAMP)
             AND enrollment.payment_status IN ('NOT_REQUIRED','PAID')
             AND bundle.status = 'PUBLISHED'
             AND (bundle.available_from IS NULL OR bundle.available_from <= CURRENT_TIMESTAMP)
             AND (bundle.available_until IS NULL OR bundle.available_until > CURRENT_TIMESTAMP)
             AND course.is_active = TRUE
             AND (
               EXISTS (
                 SELECT 1 FROM bundle_weeks selected
                 WHERE selected.bundle_id = bundle.id AND selected.week_id = week.id
               )
               OR NOT EXISTS (
                 SELECT 1
                 FROM bundle_weeks selected
                 JOIN weeks selected_week ON selected_week.id = selected.week_id
                 WHERE selected.bundle_id = bundle.id
                   AND selected_week.course_id = course.id
               )
             )`,
          [weekId, actor.userId],
        );
    if (!allowed) throw new NotFoundException('Week not found');
  }

  async assertLectureReadable(lectureId: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.role === UserRole.SYSTEM_ADMIN) return;
    const allowed = actor.role === UserRole.INSTRUCTOR
      ? await this.exists(
          `SELECT 1
           FROM lectures lecture
           JOIN weeks week ON week.id = lecture.week_id
           JOIN course_instructors assignment ON assignment.course_id = week.course_id
           WHERE lecture.id = $1 AND assignment.instructor_id = $2`,
          [lectureId, actor.userId],
        )
      : await this.exists(
          `SELECT 1
           FROM lectures lecture
           JOIN weeks week ON week.id = lecture.week_id
           JOIN courses course ON course.id = week.course_id
           JOIN bundle_courses bundle_course ON bundle_course.course_id = course.id
           JOIN bundles bundle ON bundle.id = bundle_course.bundle_id
           JOIN bundle_enrollments enrollment
             ON enrollment.bundle_id = bundle.id AND enrollment.student_id = $2
           WHERE lecture.id = $1
             AND enrollment.status = 'ACTIVE'
             AND (enrollment.starts_at IS NULL OR enrollment.starts_at <= CURRENT_TIMESTAMP)
             AND (enrollment.expires_at IS NULL OR enrollment.expires_at > CURRENT_TIMESTAMP)
             AND enrollment.payment_status IN ('NOT_REQUIRED','PAID')
             AND bundle.status = 'PUBLISHED'
             AND (bundle.available_from IS NULL OR bundle.available_from <= CURRENT_TIMESTAMP)
             AND (bundle.available_until IS NULL OR bundle.available_until > CURRENT_TIMESTAMP)
             AND course.is_active = TRUE
             AND lecture.is_published = TRUE
             AND (
               EXISTS (
                 SELECT 1 FROM bundle_weeks selected
                 WHERE selected.bundle_id = bundle.id AND selected.week_id = week.id
               )
               OR NOT EXISTS (
                 SELECT 1
                 FROM bundle_weeks selected
                 JOIN weeks selected_week ON selected_week.id = selected.week_id
                 WHERE selected.bundle_id = bundle.id
                   AND selected_week.course_id = course.id
               )
             )`,
          [lectureId, actor.userId],
        );
    if (!allowed) throw new NotFoundException('Lecture not found');
  }

  async assertTopicReadable(topicId: string, actor: AuthenticatedUser): Promise<void> {
    const rows = await this.dataSource.query(
      `SELECT lecture_id FROM topics WHERE id = $1 LIMIT 1`,
      [topicId],
    ) as Array<{ lecture_id: string }>;
    if (!rows[0]) throw new NotFoundException('Topic not found');
    await this.assertLectureReadable(rows[0].lecture_id, actor);
  }

  async assertQuestionReadable(questionId: string, actor: AuthenticatedUser): Promise<void> {
    const rows = await this.dataSource.query(
      `SELECT topic_id FROM questions WHERE id = $1 AND is_active = TRUE LIMIT 1`,
      [questionId],
    ) as Array<{ topic_id: string }>;
    if (!rows[0]) throw new NotFoundException('Question not found');
    await this.assertTopicReadable(rows[0].topic_id, actor);
  }

  async assertResourceReadable(resourceId: string, actor: AuthenticatedUser): Promise<void> {
    const rows = await this.dataSource.query(
      `SELECT lecture_id FROM resources WHERE id = $1 LIMIT 1`,
      [resourceId],
    ) as Array<{ lecture_id: string }>;
    if (!rows[0]) throw new NotFoundException('Resource not found');
    await this.assertLectureReadable(rows[0].lecture_id, actor);
  }

  private async exists(sql: string, params: unknown[]): Promise<boolean> {
    const rows = await this.dataSource.query(sql, params) as unknown[];
    return rows.length > 0;
  }
}