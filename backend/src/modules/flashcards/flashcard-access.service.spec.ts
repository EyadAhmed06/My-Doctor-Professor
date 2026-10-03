import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { FlashcardDeck } from '../../common/entities/flashcard-deck.entity';
import { Flashcard } from '../../common/entities/flashcard.entity';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { BundleAccessService } from '../bundle-access/bundle-access.service';
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
    const dataSource = { query } as unknown as DataSource;
    const bundleAccess = new BundleAccessService(dataSource);
    const service = new FlashcardAccessService(
      {} as Repository<FlashcardDeck>,
      {} as Repository<Flashcard>,
      dataSource,
      bundleAccess,
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

  it('asserts canonical SQL: ACTIVE status, payment_status PAID/NOT_REQUIRED, and PUBLISHED bundle', async () => {
    const { service, query } = setup([[{ allowed: 1 }]]);
    await service.assertDeckReadable('deck-1', student);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("enrollment.status = 'ACTIVE'");
    expect(sql).toContain("enrollment.payment_status IN ('NOT_REQUIRED', 'PAID')");
    expect(sql).toContain("bundle.status = 'PUBLISHED'");
    expect(sql).not.toContain("enrollment.status <> 'REVOKED'");
    expect(sql).not.toContain('ARCHIVED');
  });
});
