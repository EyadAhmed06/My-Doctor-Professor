import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Question } from '../../common/entities/question.entity';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { BundleAccessService } from '../bundle-access/bundle-access.service';
import { QuestionQueryDto, SearchQuestionsDto } from './dtos/questions.dto';

@Injectable()
export class StudentQuestionAccessService {
  constructor(
    @InjectRepository(Question) private readonly questions: Repository<Question>,
    private readonly bundleAccess: BundleAccessService,
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
      .orderBy('question.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    this.bundleAccess.applyStudentAccessScope(builder, 'question', actor.userId);

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
