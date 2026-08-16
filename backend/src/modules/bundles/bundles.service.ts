import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, In, Repository } from 'typeorm';
import { BundleCourse } from '../../common/entities/bundle-course.entity';
import {
  BundleEnrollment,
  BundleEnrollmentSource,
  BundleEnrollmentStatus,
  BundlePaymentStatus,
} from '../../common/entities/bundle-enrollment.entity';
import { BundleInstructor } from '../../common/entities/bundle-instructor.entity';
import { BundlePlanGrant, BundlePlanTier } from '../../common/entities/bundle-plan-grant.entity';
import { BundlePlan, BundlePlanWeek } from '../../common/entities/bundle-plan-week.entity';
import { BundleTest } from '../../common/entities/bundle-test.entity';
import { BundleWeek } from '../../common/entities/bundle-week.entity';
import { Bundle, BundleAccessMode, BundleStatus } from '../../common/entities/bundle.entity';
import { Course } from '../../common/entities/course.entity';
import { Test } from '../../common/entities/test.entity';
import { Week } from '../../common/entities/week.entity';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import {
  ConfirmBundlePaymentDto,
  CreateBundleDto,
  EnrollPlanDto,
  GrantBundleDto,
  GrantPlanDto,
  SetPlanWeeksDto,
  UpdateBundleDto,
  UpdateBundlePlansDto,
} from './dtos/bundle.dto';

