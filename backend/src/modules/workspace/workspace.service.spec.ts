import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { StudentStudyPlan } from '../../common/entities/student-study-plan.entity';
import {
  StudyPlanItem,
  StudyPlanItemStatus,
  StudyPlanItemType,
} from '../../common/entities/study-plan-item.entity';
import { StudyPlanItemActionsService } from './study-plan-item-actions.service';

const dateFromToday = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

describe('StudyPlanItemActionsService monthly plan item updates', () => {
  let service: StudyPlanItemActionsService;
  let planItems: jest.Mocked<
    Pick<Repository<StudyPlanItem>, 'findOne' | 'save'>
  >;

  beforeEach(() => {
    planItems = {
      findOne: jest.fn(),
      save: jest.fn(async (item) => item),
    };
    service = new StudyPlanItemActionsService(
      {} as Repository<StudentStudyPlan>,
      planItems as unknown as Repository<StudyPlanItem>,
      { query: jest.fn() } as unknown as DataSource,
    );
  });

  const item = (status = StudyPlanItemStatus.PLANNED) =>
    ({
      id: 'item-id',
      studentId: 'student-id',
      scheduledDate: dateFromToday(1),
      itemType: StudyPlanItemType.QUESTIONS,
      lectureId: null,
      status,
      durationMinutes: 30,
      targetCount: 20,
      completedAt: null,
      metadata: {},
    }) as StudyPlanItem;

  it('requires at least one mutable field', async () => {
    await expect(
      service.update('student-id', 'item-id', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not update an item owned by another student', async () => {
    planItems.findOne.mockResolvedValue(null);
    await expect(
      service.update('student-id', 'missing-id', {
        status: StudyPlanItemStatus.COMPLETED,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('prevents rescheduling completed sessions', async () => {
    planItems.findOne.mockResolvedValue(item(StudyPlanItemStatus.COMPLETED));
    await expect(
      service.update('student-id', 'item-id', {
        scheduled_date: dateFromToday(2),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('prevents moving sessions into the past', async () => {
    planItems.findOne.mockResolvedValue(item());
    await expect(
      service.update('student-id', 'item-id', {
        scheduled_date: dateFromToday(-1),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps rescheduled sessions inside the current 30-day plan', async () => {
    planItems.findOne.mockResolvedValue(item());
    await expect(
      service.update('student-id', 'item-id', {
        scheduled_date: dateFromToday(30),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists a valid date and status update', async () => {
    const current = item();
    const scheduledDate = dateFromToday(2);
    planItems.findOne.mockResolvedValue(current);

    const result = await service.update('student-id', 'item-id', {
      scheduled_date: scheduledDate,
      status: StudyPlanItemStatus.COMPLETED,
    });

    expect(result.scheduledDate).toBe(scheduledDate);
    expect(result.status).toBe(StudyPlanItemStatus.COMPLETED);
    expect(result.completedAt).toBeInstanceOf(Date);
    expect(planItems.save).toHaveBeenCalledWith(current);
  });
});
