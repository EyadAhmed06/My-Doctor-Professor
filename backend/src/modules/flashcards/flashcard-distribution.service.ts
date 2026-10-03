import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FlashcardDeckBundleAccessMode } from '../../common/entities/flashcard-deck.entity';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { UpdateDeckDistributionDto } from './dtos/flashcards.dto';

type DeckRow = {
  id:string;
  course_id:string;
  created_by:string;
  is_published:boolean;
  bundle_access_mode:FlashcardDeckBundleAccessMode;
};

type BundleRow = {
  id:string;
  title:string;
  academic_year:number;
  status:string;
};

@Injectable()
export class FlashcardDistributionService {
  constructor(private readonly dataSource:DataSource) {}

  async get(deckId:string,actor:AuthenticatedUser) {
    const deck=await this.requireManageableDeck(deckId,actor);
    const [restrictions,candidates]=await Promise.all([
      this.dataSource.query<Array<{bundle_id:string}>>(
        `SELECT bundle_id FROM flashcard_deck_bundle_restrictions WHERE deck_id=$1 ORDER BY bundle_id`,
        [deckId],
      ),
      this.candidateBundles(deck,actor),
    ]);
    return {
      bundle_access_mode:deck.bundle_access_mode,
      bundle_ids:restrictions.map((row)=>row.bundle_id),
      candidate_bundles:candidates,
    };
  }

  async update(deckId:string,dto:UpdateDeckDistributionDto,actor:AuthenticatedUser) {
    const deck=await this.requireManageableDeck(deckId,actor);
    if(deck.is_published) {
      throw new ConflictException('Return the deck to Draft before changing bundle availability');
    }

    const bundleIds=[...new Set(dto.bundle_ids??[])];
    if(dto.bundle_access_mode===FlashcardDeckBundleAccessMode.RESTRICTED && bundleIds.length===0) {
      throw new BadRequestException('Restricted availability requires at least one bundle');
    }

    if(bundleIds.length) {
      const candidates=await this.candidateBundles(deck,actor);
      const allowed=new Set(candidates.map((bundle)=>bundle.id));
      const invalid=bundleIds.filter((id)=>!allowed.has(id));
      if(invalid.length) {
        throw new ForbiddenException('One or more selected bundles are not manageable for this deck course');
      }
    }

    await this.dataSource.transaction(async(manager)=>{
      await manager.query(
        `UPDATE flashcard_decks SET bundle_access_mode=$2 WHERE id=$1`,
        [deckId,dto.bundle_access_mode],
      );
      await manager.query(`DELETE FROM flashcard_deck_bundle_restrictions WHERE deck_id=$1`,[deckId]);
      if(dto.bundle_access_mode===FlashcardDeckBundleAccessMode.RESTRICTED) {
        for(const bundleId of bundleIds) {
          await manager.query(
            `INSERT INTO flashcard_deck_bundle_restrictions(deck_id,bundle_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
            [deckId,bundleId],
          );
        }
      }
    });

    return this.get(deckId,actor);
  }

  private async candidateBundles(deck:DeckRow,actor:AuthenticatedUser):Promise<BundleRow[]> {
    if(actor.role===UserRole.SYSTEM_ADMIN) {
      return this.dataSource.query<BundleRow[]>(`
        SELECT DISTINCT bundle.id,bundle.title,bundle.academic_year,bundle.status
        FROM bundles bundle
        JOIN bundle_courses bundle_course ON bundle_course.bundle_id=bundle.id
        WHERE bundle_course.course_id=$1 AND bundle.status <> 'ARCHIVED'
        ORDER BY bundle.academic_year,bundle.title
      `,[deck.course_id]);
    }
    return this.dataSource.query<BundleRow[]>(`
      SELECT DISTINCT bundle.id,bundle.title,bundle.academic_year,bundle.status
      FROM bundles bundle
      JOIN bundle_courses bundle_course ON bundle_course.bundle_id=bundle.id
      JOIN bundle_instructors assignment ON assignment.bundle_id=bundle.id
      WHERE bundle_course.course_id=$1
        AND assignment.instructor_id=$2
        AND bundle.status <> 'ARCHIVED'
      ORDER BY bundle.academic_year,bundle.title
    `,[deck.course_id,actor.userId]);
  }

  private async requireManageableDeck(deckId:string,actor:AuthenticatedUser):Promise<DeckRow> {
    const rows=await this.dataSource.query<DeckRow[]>(`
      SELECT id,course_id,created_by,is_published,bundle_access_mode
      FROM flashcard_decks WHERE id=$1 LIMIT 1
    `,[deckId]);
    const deck=rows[0];
    if(!deck||!deck.course_id) throw new NotFoundException('Flashcard deck not found');
    if(actor.role!==UserRole.SYSTEM_ADMIN&&deck.created_by!==actor.userId) {
      throw new ForbiddenException('You can manage only decks you created');
    }
    return deck;
  }
}
