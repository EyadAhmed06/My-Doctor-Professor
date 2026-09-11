import { ForbiddenException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { FlashcardDeck } from '../../common/entities/flashcard-deck.entity';
import { Flashcard } from '../../common/entities/flashcard.entity';
import { QuestionDifficulty } from '../../common/entities/question.entity';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { FlashcardEditingService } from './flashcard-editing.service';

const instructor: AuthenticatedUser = {
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  email: 'instructor@example.test',
  role: UserRole.INSTRUCTOR,
};

function publishedDeck(overrides: Partial<FlashcardDeck> = {}): FlashcardDeck {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    createdBy: instructor.userId,
    title: 'Published deck',
    description: null,
    displayOrder: 1,
    isPublished: true,
    courseId: '44444444-4444-4444-8444-444444444444',
    lectureId: null,
    topicId: null,
    course: { isActive: true } as FlashcardDeck['course'],
    lecture: null,
    cards: [],
    creator: {} as FlashcardDeck['creator'],
    topic: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('FlashcardEditingService', () => {
  it('edits published deck metadata without forcing the deck back to draft', async () => {
    const deck = publishedDeck();
    const save = jest.fn().mockImplementation(async (value) => value);
    const service = new FlashcardEditingService(
      { findOne: jest.fn().mockResolvedValue(deck), save } as unknown as Repository<FlashcardDeck>,
      {} as Repository<Flashcard>,
      {} as DataSource,
    );

    const result = await service.updateDeck(deck.id, { title: 'Updated live title' }, instructor);

    expect(result.title).toBe('Updated live title');
    expect(result.isPublished).toBe(true);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ isPublished: true }));
  });

  it('edits a published card and makes existing student progress due again after semantic changes', async () => {
    const deck = publishedDeck();
    const card = {
      id: '55555555-5555-4555-8555-555555555555',
      deckId: deck.id,
      title: 'Old title',
      frontContent: 'Old front',
      backContent: 'Old back',
      explanation: null,
      hint: null,
      difficulty: QuestionDifficulty.MEDIUM,
      estimatedReviewSeconds: null,
      displayOrder: 1,
      isActive: true,
      deck,
    } as Flashcard;
    const resetSet = jest.fn().mockReturnThis();
    const resetWhere = jest.fn().mockReturnThis();
    const resetExecute = jest.fn().mockResolvedValue({ affected: 2 });
    const progressBuilder = {
      update: jest.fn().mockReturnThis(),
      set: resetSet,
      where: resetWhere,
      execute: resetExecute,
    };
    const savedCard = jest.fn().mockImplementation(async (value) => value);
    const manager = {
      getRepository: jest.fn().mockImplementation((entity) => entity === Flashcard
        ? { save: savedCard }
        : { createQueryBuilder: jest.fn().mockReturnValue(progressBuilder) }),
    };
    const transaction = jest.fn().mockImplementation(async (callback) => callback(manager));
    const service = new FlashcardEditingService(
      {} as Repository<FlashcardDeck>,
      { findOne: jest.fn().mockResolvedValue(card) } as unknown as Repository<Flashcard>,
      { transaction } as unknown as DataSource,
    );

    const result = await service.updateCard(card.id, { front_content: 'Corrected live front' }, instructor);

    expect(result.frontContent).toBe('Corrected live front');
    expect(deck.isPublished).toBe(true);
    expect(resetSet).toHaveBeenCalledWith(expect.objectContaining({
      reviewStreak: 0,
      intervalDays: 0,
      isMastered: false,
      masteredAt: null,
      nextReviewAt: expect.any(Date),
    }));
    expect(resetWhere).toHaveBeenCalledWith('flashcard_id = :cardId', { cardId: card.id });
    expect(resetExecute).toHaveBeenCalled();
  });

  it('does not reset learning progress for a display-order-only edit', async () => {
    const deck = publishedDeck();
    const card = {
      id: '66666666-6666-4666-8666-666666666666',
      deckId: deck.id,
      title: 'Card',
      frontContent: 'Front',
      backContent: 'Back',
      explanation: null,
      hint: null,
      difficulty: QuestionDifficulty.MEDIUM,
      estimatedReviewSeconds: null,
      displayOrder: 1,
      isActive: true,
      deck,
    } as Flashcard;
    const createQueryBuilder = jest.fn();
    const manager = {
      getRepository: jest.fn().mockImplementation((entity) => entity === Flashcard
        ? { save: jest.fn().mockImplementation(async (value) => value) }
        : { createQueryBuilder }),
    };
    const service = new FlashcardEditingService(
      {} as Repository<FlashcardDeck>,
      { findOne: jest.fn().mockResolvedValue(card) } as unknown as Repository<Flashcard>,
      { transaction: jest.fn().mockImplementation(async (callback) => callback(manager)) } as unknown as DataSource,
    );

    await service.updateCard(card.id, { display_order: 2 }, instructor);

    expect(createQueryBuilder).not.toHaveBeenCalled();
  });

  it('keeps instructor ownership enforcement for live edits', async () => {
    const deck = publishedDeck({ createdBy: '77777777-7777-4777-8777-777777777777' });
    const service = new FlashcardEditingService(
      { findOne: jest.fn().mockResolvedValue(deck) } as unknown as Repository<FlashcardDeck>,
      {} as Repository<Flashcard>,
      {} as DataSource,
    );

    await expect(service.updateDeck(deck.id, { title: 'Not allowed' }, instructor))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
