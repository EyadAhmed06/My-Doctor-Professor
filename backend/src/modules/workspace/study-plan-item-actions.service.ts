import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StudentStudyPlan } from '../../common/entities/student-study-plan.entity';
import { StudyPlanItem, StudyPlanItemStatus, StudyPlanItemType } from '../../common/entities/study-plan-item.entity';
import { UpdateStudyPlanItemDto } from './dtos/workspace.dto';

type PlanPreferences = {
  available_days?: number[];
  rest_day?: number;
  questions_minutes?: number;
  flashcards_minutes?: number;
};

type ScheduleBuild = {
  plan: StudentStudyPlan;
  today: string;
  lastDate: Date;
  generated: Partial<StudyPlanItem>[];
  locked: StudyPlanItem[];
};

@Injectable()
export class StudyPlanItemActionsService {
  constructor(
    @InjectRepository(StudentStudyPlan) private readonly plans: Repository<StudentStudyPlan>,
    @InjectRepository(StudyPlanItem) private readonly planItems: Repository<StudyPlanItem>,
    private readonly dataSource: DataSource,
  ) {}

  async preview(studentId: string) {
    const build = await this.buildSchedule(studentId);
    const replacingPlanned = await this.planItems.createQueryBuilder('item')
      .where('item.student_id=:studentId', { studentId })
      .andWhere('item.scheduled_date>=:today', { today: build.today })
      .andWhere('item.status=:status', { status: StudyPlanItemStatus.PLANNED })
      .andWhere("COALESCE((item.metadata->>'locked')::boolean,FALSE)=FALSE")
      .getCount();

    const totals = build.generated.reduce<Record<string, number>>((result, item) => {
      const key = String(item.itemType || 'UNKNOWN');
      result[key] = (result[key] || 0) + 1;
      return result;
    }, {});

    return {
      from: build.today,
      to: this.isoDate(build.lastDate),
      schedule_version: build.plan.scheduleVersion + 1,
      generated_count: build.generated.length,
      replacing_planned: replacingPlanned,
      preserved_locked: build.locked.length,
      totals,
      sample: build.generated.slice(0, 21),
    };
  }

