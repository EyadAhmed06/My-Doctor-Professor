import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Question } from '../../common/entities/question.entity';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { QuestionQueryDto, SearchQuestionsDto } from './dtos/questions.dto';

@Injectable()
export class StudentQuestionAccessService {
  constructor(
    @InjectRepository(Question) private readonly questions: Repository<Question>,
  ) {}

  async list(query: QuestionQueryDto, actor: AuthenticatedUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const builder = this.questions.createQueryBuilder('question')
      .leftJoinAndSelect('question.topic', 'topic')
      .leftJoin('topic.lecture', 'lecture')
      .leftJoin('lecture.week', 'week')
      .leftJoin('week.course', 'course')
      .leftJoinAndSelect('question.questionTags', 'questionTag')
      .leftJoinAndSelect('questionTag.tag', 'tag')
      .where('question.is_active = TRUE')
      .andWhere('lecture.is_published = TRUE')
      .andWhere('course.is_active = TRUE')
      .andWhere(`EXISTS (
        SELECT 1
        FROM bundle_courses bundle_course
        JOIN bundles bundle ON bundle.id = bundle_course.bundle_id
        JOIN bundle_enrollments enrollment
          ON enrollment.bundle_id = bundle.id
         AND enrollment.student_id = :studentId
        WHERE bundle_course.course_id = course.id
          AND enrollment.status = 'ACTIVE'
          AND (enrollment.starts_at IS NULL OR enrollment.starts_at <= CURRENT_TIMESTAMP)
          AND (enrollment.expires_at IS NULL OR enrollment.expires_at > CURRENT_TIMESTAMP)
          AND enrollment.payment_status IN ('NOT_REQUIRED', 'PAID')
          AND bundle.status = 'PUBLISHED'
          AND (bundle.available_from IS NULL OR bundle.available_from <= CURRENT_TIMESTAMP)
          AND (bundle.available_until IS NULL OR bundle.available_until > CURRENT_TIMESTAMP)
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
          )
      )`, { studentId: actor.userId })
      .orderBy('question.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.topic_id) builder.andWhere('question.topic_id = :topicId', { topicId: query.topic_id });
    if (query.question_type) builder.andWhere('question.question_type = :type', { type: query.question_type });
    if (query.difficulty) builder.andWhere('question.difficulty = :difficulty', { difficulty: query.difficulty });
    if (query.tag_id) builder.andWhere('questionTag.tag_id = :tagId', { tagId: query.tag_id });
    if (query.search) {
      builder.andWhere(new Brackets((where) => {
        where.where('question.question_text ILIKE :search').orWhere('question.title ILIKE :search');
      }), { search: `%${query.search.trim()}%` });
    }

    const [items, total] = await builder.getManyAndCount();
    return {
      data: items.map((question) => this.toStudentView(question)),
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    };
  }

  search(query: SearchQuestionsDto, actor: AuthenticatedUser) {
    return this.list({ search: query.q, limit: query.limit ?? 20, page: 1 }, actor);
  }

  private toStudentView(question: Question): Record<string, unknown> {
    const {
      explanation: _explanation,
      hint: _hint,
      createdBy: _createdBy,
      essayConfiguration: _essay,
      options,
      ...safe
    } = question;
    return {
      ...safe,
      ...(options ? { options: options.map(({ isCorrect: _correct, ...option }) => option) } : {}),
    };
  }
}
