import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Course } from '../../common/entities/course.entity';
import { Week } from '../../common/entities/week.entity';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { BundleAccessService } from '../bundle-access/bundle-access.service';
import { UserRole } from '../users/entities/user.entity';

@Injectable()
export class McqPracticeCatalogService {
  constructor(
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(Week) private readonly weeks: Repository<Week>,
    private readonly dataSource: DataSource,
    private readonly bundleAccess: BundleAccessService,
  ) {}

  async catalog(bundleId: string, courseId: string, actor: AuthenticatedUser) {
    if (actor.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Student access is required');
    }

    const course = await this.courses.findOne({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    const accessibleLectureIds = await this.bundleAccess.getAccessibleLectureIdsInBundle(
      bundleId,
      actor.userId,
      courseId,
    );

    const enrollment = await this.dataSource.query(
      `SELECT 1 FROM bundle_courses link
       JOIN bundles bundle ON bundle.id = link.bundle_id
       JOIN bundle_enrollments enrollment ON enrollment.bundle_id = bundle.id AND enrollment.student_id = $3
       WHERE link.bundle_id = $1 AND link.course_id = $2
         AND enrollment.status = 'ACTIVE' AND (enrollment.starts_at IS NULL OR enrollment.starts_at <= CURRENT_TIMESTAMP) AND (enrollment.expires_at IS NULL OR enrollment.expires_at > CURRENT_TIMESTAMP) AND enrollment.payment_status IN ('NOT_REQUIRED', 'PAID') AND bundle.status = 'PUBLISHED' AND (bundle.available_from IS NULL OR bundle.available_from <= CURRENT_TIMESTAMP) AND (bundle.available_until IS NULL OR bundle.available_until > CURRENT_TIMESTAMP) LIMIT 1`,
      [bundleId, courseId, actor.userId],
    );
    if (!enrollment.length) throw new ForbiddenException('This bundle does not grant access to this course');
    const allowed = new Set(accessibleLectureIds);
    const weeks = await this.weeks.find({
      where: { courseId },
      relations: { lectures: true },
      order: { weekNumber: 'ASC', lectures: { lectureNumber: 'ASC' } },
    });

    for (const week of weeks) {
      week.lectures = week.lectures.filter(
        (lecture) => lecture.isPublished,
      );
    }

    const counts = await this.dataSource.query<Array<{
      lecture_id: string;
      topic_id: string;
      topic_name: string;
      question_count: number;
    }>>(`
      SELECT topic.lecture_id, topic.id AS topic_id, topic.topic_name,
        COUNT(DISTINCT question.id)::int AS question_count
      FROM questions question
      INNER JOIN topics topic ON topic.id = question.topic_id
      WHERE topic.lecture_id = ANY($1::uuid[])
        AND topic.is_locked = FALSE
        AND question.is_active = TRUE
        AND question.is_question_bank = TRUE
        AND question.question_type = 'MCQ'
        AND (
          SELECT COUNT(*)
          FROM mcq_options option_row
          WHERE option_row.question_id = question.id
        ) BETWEEN 4 AND 5
        AND (
          SELECT COUNT(*)
          FROM mcq_options option_row
          WHERE option_row.question_id = question.id
            AND option_row.is_correct = TRUE
        ) = 1
      GROUP BY topic.lecture_id, topic.id, topic.topic_name
    `, [accessibleLectureIds]);

    const byLecture = new Map<string, number>();
    for (const row of counts) byLecture.set(row.lecture_id, (byLecture.get(row.lecture_id) ?? 0) + Number(row.question_count));

    return {
      course,
      weeks: weeks.map((week) => ({
        id: week.id,
        weekNumber: week.weekNumber,
        title: week.title,
        isLocked: week.isLocked || !week.lectures.some(lecture => allowed.has(lecture.id)),
        lectures: week.lectures.map((lecture) => ({
          id: lecture.id,
          title: lecture.title,
          lectureNumber: lecture.lectureNumber,
          isLocked: !allowed.has(lecture.id),
          question_count: allowed.has(lecture.id) ? byLecture.get(lecture.id) ?? 0 : 0,
          topics: allowed.has(lecture.id) ? counts.filter((row) => row.lecture_id === lecture.id).map((row) => ({
            id: row.topic_id,
            title: row.topic_name,
            question_count: Number(row.question_count),
          })) : [],
        })),
      })),
    };
  }
}