@Injectable()
export class BundlesService {
  constructor(
    @InjectRepository(Bundle) private readonly bundles: Repository<Bundle>,
    @InjectRepository(BundleCourse) private readonly bundleCourses: Repository<BundleCourse>,
    @InjectRepository(BundleWeek) private readonly bundleWeeks: Repository<BundleWeek>,
    @InjectRepository(BundleTest) private readonly bundleTests: Repository<BundleTest>,
    @InjectRepository(BundleInstructor) private readonly bundleInstructors: Repository<BundleInstructor>,
    @InjectRepository(BundleEnrollment) private readonly enrollments: Repository<BundleEnrollment>,
    @InjectRepository(BundlePlanWeek) private readonly bundlePlanWeeks: Repository<BundlePlanWeek>,
    @InjectRepository(BundlePlanGrant) private readonly planGrants: Repository<BundlePlanGrant>,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(Week) private readonly weeks: Repository<Week>,
    @InjectRepository(Test) private readonly tests: Repository<Test>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  catalog(academicYear?: number) {
    const builder = this.bundles.createQueryBuilder('bundle')
      .where('bundle.status = :status', { status: BundleStatus.PUBLISHED })
      .andWhere('bundle.access_mode = :mode', { mode: BundleAccessMode.PUBLIC })
      .orderBy('bundle.academic_year', 'ASC')
      .addOrderBy('bundle.title', 'ASC');
    if (academicYear) builder.andWhere('bundle.academic_year = :academicYear', { academicYear });
    return builder.getMany();
  }

  async create(actor: AuthenticatedUser, dto: CreateBundleDto) {
    this.validateWindow(dto.available_from, dto.available_until);
    const slug = this.slug(dto.slug);
    const isFree = dto.is_free ?? true;
    const pricing = this.resolvePricing(isFree, dto.price_amount, dto.price_currency);
    const codeHash = dto.enrollment_code ? await bcrypt.hash(dto.enrollment_code, 10) : null;
    try {
      return await this.dataSource.transaction(async (manager) => {
        const bundle = await manager.save(Bundle, manager.create(Bundle, {
          title: dto.title.trim(),
          slug,
          description: dto.description?.trim() || null,
          academicYear: dto.academic_year,
          status: BundleStatus.DRAFT,
          accessMode: dto.access_mode ?? BundleAccessMode.PUBLIC,
          isFree,
          priceAmount: pricing.priceAmount,
          priceCurrency: pricing.priceCurrency,
          enrollmentCodeHash: codeHash,
          availableFrom: dto.available_from ? new Date(dto.available_from) : null,
          availableUntil: dto.available_until ? new Date(dto.available_until) : null,
          createdBy: actor.userId,
        }));
        if (actor.role === UserRole.INSTRUCTOR) {
          await manager.save(BundleInstructor, manager.create(BundleInstructor, {
            bundleId: bundle.id,
            instructorId: actor.userId,
          }));
        }
        return bundle;
      });
    } catch (error) {
      if (this.isUnique(error)) throw new ConflictException('Bundle slug already exists');
      throw error;
    }
  }

  async managed(actor: AuthenticatedUser) {
    if (actor.role === UserRole.SYSTEM_ADMIN) {
      return this.bundles.find({ order: { createdAt: 'DESC' } });
    }
    const assignments = await this.bundleInstructors.find({ where: { instructorId: actor.userId } });
    if (!assignments.length) return [];
    return this.bundles.createQueryBuilder('bundle')
      .where('bundle.id IN (:...ids)', { ids: assignments.map((item) => item.bundleId) })
      .orderBy('bundle.created_at', 'DESC')
      .getMany();
  }

  async mine(studentId: string) {
    const [enrollmentRows, planRows] = await Promise.all([
      this.enrollments.find({ where: { studentId }, relations: { bundle: true }, order: { createdAt: 'DESC' } }),
      this.planGrants.find({ where: { studentId }, relations: { bundle: true }, order: { createdAt: 'DESC' } }),
    ]);
    const visibleEnrollments = enrollmentRows.filter((row) => row.status !== BundleEnrollmentStatus.REVOKED || row.paymentStatus === BundlePaymentStatus.PENDING);
    const enrolledBundleIds = new Set(visibleEnrollments.map((row) => row.bundleId));
    const planOnlyBundles = new Map<string, Bundle>();
    for (const row of planRows) {
      if (enrolledBundleIds.has(row.bundleId)) continue;
      if (row.status === BundleEnrollmentStatus.REVOKED && row.paymentStatus !== BundlePaymentStatus.PENDING) continue;
      planOnlyBundles.set(row.bundleId, row.bundle);
    }
    const fromEnrollments = visibleEnrollments.map((row) => this.enrollmentView(row));
    const fromPlansOnly = await Promise.all([...planOnlyBundles.values()].map(async (bundle) => {
      const planAccess = await this.resolvePlanAccess(bundle.id, studentId);
      return {
        ...bundle,
        accessible: Boolean(planAccess),
        read_only: false,
        payment_required: !planAccess,
        access_status: planAccess ? 'PARTIAL' : 'PENDING_PAYMENT',
        partial_access: Boolean(planAccess),
        visible_week_ids: planAccess ? [...planAccess.visibleWeekIds] : [],
        essay_week_ids: planAccess ? [...planAccess.essayWeekIds] : [],
      };
    }));
    return [...fromEnrollments, ...fromPlansOnly];
  }

  async getAccessible(id: string, actor: AuthenticatedUser) {
    const bundle = await this.requireBundle(id);
    if (actor.role !== UserRole.STUDENT) {
      await this.assertManager(id, actor);
      return { ...bundle, read_only: false, accessible: true, payment_required: false, partial_access: false, visible_week_ids: null as string[] | null, essay_week_ids: null as string[] | null };
    }
    if (bundle.status === BundleStatus.DRAFT) throw new ForbiddenException('This bundle is not published');

    const enrollment = await this.enrollments.findOne({ where: { bundleId: id, studentId: actor.userId } });
    const fullGranted = Boolean(enrollment)
      && enrollment!.status !== BundleEnrollmentStatus.REVOKED
      && (bundle.isFree || enrollment!.paymentStatus === BundlePaymentStatus.PAID);

    if (!fullGranted) {
      const planAccess = await this.resolvePlanAccess(id, actor.userId);
      if (planAccess) {
        if (bundle.availableFrom && bundle.availableFrom > new Date()) {
          throw new ForbiddenException('Bundle access has not started yet');
        }
        return {
          ...bundle,
          accessible: true,
          read_only: false,
          payment_required: false,
          access_status: 'PARTIAL',
          partial_access: true,
          visible_week_ids: [...planAccess.visibleWeekIds],
          essay_week_ids: [...planAccess.essayWeekIds],
        };
      }
    }

    const confirmedEnrollment = await this.requireEnrollment(id, actor.userId);
    if (!bundle.isFree && confirmedEnrollment.paymentStatus !== BundlePaymentStatus.PAID) {
      throw new ForbiddenException('Payment is required before this bundle becomes accessible');
    }
    if (bundle.availableFrom && bundle.availableFrom > new Date()) {
      throw new ForbiddenException('Bundle access has not started yet');
    }
    return { ...bundle, ...this.accessState(confirmedEnrollment, bundle), partial_access: false, visible_week_ids: null as string[] | null, essay_week_ids: null as string[] | null };
  }

  async getContent(id: string, actor: AuthenticatedUser) {
    const access = await this.getAccessible(id, actor);
    const visibleWeekIds = access.visible_week_ids ? new Set(access.visible_week_ids) : null;
    const essayWeekIds = access.essay_week_ids ? new Set(access.essay_week_ids) : null;
    const [courseLinks, weekLinksAll, testLinks, lectureStats] = await Promise.all([
      this.bundleCourses.find({
        where: { bundleId: id },
        relations: { course: { semester: true } },
        order: { course: { displayOrder: 'ASC' } },
      }),
      this.bundleWeeks.find({
        where: { bundleId: id },
        relations: { week: { lectures: true } },
        order: { week: { displayOrder: 'ASC' } },
      }),
      this.bundleTests.find({
        where: { bundleId: id },
        relations: { test: true },
        order: { test: { createdAt: 'DESC' } },
      }),
      this.dataSource.query(`
        SELECT lecture.id,
          COUNT(DISTINCT question.id)::int AS question_count,
          COUNT(DISTINCT question.id) FILTER (
            WHERE question.question_type = 'MCQ' AND question.is_question_bank = TRUE
          )::int AS mcq_count,
          COUNT(DISTINCT deck.id)::int AS flashcard_deck_count,
          COUNT(DISTINCT resource.id)::int AS resource_count
        FROM bundle_weeks bundle_week
        JOIN weeks week ON week.id = bundle_week.week_id
        JOIN lectures lecture ON lecture.week_id = week.id
        LEFT JOIN topics topic ON topic.lecture_id = lecture.id
        LEFT JOIN questions question ON question.topic_id = topic.id AND question.is_active = TRUE
        LEFT JOIN flashcard_decks deck ON deck.lecture_id = lecture.id AND deck.is_published = TRUE
        LEFT JOIN resources resource ON resource.lecture_id = lecture.id
        WHERE bundle_week.bundle_id = $1
        GROUP BY lecture.id`, [id]),
    ]);
    const weekLinks = visibleWeekIds ? weekLinksAll.filter((item) => visibleWeekIds.has(item.weekId)) : weekLinksAll;
    const stats = new Map((lectureStats as Array<{
      id: string;
      question_count: number;
      mcq_count: number;
      flashcard_deck_count: number;
      resource_count: number;
    }>).map((row) => [row.id, row]));
    const courses = courseLinks.map((link) => ({
      ...link.course,
      weeks: weekLinks
        .filter((item) => item.week.courseId === link.courseId)
        .map((item) => {
          const essayVisible = !essayWeekIds || essayWeekIds.has(item.weekId);
          return {
            ...item.week,
            lectures: item.week.lectures
              .filter((lecture) => actor.role !== UserRole.STUDENT || lecture.isPublished)
              .map((lecture) => {
                const raw = stats.get(lecture.id) ?? {
                  question_count: 0,
                  mcq_count: 0,
                  flashcard_deck_count: 0,
                  resource_count: 0,
                };
                return {
                  ...lecture,
                  ...raw,
                  question_count: essayVisible ? raw.question_count : raw.mcq_count,
                };
              }),
          };
        }),
    }));
    const visibleLectures = courses.flatMap((course) => course.weeks).flatMap((week) => week.lectures);
    return {
      bundle: access,
      courses,
      past_exams: testLinks.map((link) => link.test),
      selected_week_count: weekLinks.length,
      totals: {
        courses: courses.length,
        weeks: weekLinks.length,
        lectures: visibleLectures.length,
        questions: visibleLectures.reduce((sum, lecture) => sum + Number(lecture.question_count), 0),
        flashcard_decks: visibleLectures.reduce((sum, lecture) => sum + Number(lecture.flashcard_deck_count), 0),
        resources: visibleLectures.reduce((sum, lecture) => sum + Number(lecture.resource_count), 0),
        past_exams: testLinks.length,
      },
    };
  }

  async management(id: string, actor: AuthenticatedUser) {
    await this.assertManager(id, actor);
    const bundle = await this.requireBundle(id);
    const [courseLinks, weekLinks, testLinks, instructorLinks, enrollmentRows, planWeekLinks, planGrantRows] = await Promise.all([
      this.bundleCourses.find({ where: { bundleId: id }, relations: { course: { weeks: true } } }),
      this.bundleWeeks.find({ where: { bundleId: id } }),
      this.bundleTests.find({ where: { bundleId: id }, relations: { test: true } }),
      this.bundleInstructors.find({ where: { bundleId: id }, relations: { instructor: true } }),
      this.enrollments.find({ where: { bundleId: id }, relations: { student: true }, order: { createdAt: 'DESC' } }),
      this.bundlePlanWeeks.find({ where: { bundleId: id } }),
      this.planGrants.find({ where: { bundleId: id }, relations: { student: true }, order: { createdAt: 'DESC' } }),
    ]);
    const firstPlanWeekIds = new Set(planWeekLinks.filter((row) => row.plan === BundlePlan.FIRST).map((row) => row.weekId));
    const finalPlanWeekIds = new Set(planWeekLinks.filter((row) => row.plan === BundlePlan.FINAL).map((row) => row.weekId));

    const linkedCourseIds = new Set(courseLinks.map((link) => link.courseId));
    const linkedWeekIds = new Set(weekLinks.map((link) => link.weekId));
    const linkedTestIds = new Set(testLinks.map((link) => link.testId));
    const linkedInstructorIds = new Set(instructorLinks.map((link) => link.instructorId));

    const candidateCourseBuilder = this.courses.createQueryBuilder('course')
      .leftJoinAndSelect('course.weeks', 'week')
      .where('course.is_active = TRUE');
    if (actor.role === UserRole.INSTRUCTOR) {
      candidateCourseBuilder.andWhere(`(
        course.id IN (
          SELECT assignment.course_id FROM course_instructors assignment
          WHERE assignment.instructor_id = :instructorId
        ) OR course.id IN (:...linkedCourseIds)
      )`, {
        instructorId: actor.userId,
        linkedCourseIds: linkedCourseIds.size ? [...linkedCourseIds] : ['00000000-0000-4000-8000-000000000000'],
      });
    }
    const candidateCourses = await candidateCourseBuilder
      .orderBy('course.display_order', 'ASC')
      .addOrderBy('week.display_order', 'ASC')
      .getMany();

    const candidateTestBuilder = this.tests.createQueryBuilder('test')
      .where('test.is_published = TRUE');
    if (actor.role === UserRole.INSTRUCTOR) {
      candidateTestBuilder.andWhere('(test.created_by = :actorId OR test.id IN (:...linkedTestIds))', {
        actorId: actor.userId,
        linkedTestIds: linkedTestIds.size ? [...linkedTestIds] : ['00000000-0000-4000-8000-000000000000'],
      });
    }
    const candidateTests = await candidateTestBuilder.orderBy('test.created_at', 'DESC').getMany();

    const [instructors, students] = await Promise.all([
      this.users.find({
        where: { role: UserRole.INSTRUCTOR, status: UserStatus.ACTIVE },
        order: { fullName: 'ASC' },
      }),
      this.users.find({
        where: { role: UserRole.STUDENT, status: UserStatus.ACTIVE },
        order: { fullName: 'ASC' },
      }),
    ]);

    const activeEnrollmentStudentIds = new Set(enrollmentRows
      .filter((row) => row.status !== BundleEnrollmentStatus.REVOKED || row.paymentStatus === BundlePaymentStatus.PENDING)
      .map((row) => row.studentId));

    return {
      bundle,
      courses: candidateCourses.map((course) => ({
        id: course.id,
        courseCode: course.courseCode,
        courseName: course.courseName,
        linked: linkedCourseIds.has(course.id),
        weeks: [...(course.weeks ?? [])]
          .sort((left, right) => left.displayOrder - right.displayOrder)
          .map((week) => ({
            id: week.id,
            weekNumber: week.weekNumber,
            title: week.title,
            linked: linkedWeekIds.has(week.id),
            inFirstPlan: firstPlanWeekIds.has(week.id),
            inFinalPlan: finalPlanWeekIds.has(week.id),
          })),
      })),
      tests: candidateTests.map((test) => ({
        id: test.id,
        title: test.title,
        testType: test.testType,
        courseId: test.courseId,
        linked: linkedTestIds.has(test.id),
      })),
      instructors: {
        assigned: instructorLinks.map((link) => this.userView(link.instructor)),
        available: instructors.filter((item) => !linkedInstructorIds.has(item.id)).map((item) => this.userView(item)),
      },
      plans: {
        first: {
          enabled: bundle.firstPlanEnabled,
          price_mcq: bundle.firstPlanPriceMcq === null ? null : Number(bundle.firstPlanPriceMcq),
          price_mcq_essay: bundle.firstPlanPriceMcqEssay === null ? null : Number(bundle.firstPlanPriceMcqEssay),
          week_ids: [...firstPlanWeekIds],
        },
        final: {
          enabled: bundle.finalPlanEnabled,
          price_mcq: bundle.finalPlanPriceMcq === null ? null : Number(bundle.finalPlanPriceMcq),
          price_mcq_essay: bundle.finalPlanPriceMcqEssay === null ? null : Number(bundle.finalPlanPriceMcqEssay),
          week_ids: [...finalPlanWeekIds],
        },
      },
      students: {
        enrollments: enrollmentRows.map((row) => ({
          id: row.id,
          student: this.userView(row.student),
          status: row.status,
          paymentStatus: row.paymentStatus,
          paidAt: row.paidAt,
          paymentReference: row.paymentReference,
          ...this.accessState(row, bundle),
        })),
        planGrants: planGrantRows.map((row) => ({
          id: row.id,
          student: this.userView(row.student),
          plan: row.plan,
          tier: row.tier,
          status: row.status,
          paymentStatus: row.paymentStatus,
          paidAt: row.paidAt,
          paymentReference: row.paymentReference,
        })),
        available: students.filter((item) => !activeEnrollmentStudentIds.has(item.id)).map((item) => this.userView(item)),
      },
    };
  }

  async update(id: string, actor: AuthenticatedUser, dto: UpdateBundleDto) {
    await this.assertManager(id, actor);
    const bundle = await this.requireBundleWithSecret(id);
    this.validateWindow(
      dto.available_from ?? bundle.availableFrom?.toISOString(),
      dto.available_until ?? bundle.availableUntil?.toISOString(),
    );
    const nextIsFree = dto.is_free ?? bundle.isFree;
    const priceInput = dto.price_amount !== undefined
      ? dto.price_amount ?? undefined
      : bundle.priceAmount === null ? undefined : Number(bundle.priceAmount);
    const pricing = this.resolvePricing(nextIsFree, priceInput, dto.price_currency ?? bundle.priceCurrency);
    const policyChanged = nextIsFree !== bundle.isFree;
    if (dto.title !== undefined) bundle.title = dto.title.trim();
    if (dto.description !== undefined) bundle.description = dto.description.trim() || null;
    if (dto.access_mode !== undefined) bundle.accessMode = dto.access_mode;
    bundle.isFree = nextIsFree;
    bundle.priceAmount = pricing.priceAmount;
    bundle.priceCurrency = pricing.priceCurrency;
    if (dto.available_from !== undefined) bundle.availableFrom = dto.available_from ? new Date(dto.available_from) : null;
    if (dto.available_until !== undefined) bundle.availableUntil = dto.available_until ? new Date(dto.available_until) : null;
    if (dto.enrollment_code !== undefined) bundle.enrollmentCodeHash = await bcrypt.hash(dto.enrollment_code, 10);
    const saved = await this.bundles.save(bundle);
    if (policyChanged) await this.synchronizeEnrollmentPolicy(saved);
    return saved;
  }

  async changeStatus(id: string, actor: AuthenticatedUser, status: BundleStatus) {
    await this.assertManager(id, actor);
    const bundle = await this.requireBundle(id);
    if (status === BundleStatus.PUBLISHED) {
      const count = await this.bundleCourses.count({ where: { bundleId: id } });
      if (count === 0) throw new ConflictException('A bundle needs at least one course before publishing');
      if (!bundle.isFree && (!bundle.priceAmount || Number(bundle.priceAmount) <= 0)) {
        throw new ConflictException('Paid bundles require a valid price before publishing');
      }
    }
    bundle.status = status;
    return this.bundles.save(bundle);
  }

  async addCourse(id: string, actor: AuthenticatedUser, courseId: string) {
    await this.assertManager(id, actor);
    await this.assertCourseAttachable(courseId, actor);
    return this.saveLink(
      () => this.bundleCourses.save(this.bundleCourses.create({ bundleId: id, courseId })),
      'Course already belongs to this bundle',
    );
  }

  async removeCourse(id: string, actor: AuthenticatedUser, courseId: string) {
    await this.assertManager(id, actor);
    await this.dataSource.transaction(async (manager) => {
      const weeks = await manager.find(Week, { where: { courseId }, select: { id: true } });
      if (weeks.length) {
        await manager.delete(BundleWeek, { bundleId: id, weekId: In(weeks.map((item) => item.id)) });
      }
      await manager.delete(BundleCourse, { bundleId: id, courseId });
    });
  }

  async addWeek(id: string, actor: AuthenticatedUser, weekId: string) {
    await this.assertManager(id, actor);
    const week = await this.weeks.findOne({ where: { id: weekId } });
    if (!week) throw new NotFoundException('Week not found');
    await this.assertCourseAttachable(week.courseId, actor);
    if (!await this.bundleCourses.exists({ where: { bundleId: id, courseId: week.courseId } })) {
      throw new BadRequestException('Add the parent course to the bundle first');
    }
    return this.saveLink(
      () => this.bundleWeeks.save(this.bundleWeeks.create({ bundleId: id, weekId })),
      'Week already belongs to this bundle',
    );
  }

  async removeWeek(id: string, actor: AuthenticatedUser, weekId: string) {
    await this.assertManager(id, actor);
    await this.bundleWeeks.delete({ bundleId: id, weekId });
  }

  async addTest(id: string, actor: AuthenticatedUser, testId: string) {
    await this.assertManager(id, actor);
    const test = await this.tests.findOne({ where: { id: testId } });
    if (!test) throw new NotFoundException('Test not found');
    if (!test.isPublished) throw new BadRequestException('Publish the assessment before adding it to a bundle');
    if (actor.role === UserRole.INSTRUCTOR && test.createdBy !== actor.userId) {
      throw new ForbiddenException('You can attach only assessments you created');
    }
    return this.saveLink(
      () => this.bundleTests.save(this.bundleTests.create({ bundleId: id, testId })),
      'Exam already belongs to this bundle',
    );
  }

  async removeTest(id: string, actor: AuthenticatedUser, testId: string) {
    await this.assertManager(id, actor);
    await this.bundleTests.delete({ bundleId: id, testId });
  }

  async assignInstructor(id: string, actor: AuthenticatedUser, instructorId: string) {
    await this.assertManager(id, actor);
    const user = await this.users.findOne({
      where: { id: instructorId, role: UserRole.INSTRUCTOR, status: UserStatus.ACTIVE },
    });
    if (!user) throw new NotFoundException('Active instructor not found');
    return this.saveLink(
      () => this.bundleInstructors.save(this.bundleInstructors.create({ bundleId: id, instructorId })),
      'Instructor already manages this bundle',
    );
  }

  async removeInstructor(id: string, actor: AuthenticatedUser, instructorId: string) {
    await this.assertManager(id, actor);
    const assignment = await this.bundleInstructors.findOne({ where: { bundleId: id, instructorId } });
    if (!assignment) throw new NotFoundException('Instructor is not assigned to this bundle');
    if (actor.role === UserRole.INSTRUCTOR && instructorId === actor.userId) {
      const managerCount = await this.bundleInstructors.count({ where: { bundleId: id } });
      if (managerCount <= 1) {
        throw new ConflictException('Assign another instructor before removing your own bundle access');
      }
    }
    await this.bundleInstructors.delete({ bundleId: id, instructorId });
  }

  async grant(id: string, actor: AuthenticatedUser, dto: GrantBundleDto) {
    await this.assertManager(id, actor);
    const [student, bundle] = await Promise.all([
      this.users.findOne({ where: { id: dto.student_id, role: UserRole.STUDENT, status: UserStatus.ACTIVE } }),
      this.requireBundle(id),
    ]);
    if (!student) throw new NotFoundException('Active student not found');
    return this.upsertEnrollment(
      bundle,
      dto.student_id,
      BundleEnrollmentSource.MANUAL,
      actor.userId,
      dto.expires_at ? new Date(dto.expires_at) : null,
      dto.payment_confirmed ?? false,
      dto.payment_reference,
    );
  }

  async confirmPayment(
    id: string,
    actor: AuthenticatedUser,
    studentId: string,
    dto: ConfirmBundlePaymentDto,
  ) {
    await this.assertManager(id, actor);
    const bundle = await this.requireBundle(id);
    if (bundle.isFree) throw new BadRequestException('Free bundles do not require payment confirmation');
    const enrollment = await this.enrollments.findOne({ where: { bundleId: id, studentId } });
    if (!enrollment) throw new NotFoundException('Bundle enrollment not found');
    if (enrollment.paymentStatus === BundlePaymentStatus.PAID && enrollment.status !== BundleEnrollmentStatus.REVOKED) {
      return enrollment;
    }
    if (enrollment.paymentStatus !== BundlePaymentStatus.PENDING) {
      throw new ConflictException('This enrollment is not awaiting payment');
    }
    enrollment.paymentStatus = BundlePaymentStatus.PAID;
    enrollment.paidAt = new Date();
    enrollment.paymentReference = dto.payment_reference?.trim() || null;
    enrollment.status = BundleEnrollmentStatus.ACTIVE;
    return this.enrollments.save(enrollment);
  }

  async revoke(id: string, actor: AuthenticatedUser, studentId: string) {
    await this.assertManager(id, actor);
    const enrollment = await this.enrollments.findOne({ where: { bundleId: id, studentId } });
    if (!enrollment) throw new NotFoundException('Bundle enrollment not found');
    enrollment.status = BundleEnrollmentStatus.REVOKED;
    if (enrollment.paymentStatus === BundlePaymentStatus.PENDING) {
      enrollment.paymentStatus = BundlePaymentStatus.CANCELLED;
    }
    await this.enrollments.save(enrollment);
  }

  async updatePlans(id: string, actor: AuthenticatedUser, dto: UpdateBundlePlansDto) {
    await this.assertManager(id, actor);
    const bundle = await this.requireBundle(id);
    const nextFirstEnabled = dto.first_plan_enabled ?? bundle.firstPlanEnabled;
    const nextFinalEnabled = dto.final_plan_enabled ?? bundle.finalPlanEnabled;
    const firstMcq = this.resolvePlanPriceInput(dto.first_plan_price_mcq, bundle.firstPlanPriceMcq);
    const firstEssay = this.resolvePlanPriceInput(dto.first_plan_price_mcq_essay, bundle.firstPlanPriceMcqEssay);
    const finalMcq = this.resolvePlanPriceInput(dto.final_plan_price_mcq, bundle.finalPlanPriceMcq);
    const finalEssay = this.resolvePlanPriceInput(dto.final_plan_price_mcq_essay, bundle.finalPlanPriceMcqEssay);

    if (nextFirstEnabled) {
      if (firstMcq === null || firstEssay === null) {
        throw new BadRequestException('The First plan needs both an MCQ price and an MCQ + Essay price before it can be enabled');
      }
      if (firstEssay <= firstMcq) {
        throw new BadRequestException('The First plan MCQ + Essay price must be higher than its MCQ-only price');
      }
    }
    if (nextFinalEnabled) {
      if (finalMcq === null || finalEssay === null) {
        throw new BadRequestException('The Final plan needs both an MCQ price and an MCQ + Essay price before it can be enabled');
      }
      if (finalEssay <= finalMcq) {
        throw new BadRequestException('The Final plan MCQ + Essay price must be higher than its MCQ-only price');
      }
    }

    bundle.firstPlanEnabled = nextFirstEnabled;
    bundle.firstPlanPriceMcq = firstMcq === null ? null : firstMcq.toFixed(2);
    bundle.firstPlanPriceMcqEssay = firstEssay === null ? null : firstEssay.toFixed(2);
    bundle.finalPlanEnabled = nextFinalEnabled;
    bundle.finalPlanPriceMcq = finalMcq === null ? null : finalMcq.toFixed(2);
    bundle.finalPlanPriceMcqEssay = finalEssay === null ? null : finalEssay.toFixed(2);
    return this.bundles.save(bundle);
  }

  async setPlanWeeks(id: string, plan: BundlePlan, actor: AuthenticatedUser, dto: SetPlanWeeksDto) {
    await this.assertManager(id, actor);
    await this.requireBundle(id);
    const linked = await this.bundleWeeks.find({ where: { bundleId: id } });
    const linkedIds = new Set(linked.map((item) => item.weekId));
    const uniqueWeekIds = [...new Set(dto.week_ids)];
    if (uniqueWeekIds.some((weekId) => !linkedIds.has(weekId))) {
      throw new BadRequestException('A plan can only include weeks already attached to this bundle');
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(BundlePlanWeek, { bundleId: id, plan });
      if (uniqueWeekIds.length) {
        await manager.save(BundlePlanWeek, uniqueWeekIds.map((weekId) => manager.create(BundlePlanWeek, { bundleId: id, plan, weekId })));
      }
    });
    return this.bundlePlanWeeks.find({ where: { bundleId: id, plan } });
  }

