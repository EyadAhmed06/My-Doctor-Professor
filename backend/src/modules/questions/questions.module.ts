import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EssayConfiguration } from '../../common/entities/essay-configuration.entity';
import { McqOption } from '../../common/entities/mcq-option.entity';
import { Question } from '../../common/entities/question.entity';
import { QuestionTag } from '../../common/entities/question-tag.entity';
import { Tag } from '../../common/entities/tag.entity';
import { Topic } from '../../common/entities/topic.entity';
import { AcademicModule } from '../academic/academic.module';
import { BundleAccessModule } from '../bundle-access/bundle-access.module';
import { EssayQuestionImportController } from './essay-question-import.controller';
import { EssayQuestionImportService } from './essay-question-import.service';
import { InstructorQuestionAccessService } from './instructor-question-access.service';
import { PdfTextExtractionService } from './pdf-text-extraction.service';
import { QuestionImportEnrichmentService } from './question-import-enrichment.service';
import { QuestionImportService } from './question-import.service';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { StudentQuestionAccessService } from './student-question-access.service';
import { UnicodeQuestionImportService } from './unicode-question-import.service';

@Module({
  imports: [
    AcademicModule,
    BundleAccessModule,
    TypeOrmModule.forFeature([
      Question,
      McqOption,
      EssayConfiguration,
      Tag,
      QuestionTag,
      Topic,
    ]),
  ],
  controllers: [QuestionsController, EssayQuestionImportController],
  providers: [
    QuestionsService,
    StudentQuestionAccessService,
    InstructorQuestionAccessService,
    PdfTextExtractionService,
    UnicodeQuestionImportService,
    {
      provide: QuestionImportService,
      useExisting: UnicodeQuestionImportService,
    },
    QuestionImportEnrichmentService,
    EssayQuestionImportService,
  ],
  exports: [
    QuestionsService,
    StudentQuestionAccessService,
    InstructorQuestionAccessService,
    QuestionImportService,
    QuestionImportEnrichmentService,
    EssayQuestionImportService,
    TypeOrmModule,
  ],
})
export class QuestionsModule {}
