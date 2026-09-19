import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Question } from '../../common/entities/question.entity';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { QuestionQueryDto, SearchQuestionsDto } from './dtos/questions.dto';

@Injectable()
export class InstructorQuestionAccessService {
  constructor(@InjectRepository(Question) private readonly questions: Repository<Question>) {}

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
      .where(`EXISTS (
        SELECT 1 FROM course_instructors assignment
        WHERE assignment.course_id = course.id
          AND assignment.instructor_id = :instructorId
      )`, { instructorId: actor.userId })
      .orderBy('question.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.is_active !== undefined) builder.andWhere('question.is_active = :active', { active: query.is_active });
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
    return { data: items, page, limit, total, total_pages: Math.ceil(total / limit) };
  }

  search(query: SearchQuestionsDto, actor: AuthenticatedUser) {
    return this.list({ search: query.q, limit: query.limit ?? 20, page: 1 }, actor);
  }
}
