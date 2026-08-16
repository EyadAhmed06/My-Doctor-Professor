import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { FlashcardDeck } from '../../common/entities/flashcard-deck.entity';
import { Flashcard } from '../../common/entities/flashcard.entity';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { FlashcardAccessService } from './flashcard-access.service';

describe('FlashcardAccessService', () => {
  const student: AuthenticatedUser = {
    userId: 'student-1', sessionId: 'session-1', email: 'student@example.test', role: UserRole.STUDENT,
  };
  const instructor: AuthenticatedUser = {
    ...student, userId: 'instructor-1', role: UserRole.INSTRUCTOR,
  };

  function setup(results: unknown[][] = []) {
    const query = jest.fn();
    for (const result of results) query.mockResolvedValueOnce(result);
    const service = new FlashcardAccessService(
      {} as Repository<FlashcardDeck>,
      {} as Repository<Flashcard>,
      { query } as unknown as DataSource,
    );
    return { service, query };
  }

  it('hides a published deck when it is outside the student bundles', async () => {
    const { service } = setup([[]]);
    await expect(service.assertDeckReadable('deck-1', student)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows a deck that belongs to enrolled bundle content', async () => {
    const { service } = setup([[{ allowed: 1 }]]);
    await expect(service.assertDeckReadable('deck-1', student)).resolves.toBeUndefined();
  });

  it('walks direct card access through its deck policy', async () => {
    const { service, query } = setup([[{ deck_id: 'deck-1' }], [{ allowed: 1 }]]);
    await expect(service.assertCardReadable('card-1', student)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('leaves instructor ownership enforcement to the existing flashcard service', async () => {
    const { service, query } = setup();
    await expect(service.assertDeckReadable('deck-1', instructor)).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });
});
