import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { EssayConfiguration } from '../../common/entities/essay-configuration.entity';
import { McqOption } from '../../common/entities/mcq-option.entity';
import {
  Question,
  QuestionType,
} from '../../common/entities/question.entity';
import { QuestionTag } from '../../common/entities/question-tag.entity';
import { Tag } from '../../common/entities/tag.entity';
import { Topic } from '../../common/entities/topic.entity';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import {
  CreateMcqOptionDto,
  CreateQuestionDto,
  CreateTagDto,
  EssayConfigurationDto,
  QuestionQueryDto,
  SearchQuestionsDto,
  UpdateMcqOptionDto,
  UpdateQuestionDto,
} from './dtos/questions.dto';

interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

@Injectable()
export class QuestionsService {
  constructor(
    @InjectRepository(Question)
    private readonly questions: Repository<Question>,
    @InjectRepository(McqOption)
    private readonly options: Repository<McqOption>,
    @InjectRepository(EssayConfiguration)
    private readonly essayConfigurations: Repository<EssayConfiguration>,
    @InjectRepository(Tag)
    private readonly tags: Repository<Tag>,
    @InjectRepository(QuestionTag)
    private readonly questionTags: Repository<QuestionTag>,
    @InjectRepository(Topic)
    private readonly topics: Repository<Topic>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateQuestionDto, actor: AuthenticatedUser) {
    await this.requireTopic(dto.topic_id);
    const question = this.questions.create({
      topicId: dto.topic_id,
      questionType: dto.question_type,
      title: dto.title?.trim() || null,
      questionText: dto.question_text.trim(),
      explanation: dto.explanation?.trim() || null,
      hint: dto.hint?.trim() || null,
      reference: dto.reference?.trim() || null,
      difficulty: dto.difficulty,
      estimatedTimeSeconds: dto.estimated_time_seconds ?? null,
      marks: dto.marks.toFixed(2),
      isQuestionBank: true,
      version: 1,
      isActive: false,
      createdBy: actor.userId,
    });
    return this.questions.save(question);
  }

  async list(
    query: QuestionQueryDto,
    actor: AuthenticatedUser,
  ): Promise<Paginated<Record<string, unknown>>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const builder = this.questions
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.topic', 'topic')
      .leftJoinAndSelect('question.questionTags', 'questionTag')
      .leftJoinAndSelect('questionTag.tag', 'tag')
      .orderBy('question.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (actor.role === UserRole.STUDENT) {
      builder.andWhere('question.is_active = TRUE');
    } else if (query.is_active !== undefined) {
      builder.andWhere('question.is_active = :active', {
        active: query.is_active,
      });
    }
    if (query.topic_id) {
      builder.andWhere('question.topic_id = :topicId', {
        topicId: query.topic_id,
      });
    }
    if (query.question_type) {
      builder.andWhere('question.question_type = :type', {
        type: query.question_type,
      });
    }
    if (query.difficulty) {
      builder.andWhere('question.difficulty = :difficulty', {
        difficulty: query.difficulty,
      });
    }
    if (query.tag_id) {
      builder.andWhere('questionTag.tag_id = :tagId', { tagId: query.tag_id });
    }
    if (query.search) {
      builder.andWhere(
        new Brackets((where) => {
          where
            .where('question.question_text ILIKE :search')
            .orWhere('question.title ILIKE :search');
        }),
        { search: `%${query.search.trim()}%` },
      );
    }