  async enrollPlan(id: string, plan: BundlePlan, studentId: string, dto: EnrollPlanDto) {
    const bundle = await this.requireBundle(id);
    if (bundle.status !== BundleStatus.PUBLISHED) throw new ForbiddenException('This bundle is not published');
    const enabled = plan === BundlePlan.FIRST ? bundle.firstPlanEnabled : bundle.finalPlanEnabled;
    if (!enabled) throw new ForbiddenException('This plan is not offered for this bundle');
    const tier = dto.tier ?? BundlePlanTier.MCQ;
    if (this.planPrice(bundle, plan, tier) === null) {
      throw new ConflictException('This plan tier does not have a price configured yet');
    }

    let item = await this.planGrants.findOne({ where: { bundleId: id, studentId, plan } });
    if (item && item.status !== BundleEnrollmentStatus.REVOKED && item.paymentStatus === BundlePaymentStatus.PAID && item.tier === tier) {
      return this.planGrantView(item, bundle);
    }
    if (!item) item = this.planGrants.create({ bundleId: id, studentId, plan });
    item.tier = tier;
    item.status = BundleEnrollmentStatus.REVOKED;
    item.paymentStatus = BundlePaymentStatus.PENDING;
    item.paidAt = null;
    item.paymentReference = null;
    item.expiresAt = bundle.availableUntil;
    const saved = await this.planGrants.save(item);
    return this.planGrantView(saved, bundle);
  }

