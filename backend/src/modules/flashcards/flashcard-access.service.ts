import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { FlashcardDeck } from '../../common/entities/flashcard-deck.entity';
import { Flashcard } from '../../common/entities/flashcard.entity';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { BundleAccessService } from '../bundle-access/bundle-access.service';
import { UserRole } from '../users/entities/user.entity';
import { CardQueryDto, DeckQueryDto } from './dtos/flashcards.dto';

@Injectable()
export class FlashcardAccessService {
  constructor(
    @InjectRepository(FlashcardDeck) private readonly decks: Repository<FlashcardDeck>,
    @InjectRepository(Flashcard) private readonly cards: Repository<Flashcard>,
    private readonly dataSource: DataSource,
    private readonly bundleAccess: BundleAccessService,
  ) {}

  async assertDeckReadable(deckId: string, actor: AuthenticatedUser): Promise<void> {
    await this.bundleAccess.assertDeckAccess(deckId, actor);
  }

  async assertCardReadable(cardId: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.role !== UserRole.STUDENT) return;
    const rows = await this.dataSource.query(
      `SELECT deck_id FROM flashcards WHERE id = $1 AND is_active = TRUE LIMIT 1`,
      [cardId],
    ) as Array<{ deck_id: string }>;
    if (!rows[0]) throw new NotFoundException('Flashcard not found');
    await this.assertDeckReadable(rows[0].deck_id, actor);
  }

  async listStudentDecks(query: DeckQueryDto, actor: AuthenticatedUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const builder = this.decks.createQueryBuilder('deck')
      .leftJoinAndSelect('deck.course', 'course')
      .leftJoinAndSelect('deck.week', 'deckWeek')
      .leftJoinAndSelect('deck.lecture', 'lecture')
      .leftJoinAndSelect('lecture.week', 'week')
      .leftJoinAndSelect('deck.topic', 'topic')
      .where('deck.is_published = TRUE')
      .andWhere('course.is_active = TRUE')
      .andWhere('(deck.lecture_id IS NULL OR lecture.is_published = TRUE)')
      .orderBy('deck.display_order', 'ASC')
      .addOrderBy('deck.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    this.bundleAccess.applyStudentAccessScope(builder, 'deck', actor.userId);

    if (query.course_id) builder.andWhere('deck.course_id = :courseId', { courseId: query.course_id });
    if (query.week_id) builder.andWhere('deck.week_id = :weekId', { weekId: query.week_id });
    if (query.lecture_id) builder.andWhere('deck.lecture_id = :lectureId', { lectureId: query.lecture_id });
    if (query.topic_id) builder.andWhere('deck.topic_id = :topicId', { topicId: query.topic_id });
    if (query.search) {
      builder.andWhere(new Brackets((where) => where
        .where('deck.title ILIKE :search')
        .orWhere('deck.description ILIKE :search')),
      { search: `%${query.search.trim()}%` });
    }
    const [decks, total] = await builder.getManyAndCount();
    const deckIds = decks.map((deck) => deck.id);
    const countRows = deckIds.length ? await this.cards.createQueryBuilder('card')
      .select('card.deck_id', 'deck_id')
      .addSelect('COUNT(*)::int', 'count')
      .where('card.deck_id IN (:...deckIds)', { deckIds })
      .andWhere('card.is_active = TRUE')
      .groupBy('card.deck_id')
      .getRawMany<{ deck_id: string; count: number }>() : [];
    const counts = new Map(countRows.map((row) => [row.deck_id, Number(row.count)]));
    return {
      data: decks.map((deck) => ({ ...deck, cardCount: counts.get(deck.id) ?? 0 })),
      page, limit, total, total_pages: Math.ceil(total / limit),
    };
  }

  async listStudentCourses(actor: AuthenticatedUser) {
    const builder = this.decks.createQueryBuilder('deck')
      .innerJoin('deck.course', 'course')
      .innerJoin('deck.cards', 'card', 'card.is_active = TRUE')
      .leftJoin('deck.lecture', 'lecture')
      .where('deck.is_published = TRUE')
      .andWhere('course.is_active = TRUE')
      .andWhere('(deck.lecture_id IS NULL OR lecture.is_published = TRUE)')
      .select('course.id', 'id')
      .addSelect('course.courseName', 'courseName')
      .addSelect('course.courseCode', 'courseCode')
      .addSelect('COUNT(DISTINCT deck.id)::int', 'deckCount')
      .addSelect('COUNT(DISTINCT card.id)::int', 'cardCount')
      .groupBy('course.id')
      .addGroupBy('course.courseName')
      .addGroupBy('course.courseCode')
      .orderBy('course.courseName', 'ASC');

    this.bundleAccess.applyStudentAccessScope(builder, 'deck', actor.userId);

    return builder.getRawMany<{ id: string; courseName: string; courseCode: string; deckCount: number; cardCount: number }>();
  }

  async listStudentDue(actor: AuthenticatedUser, query: CardQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const now = new Date();
    const builder = this.cards.createQueryBuilder('card')
      .innerJoinAndSelect('card.deck', 'deck')
      .innerJoinAndSelect('deck.course', 'course')
      .leftJoinAndSelect('deck.lecture', 'lecture')
      .leftJoinAndSelect('lecture.week', 'week')
      .leftJoinAndMapOne(
        'card.progress', 'student_flashcard_progress', 'progress',
        'progress.flashcard_id = card.id AND progress.student_id = :studentId',
        { studentId: actor.userId },
      )
      .where('card.is_active = TRUE')
      .andWhere('deck.is_published = TRUE')
      .andWhere('course.is_active = TRUE')
      .andWhere('(deck.lecture_id IS NULL OR lecture.is_published = TRUE)')
      .andWhere('(progress.id IS NULL OR progress.next_review_at IS NULL OR progress.next_review_at <= :now)', { now })
      .orderBy('progress.next_review_at', 'ASC', 'NULLS FIRST')
      .addOrderBy('deck.display_order', 'ASC')
      .addOrderBy('card.display_order', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    this.bundleAccess.applyStudentAccessScope(builder, 'card', actor.userId);

    if (query.course_id) builder.andWhere('deck.course_id = :courseId', { courseId: query.course_id });
    if (query.difficulty) builder.andWhere('card.difficulty = :difficulty', { difficulty: query.difficulty });
    const [data, total] = await builder.getManyAndCount();
    return { data, page, limit, total, total_pages: Math.ceil(total / limit) };
  }

  async listStudentAll(actor: AuthenticatedUser, query: CardQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const builder = this.cards.createQueryBuilder('card')
      .innerJoinAndSelect('card.deck', 'deck')
      .innerJoinAndSelect('deck.course', 'course')
      .leftJoinAndSelect('deck.lecture', 'lecture')
      .leftJoinAndSelect('lecture.week', 'week')
      .leftJoinAndMapOne(
        'card.progress', 'student_flashcard_progress', 'progress',
        'progress.flashcard_id = card.id AND progress.student_id = :studentId',
        { studentId: actor.userId },
      )
      .where('card.is_active = TRUE')
      .andWhere('deck.is_published = TRUE')
      .andWhere('course.is_active = TRUE')
      .andWhere('(deck.lecture_id IS NULL OR lecture.is_published = TRUE)')
      .orderBy('deck.display_order', 'ASC')
      .addOrderBy('card.display_order', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    this.bundleAccess.applyStudentAccessScope(builder, 'card', actor.userId);

    if (query.course_id) builder.andWhere('deck.course_id = :courseId', { courseId: query.course_id });
    if (query.difficulty) builder.andWhere('card.difficulty = :difficulty', { difficulty: query.difficulty });
    const [data, total] = await builder.getManyAndCount();
    return { data, page, limit, total, total_pages: Math.ceil(total / limit) };
  }
}
