import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlashcardDeck } from '../../common/entities/flashcard-deck.entity';
import { Flashcard } from '../../common/entities/flashcard.entity';
import { StudentFlashcardProgress } from '../../common/entities/student-flashcard-progress.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FlashcardDeck, Flashcard, StudentFlashcardProgress])],
  exports: [TypeOrmModule],
})
export class FlashcardsModule {}