  async grantPlan(id: string, plan: BundlePlan, actor: AuthenticatedUser, dto: GrantPlanDto) {
    await this.assertManager(id, actor);
    const [student, bundle] = await Promise.all([
      this.users.findOne({ where: { id: dto.student_id, role: UserRole.STUDENT, status: UserStatus.ACTIVE } }),
      this.requireBundle(id),
    ]);
    if (!student) throw new NotFoundException('Active student not found');
    let item = await this.planGrants.findOne({ where: { bundleId: id, studentId: dto.student_id, plan } });
    if (!item) item = this.planGrants.create({ bundleId: id, studentId: dto.student_id, plan });
    item.tier = dto.tier ?? item.tier ?? BundlePlanTier.MCQ;
    item.grantedBy = actor.userId;
    item.expiresAt = dto.expires_at ? new Date(dto.expires_at) : null;
    if (dto.payment_confirmed) {
      item.status = BundleEnrollmentStatus.ACTIVE;
      item.paymentStatus = BundlePaymentStatus.PAID;
      item.paidAt = item.paidAt ?? new Date();
      item.paymentReference = dto.payment_reference?.trim() || item.paymentReference || null;
    } else {
      item.status = BundleEnrollmentStatus.REVOKED;
      item.paymentStatus = BundlePaymentStatus.PENDING;
      item.paidAt = null;
      item.paymentReference = null;
    }
    const saved = await this.planGrants.save(item);
    return this.planGrantView(saved, bundle);
  }

