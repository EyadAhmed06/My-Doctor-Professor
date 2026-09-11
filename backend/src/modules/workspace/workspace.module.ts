import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DrugReference } from '../../common/entities/drug-reference.entity';
import { NotebookAttachment } from '../../common/entities/notebook-attachment.entity';
import { NotebookCollection } from '../../common/entities/notebook-collection.entity';
import { NotebookNote } from '../../common/entities/notebook-note.entity';
import { NotebookTag } from '../../common/entities/notebook-tag.entity';
import { StudentStudyPlan } from '../../common/entities/student-study-plan.entity';
import { StudyPlanItem } from '../../common/entities/study-plan-item.entity';
import { AcademicModule } from '../academic/academic.module';
import { FlashcardsModule } from '../flashcards/flashcards.module';
import { NotebookAttachmentFileService } from './notebook-attachment-file.service';
import { StudyPlanItemActionsService } from './study-plan-item-actions.service';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotebookNote,
      NotebookCollection,
      NotebookTag,
      NotebookAttachment,
      StudentStudyPlan,
      StudyPlanItem,
      DrugReference,
    ]),
    AcademicModule,
    FlashcardsModule,
  ],
  controllers: [WorkspaceController],
  providers: [WorkspaceService, StudyPlanItemActionsService, NotebookAttachmentFileService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