  async generate(studentId: string) {
    const build = await this.buildSchedule(studentId);

    await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${studentId}:study-plan`]);
      await manager.getRepository(StudyPlanItem).createQueryBuilder()
        .delete()
        .where('student_id=:studentId AND scheduled_date>=:today AND status=:status', {
          studentId,
          today: build.today,
          status: StudyPlanItemStatus.PLANNED,
        })
        .andWhere("COALESCE((metadata->>'locked')::boolean,FALSE)=FALSE")
        .execute();

      if (build.generated.length) {
        const repository = manager.getRepository(StudyPlanItem);
        await repository.save(build.generated.map((item) => repository.create(item)));
      }

      await manager.getRepository(StudentStudyPlan).update(
        { studentId },
        { generatedAt: new Date(), scheduleVersion: build.plan.scheduleVersion + 1 },
      );
    });

    return this.getCalendar(studentId, build.today, this.isoDate(build.lastDate));
  }

  async update(studentId: string, id: string, dto: UpdateStudyPlanItemDto) {
    if (
      dto.status === undefined &&
      dto.scheduled_date === undefined &&
      dto.duration_minutes === undefined &&
      dto.is_locked === undefined
    ) {
      throw new BadRequestException('Provide a status, scheduled date, duration, or lock state');
    }

    const item = await this.planItems.findOne({ where: { id, studentId } });
    if (!item) throw new NotFoundException('Study plan item not found');

    if (dto.scheduled_date !== undefined) {
      if (item.status === StudyPlanItemStatus.COMPLETED) throw new ConflictException('Completed study sessions cannot be rescheduled');
      const today = this.isoDate(new Date());
      if (dto.scheduled_date < today) throw new BadRequestException('Study sessions cannot be moved into the past');
      const plan = await this.requirePlan(studentId);
      if (plan.examDate && dto.scheduled_date >= plan.examDate) throw new BadRequestException('Study sessions must be scheduled before the exam date');
      item.scheduledDate = dto.scheduled_date;
    }

    if (dto.duration_minutes !== undefined) {
      if (item.status === StudyPlanItemStatus.COMPLETED) throw new ConflictException('Completed study sessions cannot be resized');
      item.durationMinutes = dto.duration_minutes;
    }

    if (dto.is_locked !== undefined) {
      item.metadata = { ...(item.metadata || {}), locked: dto.is_locked };
    }

    if (dto.status !== undefined) {
      item.status = dto.status as StudyPlanItemStatus;
      item.completedAt = item.status === StudyPlanItemStatus.COMPLETED ? new Date() : null;
    }

    return this.planItems.save(item);
  }

  private async buildSchedule(studentId: string): Promise<ScheduleBuild> {
    const plan = await this.requirePlan(studentId);
    if (!plan.examDate) throw new BadRequestException('Set an exam date before generating a schedule');

    const today = this.isoDate(new Date());
    const examDate = new Date(`${plan.examDate}T00:00:00Z`);
    const lastDate = new Date(Math.min(examDate.getTime() - 86_400_000, Date.now() + 179 * 86_400_000));
    if (lastDate < new Date(`${today}T00:00:00Z`)) throw new BadRequestException('Exam date must leave at least one study day');

    const preferences = plan.preferences as PlanPreferences;
    const availableDays = preferences.available_days?.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) ?? [1, 2, 3, 4, 5, 6];
    const restDay = preferences.rest_day ?? 0;
    const lectures = await this.dataSource.query<{ id: string; title: string }[]>(`
      SELECT DISTINCT lecture.id,lecture.title FROM bundle_enrollments enrollment
      JOIN bundles bundle ON bundle.id=enrollment.bundle_id AND bundle.status='PUBLISHED'
      LEFT JOIN bundle_courses bc ON bc.bundle_id=bundle.id LEFT JOIN bundle_weeks bw ON bw.bundle_id=bundle.id
      JOIN weeks week ON week.course_id=bc.course_id OR week.id=bw.week_id
      JOIN lectures lecture ON lecture.week_id=week.id AND lecture.is_published=TRUE
      WHERE enrollment.student_id=$1 AND enrollment.status='ACTIVE' AND (enrollment.expires_at IS NULL OR enrollment.expires_at>CURRENT_TIMESTAMP)
      ORDER BY lecture.title
    `, [studentId]);

    const locked = await this.planItems.createQueryBuilder('item')
      .where('item.student_id=:studentId', { studentId })
      .andWhere('item.scheduled_date>=:today', { today })
      .andWhere('item.status=:status', { status: StudyPlanItemStatus.PLANNED })
      .andWhere("COALESCE((item.metadata->>'locked')::boolean,FALSE)=TRUE")
      .getMany();
    const lockedKeys = new Set(locked.map((item) => `${item.scheduledDate}:${item.itemType}`));

    const generated: Partial<StudyPlanItem>[] = [];
    let cursor = new Date(`${today}T00:00:00Z`);
    let lectureIndex = 0;
    const add = (item: Partial<StudyPlanItem>) => {
      if (!lockedKeys.has(`${item.scheduledDate}:${item.itemType}`)) generated.push(item);
    };

    while (cursor <= lastDate) {
      const day = cursor.getUTCDay();
      const scheduledDate = this.isoDate(cursor);
      if (day === restDay || !availableDays.includes(day)) {
        add({ studentId, scheduledDate, itemType: StudyPlanItemType.REST, status: StudyPlanItemStatus.PLANNED, durationMinutes: 15, targetCount: null, lectureId: null, metadata: { reason: 'Protected recovery day' } });
      } else {
        add({ studentId, scheduledDate, itemType: StudyPlanItemType.QUESTIONS, status: StudyPlanItemStatus.PLANNED, durationMinutes: preferences.questions_minutes ?? Math.max(30, Math.ceil(plan.dailyQuestionTarget * 1.5)), targetCount: plan.dailyQuestionTarget, lectureId: null, metadata: { source: 'bundle_question_bank', rationale: 'Daily question target from your saved plan settings' } });
        add({ studentId, scheduledDate, itemType: StudyPlanItemType.FLASHCARDS, status: StudyPlanItemStatus.PLANNED, durationMinutes: preferences.flashcards_minutes ?? Math.max(15, Math.ceil(plan.dailyFlashcardTarget * 0.5)), targetCount: plan.dailyFlashcardTarget, lectureId: null, metadata: { source: 'spaced_repetition', rationale: 'Daily retention target from your saved plan settings' } });
        if (lectures.length) {
          const lecture = lectures[lectureIndex++ % lectures.length];
          add({ studentId, scheduledDate, itemType: StudyPlanItemType.LECTURE, status: StudyPlanItemStatus.PLANNED, durationMinutes: 60, targetCount: null, lectureId: lecture.id, metadata: { title: lecture.title, rationale: 'Next published lecture from an active bundle' } });
        }
      }
      cursor = new Date(cursor.getTime() + 86_400_000);
    }

    return { plan, today, lastDate, generated, locked };
  }

  private async requirePlan(studentId: string) {
    const plan = await this.plans.findOne({ where: { studentId } });
    if (!plan) throw new NotFoundException('Student study plan has not been initialized');
    return plan;
  }

  private async getCalendar(studentId: string, from: string, to: string) {
    const data = await this.planItems.createQueryBuilder('item')
      .leftJoinAndSelect('item.lecture', 'lecture')
      .where('item.student_id=:studentId', { studentId })
      .andWhere('item.scheduled_date BETWEEN :from AND :to', { from, to })
      .orderBy('item.scheduled_date', 'ASC')
      .addOrderBy('item.created_at', 'ASC')
      .getMany();
    return { from, to, data };
  }

  private isoDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}