  async confirmPlanPayment(id: string, plan: BundlePlan, actor: AuthenticatedUser, studentId: string, dto: ConfirmBundlePaymentDto) {
    await this.assertManager(id, actor);
    const item = await this.planGrants.findOne({ where: { bundleId: id, studentId, plan } });
    if (!item) throw new NotFoundException('Plan enrollment not found');
    if (item.paymentStatus === BundlePaymentStatus.PAID && item.status !== BundleEnrollmentStatus.REVOKED) return item;
    if (item.paymentStatus !== BundlePaymentStatus.PENDING) throw new ConflictException('This plan enrollment is not awaiting payment');
    item.paymentStatus = BundlePaymentStatus.PAID;
    item.paidAt = new Date();
    item.paymentReference = dto.payment_reference?.trim() || null;
    item.status = BundleEnrollmentStatus.ACTIVE;
    return this.planGrants.save(item);
  }

  async revokePlanGrant(id: string, plan: BundlePlan, actor: AuthenticatedUser, studentId: string) {
    await this.assertManager(id, actor);
    const item = await this.planGrants.findOne({ where: { bundleId: id, studentId, plan } });
    if (!item) throw new NotFoundException('Plan enrollment not found');
    item.status = BundleEnrollmentStatus.REVOKED;
    if (item.paymentStatus === BundlePaymentStatus.PENDING) item.paymentStatus = BundlePaymentStatus.CANCELLED;
    await this.planGrants.save(item);
  }

