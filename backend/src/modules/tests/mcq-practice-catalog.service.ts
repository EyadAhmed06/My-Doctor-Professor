import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Course } from '../../common/entities/course.entity';
import { Week } from '../../common/entities/week.entity';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';

@Injectable()
export class McqPracticeCatalogService {
  constructor(
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(Week) private readonly weeks: Repository<Week>,
    private readonly dataSource: DataSource,
  ) {}

  async catalog(bundleId: string, courseId: string, actor: AuthenticatedUser) {
    if (actor.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Student access is required');
    }

    const course = await this.courses.findOne({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    const accessRows = await this.dataSource.query<Array<{ lecture_id: string }>>(`
      SELECT DISTINCT lecture.id AS lecture_id
      FROM bundles bundle
      INNER JOIN bundle_enrollments enrollment
        ON enrollment.bundle_id = bundle.id AND enrollment.student_id = $2
      INNER JOIN bundle_courses bundle_course ON bundle_course.bundle_id = bundle.id
      INNER JOIN weeks week ON week.course_id = bundle_course.course_id
      INNER JOIN lectures lecture ON lecture.week_id = week.id
      WHERE bundle.id = $1
        AND bundle_course.course_id = $3
        AND (
          EXISTS (
            SELECT 1
            FROM bundle_weeks selected
            WHERE selected.bundle_id = bundle.id AND selected.week_id = week.id
          )
          OR NOT EXISTS (
            SELECT 1
            FROM bundle_weeks selected
            INNER JOIN weeks selected_week ON selected_week.id = selected.week_id
            WHERE selected.bundle_id = bundle.id
              AND selected_week.course_id = bundle_course.course_id
          )
        )
        AND enrollment.status = 'ACTIVE'
        AND (enrollment.starts_at IS NULL OR enrollment.starts_at <= CURRENT_TIMESTAMP)
        AND (enrollment.expires_at IS NULL OR enrollment.expires_at > CURRENT_TIMESTAMP)
        AND enrollment.payment_status IN ('NOT_REQUIRED', 'PAID')
        AND bundle.status = 'PUBLISHED'
        AND (bundle.available_from IS NULL OR bundle.available_from <= CURRENT_TIMESTAMP)
        AND (bundle.available_until IS NULL OR bundle.available_until > CURRENT_TIMESTAMP)
        AND lecture.is_published = TRUE
    `, [bundleId, actor.userId, courseId]);

    if (!accessRows.length) {
      throw new ForbiddenException('This bundle does not grant access to this course');
    }

    const accessibleLectureIds = accessRows.map((row) => row.lecture_id);
    const allowed = new Set(accessibleLectureIds);
    const weeks = await this.weeks.find({
      where: { courseId },
      relations: { lectures: true },
      order: { weekNumber: 'ASC', lectures: { lectureNumber: 'ASC' } },
    });

    for (const week of weeks) {
      week.lectures = week.lectures.filter(
        (lecture) => allowed.has(lecture.id) && lecture.isPublished,
      );
    }

    const counts = await this.dataSource.query<Array<{
      lecture_id: string;
      question_count: number;
    }>>(`
      SELECT topic.lecture_id, COUNT(DISTINCT question.id)::int AS question_count
      FROM questions question
      INNER JOIN topics topic ON topic.id = question.topic_id
      WHERE topic.lecture_id = ANY($1::uuid[])
        AND question.is_active = TRUE
        AND question.is_question_bank = TRUE
        AND question.question_type = 'MCQ'
        AND (
          SELECT COUNT(*)
          FROM mcq_options option_row
          WHERE option_row.question_id = question.id
        ) = 5
        AND (
          SELECT COUNT(*)
          FROM mcq_options option_row
          WHERE option_row.question_id = question.id
            AND option_row.is_correct = TRUE
        ) = 1
      GROUP BY topic.lecture_id
    `, [accessibleLectureIds]);

    const byLecture = new Map(
      counts.map((row) => [row.lecture_id, Number(row.question_count)]),
    );

    return {
      course,
      weeks: weeks.map((week) => ({
        ...week,
        lectures: week.lectures.map((lecture) => ({
          ...lecture,
          question_count: byLecture.get(lecture.id) ?? 0,
        })),
      })),
    };
  }
}
