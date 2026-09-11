import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { BundleAccessService } from '../bundle-access/bundle-access.service';
import { UserRole } from '../users/entities/user.entity';

@Injectable()
export class AcademicAccessService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly bundleAccess: BundleAccessService,
  ) {}

  async assertCourseReadable(courseId: string, actor: AuthenticatedUser): Promise<void> {
    await this.bundleAccess.assertCourseAccess(courseId, actor);
  }

  async assertWeekReadable(weekId: string, actor: AuthenticatedUser): Promise<void> {
    await this.bundleAccess.assertWeekAccess(weekId, actor);
  }

  async assertLectureReadable(lectureId: string, actor: AuthenticatedUser): Promise<void> {
    await this.bundleAccess.assertLectureAccess(lectureId, actor);
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

  async assertQuestionManagedReadable(questionId: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.role === UserRole.SYSTEM_ADMIN) return;
    const rows = await this.dataSource.query(
      `SELECT topic_id FROM questions WHERE id = $1 LIMIT 1`,
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