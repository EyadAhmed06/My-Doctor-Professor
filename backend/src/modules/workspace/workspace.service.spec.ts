import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { DrugReference } from '../../common/entities/drug-reference.entity';
import { NotebookAttachment } from '../../common/entities/notebook-attachment.entity';
import { NotebookCollection } from '../../common/entities/notebook-collection.entity';
import { NotebookNote } from '../../common/entities/notebook-note.entity';
import { NotebookTag } from '../../common/entities/notebook-tag.entity';
import { StudentStudyPlan } from '../../common/entities/student-study-plan.entity';
import {
  StudyPlanItem,
  StudyPlanItemStatus,
  StudyPlanItemType,
} from '../../common/entities/study-plan-item.entity';
import { FlashcardsService } from '../flashcards/flashcards.service';
import { WorkspaceService } from './workspace.service';

const dateFromToday = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

describe('WorkspaceService study plan item updates', () => {
  let service: WorkspaceService;
  let plans: jest.Mocked<Pick<Repository<StudentStudyPlan>, 'findOne'>>;
  let planItems: jest.Mocked<Pick<Repository<StudyPlanItem>, 'findOne' | 'save'>>;

  beforeEach(() => {
    plans = {
      findOne: jest.fn(),
    };
    planItems = {
      findOne: jest.fn(),
      save: jest.fn(async (item) => item),
    };

    service = new WorkspaceService(
      {} as Repository<NotebookNote>,
      {} as Repository<NotebookCollection>,
      {} as Repository<NotebookTag>,
      {} as Repository<NotebookAttachment>,
      plans as unknown as Repository<StudentStudyPlan>,
      planItems as unknown as Repository<StudyPlanItem>,
      {} as Repository<DrugReference>,
      {} as DataSource,
      {} as FlashcardsService,
    );
  });

  const item = (status = StudyPlanItemStatus.PLANNED) =>
    ({
      id: 'item-id',
      studentId: 'student-id',
      scheduledDate: dateFromToday(1),
      itemType: StudyPlanItemType.QUESTIONS,
      status,
      durationMinutes: 30,
      targetCount: 20,
      completedAt: null,
      metadata: {},
    }) as StudyPlanItem;

  it('requires at least one mutable field', async () => {
    await expect(
      service.updatePlanItem('student-id', 'item-id', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not update an item owned by another student', async () => {
    planItems.findOne.mockResolvedValue(null);

    await expect(
      service.updatePlanItem('student-id', 'missing-id', {
        status: StudyPlanItemStatus.COMPLETED,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('prevents rescheduling completed sessions', async () => {
    planItems.findOne.mockResolvedValue(item(StudyPlanItemStatus.COMPLETED));

    await expect(
      service.updatePlanItem('student-id', 'item-id', {
        scheduled_date: dateFromToday(2),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('prevents moving sessions into the past', async () => {
    planItems.findOne.mockResolvedValue(item());

    await expect(
      service.updatePlanItem('student-id', 'item-id', {
        scheduled_date: dateFromToday(-1),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires sessions to remain before the exam date', async () => {
    const examDate = dateFromToday(5);
    planItems.findOne.mockResolvedValue(item());
    plans.findOne.mockResolvedValue({
      studentId: 'student-id',
      examDate,
    } as StudentStudyPlan);

    await expect(
      service.updatePlanItem('student-id', 'item-id', {
        scheduled_date: examDate,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists a valid date and status update', async () => {
    const current = item();
    const scheduledDate = dateFromToday(2);
    planItems.findOne.mockResolvedValue(current);
    plans.findOne.mockResolvedValue({
      studentId: 'student-id',
      examDate: dateFromToday(10),
    } as StudentStudyPlan);

    const result = await service.updatePlanItem('student-id', 'item-id', {
      scheduled_date: scheduledDate,
      status: StudyPlanItemStatus.COMPLETED,
    });

    expect(result.scheduledDate).toBe(scheduledDate);
    expect(result.status).toBe(StudyPlanItemStatus.COMPLETED);
    expect(result.completedAt).toBeInstanceOf(Date);
    expect(planItems.save).toHaveBeenCalledWith(current);
  });
});