  async enrollByCode(studentId: string, code: string) {
    const candidates = await this.bundles.createQueryBuilder('bundle')
      .addSelect('bundle.enrollment_code_hash')
      .where('bundle.status = :status', { status: BundleStatus.PUBLISHED })
      .andWhere('bundle.access_mode = :mode', { mode: BundleAccessMode.CODE })
      .getMany();
    for (const bundle of candidates) {
      if (bundle.enrollmentCodeHash && await bcrypt.compare(code, bundle.enrollmentCodeHash)) {
        return this.upsertEnrollment(
          bundle,
          studentId,
          BundleEnrollmentSource.CODE,
          null,
          bundle.availableUntil,
          false,
        );
      }
    }
    throw new NotFoundException('Enrollment code is invalid or inactive');
  }

  async enrollPublic(id: string, studentId: string) {
    const bundle = await this.requireBundle(id);
    if (bundle.status !== BundleStatus.PUBLISHED || bundle.accessMode !== BundleAccessMode.PUBLIC) {
      throw new ForbiddenException('This bundle is not open for public enrollment');
    }
    return this.upsertEnrollment(
      bundle,
      studentId,
      BundleEnrollmentSource.PUBLIC,
      null,
      bundle.availableUntil,
      false,
    );
  }

  private async upsertEnrollment(
    bundle: Bundle,
    studentId: string,
    source: BundleEnrollmentSource,
    grantedBy: string | null,
    expiresAt: Date | null,
    paymentConfirmed: boolean,
    paymentReference?: string,
  ) {
    let item = await this.enrollments.findOne({ where: { bundleId: bundle.id, studentId } });
    if (!item) {
      item = this.enrollments.create({
        bundleId: bundle.id,
        studentId,
        source,
        grantedBy,
        expiresAt,
        status: BundleEnrollmentStatus.ACTIVE,
        paymentStatus: BundlePaymentStatus.NOT_REQUIRED,
        paidAt: null,
        paymentReference: null,
      });
    }
    item.source = source;
    item.grantedBy = grantedBy;
    item.expiresAt = expiresAt;

    if (bundle.isFree) {
      item.status = BundleEnrollmentStatus.ACTIVE;
      item.paymentStatus = BundlePaymentStatus.NOT_REQUIRED;
      item.paidAt = null;
      item.paymentReference = null;
    } else if (paymentConfirmed || item.paymentStatus === BundlePaymentStatus.PAID) {
      item.status = BundleEnrollmentStatus.ACTIVE;
      item.paymentStatus = BundlePaymentStatus.PAID;
      item.paidAt = item.paidAt ?? new Date();
      item.paymentReference = paymentReference?.trim() || item.paymentReference || null;
    } else {
      item.status = BundleEnrollmentStatus.REVOKED;
      item.paymentStatus = BundlePaymentStatus.PENDING;
      item.paidAt = null;
      item.paymentReference = null;
    }
    const saved = await this.enrollments.save(item);
    const hydrated = await this.enrollments.findOne({
      where: { id: saved.id },
      relations: { bundle: true },
    });
    return hydrated ? this.enrollmentView(hydrated) : saved;
  }