    const [questions, total] = await builder.getManyAndCount();
    return {
      data: questions.map((question) => this.toView(question, actor.role)),
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    };
  }

  search(query: SearchQuestionsDto, actor: AuthenticatedUser) {
    return this.list(
      {
        search: query.q,
        limit: query.limit ?? 20,
        page: 1,
        ...(actor.role === UserRole.STUDENT ? { is_active: true } : {}),
      },
      actor,
    );
  }

  async getOne(id: string, actor: AuthenticatedUser) {
    const question = await this.questions.findOne({
      where: { id },
      relations: {
        topic: { lecture: { week: { course: true } } },
        options: true,
        essayConfiguration: true,
        questionTags: { tag: true },
      },
      order: {
        options: { displayOrder: 'ASC' },
      },
    });
    if (
      !question ||
      (actor.role === UserRole.STUDENT &&
        (!question.isActive ||
          !question.topic.lecture.isPublished ||
          !question.topic.lecture.week.course.isActive))
    ) {
      throw new NotFoundException('Question not found');
    }
    return this.toView(question, actor.role);
  }

  async update(
    id: string,
    dto: UpdateQuestionDto,
    actor: AuthenticatedUser,
  ) {
    const question = await this.requireMutableQuestion(id, actor);
    if (dto.title !== undefined) question.title = dto.title.trim() || null;
    if (dto.question_text !== undefined) {
      question.questionText = dto.question_text.trim();
    }
    if (dto.explanation !== undefined) {
      question.explanation = dto.explanation.trim() || null;
    }
    if (dto.hint !== undefined) question.hint = dto.hint.trim() || null;
    if (dto.reference !== undefined) {
      question.reference = dto.reference.trim() || null;
    }
    if (dto.difficulty !== undefined) question.difficulty = dto.difficulty;
    if (dto.estimated_time_seconds !== undefined) {
      question.estimatedTimeSeconds = dto.estimated_time_seconds;
    }
    if (dto.marks !== undefined) question.marks = dto.marks.toFixed(2);
    if (dto.is_active !== undefined) {
      if (dto.is_active) await this.assertQuestionComplete(question);
      question.isActive = dto.is_active;
    }
    question.version += 1;
    return this.questions.save(question);
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const question = await this.requireMutableQuestion(id, actor);
    try {
      await this.questions.remove(question);
    } catch (error) {
      this.rethrowDatabaseConflict(error, 'Question is already used by an assessment');
    }
  }

  async duplicate(id: string, actor: AuthenticatedUser) {
    const source = await this.questions.findOne({
      where: { id },
      relations: {
        options: true,
        essayConfiguration: true,
        questionTags: true,
      },
    });
    if (!source) throw new NotFoundException('Question not found');

    return this.dataSource.transaction(async (manager) => {
      const copy = await manager.save(
        Question,
        manager.create(Question, {
          topicId: source.topicId,
          questionType: source.questionType,
          title: source.title ? `${source.title} (Copy)` : null,
          questionText: source.questionText,
          explanation: source.explanation,
          hint: source.hint,
          reference: source.reference,
          difficulty: source.difficulty,
          estimatedTimeSeconds: source.estimatedTimeSeconds,
          marks: source.marks,
          isQuestionBank: source.isQuestionBank,
          version: 1,
          isActive: false,
          createdBy: actor.userId,
        }),
      );

      if (source.questionType === QuestionType.MCQ) {
        await manager.save(
          McqOption,
          source.options.map((option) =>
            manager.create(McqOption, {
              questionId: copy.id,
              optionText: option.optionText,
              isCorrect: option.isCorrect,
              displayOrder: option.displayOrder,
            }),
          ),
        );
      } else if (source.essayConfiguration) {
        await manager.save(
          EssayConfiguration,
          manager.create(EssayConfiguration, {
            questionId: copy.id,
            minimumWordCount: source.essayConfiguration.minimumWordCount,
            maximumWordCount: source.essayConfiguration.maximumWordCount,
            modelAnswer: source.essayConfiguration.modelAnswer,
            gradingRubric: source.essayConfiguration.gradingRubric,
          }),
        );
      }

      if (source.questionTags.length > 0) {
        await manager.save(
          QuestionTag,
          source.questionTags.map((item) =>
            manager.create(QuestionTag, {
              questionId: copy.id,
              tagId: item.tagId,
            }),
          ),
        );
      }
      return copy;
    });
  }

  async getOptions(questionId: string, actor: AuthenticatedUser) {
    const question = await this.requireVisibleQuestion(questionId, actor);
    if (question.questionType !== QuestionType.MCQ) {
      throw new ConflictException('Essay questions do not have MCQ options');
    }
    const options = await this.options.find({
      where: { questionId },
      order: { displayOrder: 'ASC' },
    });
    if (actor.role === UserRole.STUDENT) {
      return options.map(({ isCorrect: _correct, ...option }) => option);
    }
    return options;
  }

  async addOption(
    questionId: string,
    dto: CreateMcqOptionDto,
    actor: AuthenticatedUser,
  ) {
    const question = await this.requireMutableQuestion(questionId, actor);
    this.assertMcq(question);
    if (question.isActive) {
      throw new ConflictException('Deactivate the question before changing its options');
    }
    const option = this.options.create({
      questionId,
      optionText: dto.option_text.trim(),
      isCorrect: dto.is_correct,
      displayOrder: dto.display_order,
    });
    const saved = await this.saveUnique(
      () => this.options.save(option),
      'Option display order already exists for this question',
    );
    await this.incrementVersion(questionId);
    return saved;
  }

  async updateOption(
    id: string,
    dto: UpdateMcqOptionDto,
    actor: AuthenticatedUser,
  ) {
    const option = await this.options.findOne({
      where: { id },
      relations: { question: true },
    });
    if (!option) throw new NotFoundException('Option not found');
    this.assertOwner(option.question, actor);
    if (option.question.isActive) {
      throw new ConflictException('Deactivate the question before changing its options');
    }
    if (dto.option_text !== undefined) option.optionText = dto.option_text.trim();
    if (dto.is_correct !== undefined) option.isCorrect = dto.is_correct;
    if (dto.display_order !== undefined) option.displayOrder = dto.display_order;
    const saved = await this.saveUnique(
      () => this.options.save(option),
      'Option display order already exists for this question',
    );
    await this.incrementVersion(option.questionId);
    return saved;
  }

  async removeOption(id: string, actor: AuthenticatedUser): Promise<void> {
    const option = await this.options.findOne({
      where: { id },
      relations: { question: true },
    });
    if (!option) throw new NotFoundException('Option not found');
    this.assertOwner(option.question, actor);
    if (option.question.isActive) {
      throw new ConflictException('Deactivate the question before changing its options');
    }
    await this.options.remove(option);
    await this.incrementVersion(option.questionId);
  }

  async setEssayConfiguration(
    questionId: string,
    dto: EssayConfigurationDto,
    actor: AuthenticatedUser,
  ) {
    const question = await this.requireMutableQuestion(questionId, actor);
    if (question.questionType !== QuestionType.ESSAY) {
      throw new ConflictException('MCQ questions cannot have essay configuration');
    }
    if (question.isActive) {
      throw new ConflictException(
        'Deactivate the question before changing essay configuration',
      );
    }
    if (
      dto.minimum_word_count !== undefined &&
      dto.maximum_word_count !== undefined &&
      dto.minimum_word_count > dto.maximum_word_count
    ) {
      throw new ConflictException(
        'Minimum word count cannot exceed maximum word count',
      );
    }

    let config = await this.essayConfigurations.findOne({
      where: { questionId },
    });
    config ??= this.essayConfigurations.create({
      questionId,
      minimumWordCount: null,
      maximumWordCount: null,
      modelAnswer: null,
      gradingRubric: null,
    });
    if (dto.minimum_word_count !== undefined) {
      config.minimumWordCount = dto.minimum_word_count;
    }
    if (dto.maximum_word_count !== undefined) {
      config.maximumWordCount = dto.maximum_word_count;
    }
    if (
      config.minimumWordCount !== null &&
      config.maximumWordCount !== null &&
      config.minimumWordCount > config.maximumWordCount
    ) {
      throw new ConflictException(
        'Minimum word count cannot exceed maximum word count',
      );
    }
    if (dto.model_answer !== undefined) {
      config.modelAnswer = dto.model_answer.trim();
    }
    if (dto.grading_rubric !== undefined) {
      config.gradingRubric = dto.grading_rubric.trim();
    }
    const saved = await this.essayConfigurations.save(config);
    await this.incrementVersion(questionId);
    return saved;
  }

  async getEssayConfiguration(
    questionId: string,
    actor: AuthenticatedUser,
  ) {
    const question = await this.requireVisibleQuestion(questionId, actor);
    if (question.questionType !== QuestionType.ESSAY) {
      throw new ConflictException('MCQ questions do not have essay configuration');
    }
    const config = await this.essayConfigurations.findOne({
      where: { questionId },
    });
    if (!config) throw new NotFoundException('Essay configuration not found');
    if (actor.role === UserRole.STUDENT) {
      return {
        questionId: config.questionId,
        minimumWordCount: config.minimumWordCount,
        maximumWordCount: config.maximumWordCount,
      };
    }
    return config;
  }

  listTags(): Promise<Tag[]> {
    return this.tags.find({ order: { tagName: 'ASC' } });
  }

  createTag(dto: CreateTagDto): Promise<Tag> {
    return this.saveUnique(
      () =>
        this.tags.save(
          this.tags.create({
            tagName: dto.tag_name.trim().toLowerCase(),
          }),
        ),
      'Tag already exists',
    );
  }

  async removeTag(id: string): Promise<void> {
    const tag = await this.tags.findOne({
      where: { id },
      relations: { questionTags: true },
    });
    if (!tag) throw new NotFoundException('Tag not found');
    if (tag.questionTags.length > 0) {
      throw new ConflictException('Tag cannot be deleted while assigned to questions');
    }
    await this.tags.remove(tag);
  }

  async addTag(
    questionId: string,
    tagId: string,
    actor: AuthenticatedUser,
  ) {
    const question = await this.requireMutableQuestion(questionId, actor);
    await this.requireTag(tagId);
    const existing = await this.questionTags.findOne({
      where: { questionId, tagId },
    });
    if (existing) return existing;
    const saved = await this.questionTags.save(
      this.questionTags.create({ questionId, tagId }),
    );
    await this.incrementVersion(question.id);
    return saved;
  }

  async removeQuestionTag(
    questionId: string,
    tagId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const question = await this.requireMutableQuestion(questionId, actor);
    const assignment = await this.questionTags.findOne({
      where: { questionId, tagId },
    });
    if (!assignment) throw new NotFoundException('Question tag assignment not found');
    await this.questionTags.remove(assignment);
    await this.incrementVersion(question.id);
  }

  private async assertQuestionComplete(question: Question): Promise<void> {
    if (question.questionType === QuestionType.MCQ) {
      const options = await this.options.find({
        where: { questionId: question.id },
      });
      if (options.length < 2) {
        throw new ConflictException('An active MCQ requires at least two options');
      }
      if (!options.some((option) => option.isCorrect)) {
        throw new ConflictException('An active MCQ requires a correct option');
      }
      if (options.every((option) => option.isCorrect)) {
        throw new ConflictException('An MCQ must include at least one incorrect option');
      }
      return;
    }

    const config = await this.essayConfigurations.findOne({
      where: { questionId: question.id },
    });
    if (!config?.modelAnswer || !config.gradingRubric) {
      throw new ConflictException(
        'An active essay requires a model answer and grading rubric',
      );
    }
  }

  private async requireVisibleQuestion(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<Question> {
    const question = await this.questions.findOne({
      where: { id },
      relations: { topic: { lecture: { week: { course: true } } } },
    });
    if (
      !question ||
      (actor.role === UserRole.STUDENT &&
        (!question.isActive ||
          !question.topic.lecture.isPublished ||
          !question.topic.lecture.week.course.isActive))
    ) {
      throw new NotFoundException('Question not found');
    }
    return question;
  }

  private async requireMutableQuestion(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<Question> {
    const question = await this.questions.findOne({ where: { id } });
    if (!question) throw new NotFoundException('Question not found');
    this.assertOwner(question, actor);
    return question;
  }

  private assertOwner(question: Question, actor: AuthenticatedUser): void {
    if (
      actor.role === UserRole.INSTRUCTOR &&
      question.createdBy !== actor.userId
    ) {
      throw new ForbiddenException('Instructors may modify only their own questions');
    }
  }

  private assertMcq(question: Question): void {
    if (question.questionType !== QuestionType.MCQ) {
      throw new ConflictException('Essay questions cannot have MCQ options');
    }
  }

  private async requireTopic(id: string): Promise<Topic> {
    const topic = await this.topics.findOne({
      where: { id },
      relations: { lecture: true },
    });
    if (!topic) throw new NotFoundException('Topic not found');
    if (topic.lecture.isPublished) {
      throw new ConflictException(
        'Unpublish the lecture before adding questions to its topics',
      );
    }
    return topic;
  }

  private async requireTag(id: string): Promise<Tag> {
    const tag = await this.tags.findOne({ where: { id } });
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }

  private async incrementVersion(questionId: string): Promise<void> {
    await this.questions.increment({ id: questionId }, 'version', 1);
  }

  private toView(question: Question, role: UserRole): Record<string, unknown> {
    if (role !== UserRole.STUDENT) return question as unknown as Record<string, unknown>;
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
      ...(options
        ? {
            options: options.map(({ isCorrect: _correct, ...option }) => option),
          }
        : {}),
    };
  }

  private async saveUnique<T>(
    operation: () => Promise<T>,
    message: string,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { driverError?: { code?: string } })
          .driverError?.code === '23505'
      ) {
        throw new ConflictException(message);
      }
      throw error;
    }
  }

  private rethrowDatabaseConflict(error: unknown, message: string): never {
    if (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code === '23503'
    ) {
      throw new ConflictException(message);
    }
    throw error;
  }
}
