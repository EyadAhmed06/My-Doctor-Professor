import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from '../../common/entities/course.entity';
import { FlashcardDeck } from '../../common/entities/flashcard-deck.entity';
import { Flashcard } from '../../common/entities/flashcard.entity';
import { Lecture } from '../../common/entities/lecture.entity';
import { StudentFlashcardProgress } from '../../common/entities/student-flashcard-progress.entity';
import { Topic } from '../../common/entities/topic.entity';
import { Student } from '../users/entities/student.entity';
import { FlashcardsController } from './flashcards.controller';
import { FlashcardsService } from './flashcards.service';

@Module({
 imports:[TypeOrmModule.forFeature([
  FlashcardDeck,Flashcard,StudentFlashcardProgress,Course,Lecture,Topic,Student,
 ])],
 controllers:[FlashcardsController],
 providers:[FlashcardsService],
 exports:[FlashcardsService,TypeOrmModule],
})
export class FlashcardsModule {}
