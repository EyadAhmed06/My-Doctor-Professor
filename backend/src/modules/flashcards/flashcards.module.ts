import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from '../../common/entities/course.entity';
import { CourseInstructor } from '../../common/entities/course-instructor.entity';
import { FlashcardDeck } from '../../common/entities/flashcard-deck.entity';
import { Flashcard } from '../../common/entities/flashcard.entity';
import { Lecture } from '../../common/entities/lecture.entity';
import { StudentFlashcardProgress } from '../../common/entities/student-flashcard-progress.entity';
import { Topic } from '../../common/entities/topic.entity';
import { Week } from '../../common/entities/week.entity';
import { BundleAccessModule } from '../bundle-access/bundle-access.module';
import { Student } from '../users/entities/student.entity';
import { FlashcardAccessService } from './flashcard-access.service';
import { FlashcardDistributionService } from './flashcard-distribution.service';
import { FlashcardEditingService } from './flashcard-editing.service';
import { FlashcardsController } from './flashcards.controller';
import { FlashcardsService } from './flashcards.service';

@Module({
 imports:[
  BundleAccessModule,
  TypeOrmModule.forFeature([
   FlashcardDeck,Flashcard,StudentFlashcardProgress,Course,CourseInstructor,Week,Lecture,Topic,Student,
  ]),
 ],
 controllers:[FlashcardsController],
 providers:[FlashcardsService,FlashcardAccessService,FlashcardDistributionService,FlashcardEditingService],
 exports:[FlashcardsService,TypeOrmModule],
})
export class FlashcardsModule {}
