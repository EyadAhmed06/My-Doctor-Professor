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

    if (!accessibleLectureIds.length) {
      throw new ForbiddenException('This bundle does not grant access to this course');
    }
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