  private async synchronizeEnrollmentPolicy(bundle: Bundle) {
    if (bundle.isFree) {
      await this.enrollments.createQueryBuilder()
        .update(BundleEnrollment)
        .set({
          status: BundleEnrollmentStatus.ACTIVE,
          paymentStatus: BundlePaymentStatus.NOT_REQUIRED,
          paidAt: null,
          paymentReference: null,
        })
        .where('bundle_id = :bundleId', { bundleId: bundle.id })
        .andWhere('payment_status = :pending', { pending: BundlePaymentStatus.PENDING })
        .execute();
      await this.enrollments.createQueryBuilder()
        .update(BundleEnrollment)
        .set({ paymentStatus: BundlePaymentStatus.NOT_REQUIRED })
        .where('bundle_id = :bundleId', { bundleId: bundle.id })
        .andWhere('status <> :revoked', { revoked: BundleEnrollmentStatus.REVOKED })
        .execute();
      return;
    }
    await this.enrollments.createQueryBuilder()
      .update(BundleEnrollment)
      .set({
        status: BundleEnrollmentStatus.REVOKED,
        paymentStatus: BundlePaymentStatus.PENDING,
        paidAt: null,
        paymentReference: null,
      })
      .where('bundle_id = :bundleId', { bundleId: bundle.id })
      .andWhere('status <> :revoked', { revoked: BundleEnrollmentStatus.REVOKED })
      .andWhere('payment_status = :notRequired', { notRequired: BundlePaymentStatus.NOT_REQUIRED })
      .execute();
  }

  private async requireEnrollment(bundleId: string, studentId: string) {
    const item = await this.enrollments.findOne({ where: { bundleId, studentId } });
    if (!item) throw new ForbiddenException('You do not have access to this bundle');
    if (item.status === BundleEnrollmentStatus.REVOKED) {
      if (item.paymentStatus === BundlePaymentStatus.PENDING) {
        throw new ForbiddenException('Payment is required before this bundle becomes accessible');
      }
      throw new ForbiddenException('You do not have access to this bundle');
    }
    return item;
  }

  private enrollmentView(row: BundleEnrollment) {
    return {
      ...row.bundle,
      ...this.accessState(row, row.bundle),
      partial_access: false,
      enrollmentSource: row.source,
      paymentStatus: row.paymentStatus,
      paidAt: row.paidAt,
      paymentReference: row.paymentReference,
    };
  }

