import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FlashcardDeck } from '../../common/entities/flashcard-deck.entity';
import { Flashcard } from '../../common/entities/flashcard.entity';
import { StudentFlashcardProgress } from '../../common/entities/student-flashcard-progress.entity';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { UpdateDeckDto, UpdateFlashcardDto } from './dtos/flashcards.dto';

const SEMANTIC_CARD_FIELDS: Array<keyof UpdateFlashcardDto> = [
  'title',
  'front_content',
  'back_content',
  'difficulty',
  'explanation',
  'hint',
  'estimated_review_seconds',
];

@Injectable()
export class FlashcardEditingService {
  constructor(
    @InjectRepository(FlashcardDeck) private readonly decks: Repository<FlashcardDeck>,
    @InjectRepository(Flashcard) private readonly cards: Repository<Flashcard>,
    private readonly dataSource: DataSource,
  ) {}

  async updateDeck(id: string, dto: UpdateDeckDto, actor: AuthenticatedUser) {
    if (!Object.keys(dto).length) {
      throw new BadRequestException('At least one deck field must be provided');
    }
    const deck = await this.decks.findOne({
      where: { id },
      relations: { course: true, lecture: true },
    });
    if (!deck) throw new NotFoundException('Flashcard deck not found');
    this.assertOwner(deck, actor);

    if (dto.title !== undefined) deck.title = dto.title.trim();
    if (dto.description !== undefined) deck.description = dto.description.trim() || null;
    if (dto.display_order !== undefined) deck.displayOrder = dto.display_order;
    if (dto.is_published !== undefined) {
      if (dto.is_published) await this.assertPublishable(deck);
      deck.isPublished = dto.is_published;
    }
    return this.decks.save(deck);
  }

  async updateCard(id: string, dto: UpdateFlashcardDto, actor: AuthenticatedUser) {
    if (!Object.keys(dto).length) {
      throw new BadRequestException('At least one card field must be provided');
    }
    const card = await this.cards.findOne({
      where: { id },
      relations: { deck: { course: true, lecture: true } },
    });
    if (!card) throw new NotFoundException('Flashcard not found');
    this.assertOwner(card.deck, actor);

    const semanticChange = SEMANTIC_CARD_FIELDS.some((field) => dto[field] !== undefined);
    if (dto.title !== undefined) card.title = dto.title.trim();
    if (dto.front_content !== undefined) card.frontContent = dto.front_content.trim();
    if (dto.back_content !== undefined) card.backContent = dto.back_content.trim();
    if (dto.difficulty !== undefined) card.difficulty = dto.difficulty;
    if (dto.explanation !== undefined) card.explanation = dto.explanation.trim() || null;
    if (dto.hint !== undefined) card.hint = dto.hint.trim() || null;
    if (dto.estimated_review_seconds !== undefined) card.estimatedReviewSeconds = dto.estimated_review_seconds;
    if (dto.display_order !== undefined) card.displayOrder = dto.display_order;
    if (dto.is_active !== undefined) card.isActive = dto.is_active;

    if (card.deck.isPublished && !card.isActive) {
      const activeOthers = await this.cards.createQueryBuilder('candidate')
        .where('candidate.deck_id = :deckId', { deckId: card.deckId })
        .andWhere('candidate.id <> :cardId', { cardId: card.id })
        .andWhere('candidate.is_active = TRUE')
        .getCount();
      if (!activeOthers) {
        throw new ConflictException('A published deck must keep at least one active card');
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.getRepository(Flashcard).save(card);
      if (card.deck.isPublished && card.isActive && semanticChange) {
        await manager.getRepository(StudentFlashcardProgress)
          .createQueryBuilder()
          .update()
          .set({
            nextReviewAt: new Date(),
            reviewStreak: 0,
            intervalDays: 0,
            isMastered: false,
            masteredAt: null,
          })
          .where('flashcard_id = :cardId', { cardId: card.id })
          .execute();
      }
      return saved;
    });
  }

  private assertOwner(deck: FlashcardDeck, actor: AuthenticatedUser) {
    if (actor.role !== UserRole.SYSTEM_ADMIN && deck.createdBy !== actor.userId) {
      throw new ForbiddenException('You can manage only decks you created');
    }
  }

  private async assertPublishable(deck: FlashcardDeck) {
    const active = await this.cards.count({ where: { deckId: deck.id, isActive: true } });
    if (!active) throw new ConflictException('Add at least one active card before publishing');
    if (!deck.course?.isActive) throw new ConflictException('The parent course must be active');
    if (deck.lecture && !deck.lecture.isPublished) {
      throw new ConflictException('The parent lecture must be published');
    }
  }
}