  private accessState(row: BundleEnrollment, bundle: Bundle) {
    const now = new Date();
    const paymentRequired = !bundle.isFree && row.paymentStatus !== BundlePaymentStatus.PAID;
    const revoked = row.status === BundleEnrollmentStatus.REVOKED;
    const scheduled = Boolean(bundle.availableFrom && bundle.availableFrom > now);
    const draft = bundle.status === BundleStatus.DRAFT;
    const expired = bundle.status === BundleStatus.ARCHIVED
      || row.status === BundleEnrollmentStatus.EXPIRED
      || Boolean(row.expiresAt && row.expiresAt <= now)
      || Boolean(bundle.availableUntil && bundle.availableUntil <= now);
    const accessible = !paymentRequired && !revoked && !scheduled && !draft;
    const accessStatus = paymentRequired
      ? 'PENDING_PAYMENT'
      : revoked
        ? 'REVOKED'
        : draft
          ? 'DRAFT'
          : scheduled
            ? 'SCHEDULED'
            : expired
              ? 'EXPIRED'
              : 'ACTIVE';
    return {
      read_only: accessible && expired,
      accessible,
      payment_required: paymentRequired,
      access_status: accessStatus,
      expires_at: row.expiresAt,
    };
  }

  private async resolvePlanAccess(bundleId: string, studentId: string) {
    const grants = await this.planGrants.find({ where: { bundleId, studentId } });
    const now = new Date();
    const active = grants.filter((row) => row.status !== BundleEnrollmentStatus.REVOKED
      && row.paymentStatus === BundlePaymentStatus.PAID
      && !(row.expiresAt && row.expiresAt <= now));
    if (!active.length) return null;
    const weekLinks = await this.bundlePlanWeeks.find({ where: { bundleId, plan: In(active.map((row) => row.plan)) } });
    const visibleWeekIds = new Set(weekLinks.map((row) => row.weekId));
    const essayPlans = new Set(active.filter((row) => row.tier === BundlePlanTier.MCQ_ESSAY).map((row) => row.plan));
    const essayWeekIds = new Set(weekLinks.filter((row) => essayPlans.has(row.plan)).map((row) => row.weekId));
    return { visibleWeekIds, essayWeekIds, grants: active };
  }

  private planPrice(bundle: Bundle, plan: BundlePlan, tier: BundlePlanTier): number | null {
    const raw = plan === BundlePlan.FIRST
      ? (tier === BundlePlanTier.MCQ_ESSAY ? bundle.firstPlanPriceMcqEssay : bundle.firstPlanPriceMcq)
      : (tier === BundlePlanTier.MCQ_ESSAY ? bundle.finalPlanPriceMcqEssay : bundle.finalPlanPriceMcq);
    return raw === null || raw === undefined ? null : Number(raw);
  }

  private planGrantView(row: BundlePlanGrant, bundle: Bundle) {
    return {
      id: row.id,
      bundleId: row.bundleId,
      plan: row.plan,
      tier: row.tier,
      status: row.status,
      paymentStatus: row.paymentStatus,
      paidAt: row.paidAt,
      paymentReference: row.paymentReference,
      expiresAt: row.expiresAt,
      price: this.planPrice(bundle, row.plan, row.tier),
      priceCurrency: bundle.priceCurrency,
    };
  }

  private resolvePlanPriceInput(input: number | null | undefined, existing: string | null): number | null {
    if (input !== undefined) return input;
    return existing === null ? null : Number(existing);
  }

  parsePlan(value: string): BundlePlan {
    if (value === 'FIRST' || value === 'FINAL') return value as BundlePlan;
    throw new BadRequestException('plan must be FIRST or FINAL');
  }

  private async assertManager(id: string, actor: AuthenticatedUser) {
    await this.requireBundle(id);
    if (actor.role === UserRole.SYSTEM_ADMIN) return;
    if (actor.role !== UserRole.INSTRUCTOR || !await this.bundleInstructors.exists({
      where: { bundleId: id, instructorId: actor.userId },
    })) {
      throw new ForbiddenException('You do not manage this bundle');
    }
  }

  private async assertCourseAttachable(courseId: string, actor: AuthenticatedUser) {
    if (!await this.courses.exists({ where: { id: courseId, isActive: true } })) {
      throw new NotFoundException('Active course not found');
    }
    if (actor.role === UserRole.SYSTEM_ADMIN) return;
    const rows = await this.dataSource.query(
      `SELECT 1 FROM course_instructors WHERE course_id = $1 AND instructor_id = $2 LIMIT 1`,
      [courseId, actor.userId],
    ) as unknown[];
    if (!rows.length) throw new ForbiddenException('You can attach only courses assigned to you');
  }

  private async requireBundle(id: string) {
    const item = await this.bundles.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Bundle not found');
    return item;
  }

  private async requireBundleWithSecret(id: string) {
    const item = await this.bundles.createQueryBuilder('bundle')
      .addSelect('bundle.enrollment_code_hash')
      .where('bundle.id = :id', { id })
      .getOne();
    if (!item) throw new NotFoundException('Bundle not found');
    return item;
  }

  private resolvePricing(isFree: boolean, priceAmount?: number, priceCurrency?: string) {
    const currency = (priceCurrency || 'EGP').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('price_currency must be a three-letter currency code');
    if (isFree) return { priceAmount: null, priceCurrency: currency };
    if (priceAmount === undefined || !Number.isFinite(priceAmount) || priceAmount <= 0) {
      throw new BadRequestException('Paid bundles require a price greater than zero');
    }
    return { priceAmount: Number(priceAmount).toFixed(2), priceCurrency: currency };
  }

  private validateWindow(from?: string | null, to?: string | null) {
    if (from && to && new Date(from) >= new Date(to)) {
      throw new BadRequestException('available_until must be after available_from');
    }
  }

  private slug(value: string) {
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!normalized) throw new BadRequestException('Bundle slug is invalid');
    return normalized;
  }

  private userView(user: User) {
    return { id: user.id, fullName: user.fullName, email: user.email };
  }

  private isUnique(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error
      && (error as { code?: string }).code === '23505';
  }

  private async saveLink<T>(operation: () => Promise<T>, message: string) {
    try {
      return await operation();
    } catch (error) {
      if (this.isUnique(error)) throw new ConflictException(message);
      throw error;
    }
  }
}
