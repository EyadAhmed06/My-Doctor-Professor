import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { BundleCourse } from '../../common/entities/bundle-course.entity';
import {
  BundleEnrollment,
  BundleEnrollmentStatus,
  BundlePaymentStatus,
} from '../../common/entities/bundle-enrollment.entity';
import { BundleInstructor } from '../../common/entities/bundle-instructor.entity';
import { BundlePlanGrant } from '../../common/entities/bundle-plan-grant.entity';
import { BundlePlanWeek } from '../../common/entities/bundle-plan-week.entity';
import { BundleTest } from '../../common/entities/bundle-test.entity';
import { BundleWeek } from '../../common/entities/bundle-week.entity';
import { Bundle, BundleAccessMode, BundleStatus } from '../../common/entities/bundle.entity';
import { Course } from '../../common/entities/course.entity';
import { Test } from '../../common/entities/test.entity';
import { Week } from '../../common/entities/week.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { User, UserRole } from '../users/entities/user.entity';
import { BundlesService } from './bundles.service';

function repo<T>(overrides: Record<string, unknown> = {}) {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    exists: jest.fn(),
    count: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: unknown) => value),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
    ...overrides,
  } as unknown as Repository<T>;
}

describe('BundlesService payment entitlement', () => {
  const bundleId = '11111111-1111-4111-8111-111111111111';
  const studentId = '22222222-2222-4222-8222-222222222222';

  function build(isFree: boolean) {
    const bundle = {
      id: bundleId,
      title: 'Cardiology',
      slug: 'cardiology',
      description: null,
      academicYear: 3,
      status: BundleStatus.PUBLISHED,
      accessMode: BundleAccessMode.PUBLIC,
      isFree,
      priceAmount: isFree ? null : '750.00',
      priceCurrency: 'EGP',
      enrollmentCodeHash: null,
      availableFrom: null,
      availableUntil: null,
      createdBy: '33333333-3333-4333-8333-333333333333',
    } as Bundle;
    let saved: BundleEnrollment | null = null;
    const bundles = repo<Bundle>({ findOne: jest.fn().mockResolvedValue(bundle) });
    const enrollments = repo<BundleEnrollment>({
      findOne: jest.fn().mockImplementation(async (options: { where?: { id?: string } }) => options.where?.id && saved ? { ...saved, bundle } : null),
      create: jest.fn((value: Partial<BundleEnrollment>) => ({ id: '44444444-4444-4444-8444-444444444444', ...value })),
      save: jest.fn(async (value: BundleEnrollment) => {
        saved = value;
        return value;
      }),
    });
    const service = new BundlesService(
      bundles,
      repo<BundleCourse>(),
      repo<BundleWeek>(),
      repo<BundleTest>(),
      repo<BundleInstructor>(),
      enrollments,
      repo<BundlePlanWeek>(),
      repo<BundlePlanGrant>(),
      repo<Course>(),
      repo<Week>(),
      repo<Test>(),
      repo<User>(),
      {} as DataSource,
      {} as NotificationsService,
    );
    return { service, enrollments, getSaved: () => saved };
  }

  it('creates paid public enrollment as locked pending payment', async () => {
    const { service, getSaved } = build(false);
    const result = await service.enrollPublic(bundleId, studentId);
    expect(getSaved()).toEqual(expect.objectContaining({
      status: BundleEnrollmentStatus.REVOKED,
      paymentStatus: BundlePaymentStatus.PENDING,
    }));
    expect(result).toEqual(expect.objectContaining({
      accessible: false,
      payment_required: true,
      access_status: 'PENDING_PAYMENT',
    }));
  });

  it('creates free public enrollment with immediate active entitlement', async () => {
    const { service, getSaved } = build(true);
    const result = await service.enrollPublic(bundleId, studentId);
    expect(getSaved()).toEqual(expect.objectContaining({
      status: BundleEnrollmentStatus.ACTIVE,
      paymentStatus: BundlePaymentStatus.NOT_REQUIRED,
    }));
    expect(result).toEqual(expect.objectContaining({
      accessible: true,
      payment_required: false,
      access_status: 'ACTIVE',
    }));
  });

  it('rejects creation of a paid bundle without a positive price', async () => {
    const { service } = build(false);
    await expect(service.create({
      userId: '33333333-3333-4333-8333-333333333333',
      sessionId: '55555555-5555-4555-8555-555555555555',
      email: 'instructor@example.test',
      role: UserRole.INSTRUCTOR,
    }, {
      title: 'Paid bundle',
      slug: 'paid-bundle',
      academic_year: 3,
      is_free: false,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removes an unpublished bundle from the student bundle list', async () => {
    const { service, enrollments } = build(true);
    const published = { id: 'published', title: 'Published bundle', status: BundleStatus.PUBLISHED, isFree: true } as Bundle;
    const unpublished = { id: 'draft', title: 'Unpublished bundle', status: BundleStatus.DRAFT, isFree: true } as Bundle;
    (enrollments.find as jest.Mock).mockResolvedValue([
      { bundle: unpublished, status: BundleEnrollmentStatus.ACTIVE, paymentStatus: BundlePaymentStatus.NOT_REQUIRED },
      { bundle: published, status: BundleEnrollmentStatus.ACTIVE, paymentStatus: BundlePaymentStatus.NOT_REQUIRED },
    ]);

    const result = await service.mine(studentId);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({ id: published.id }));
  });

  it('resolves admin-revoked enrollment on paid bundle as REVOKED not PENDING_PAYMENT', async () => {
    const { service, enrollments } = build(false);
    const bundle = {
      id: bundleId, title: 'Paid bundle', status: BundleStatus.PUBLISHED, isFree: false,
    } as Bundle;
    (enrollments.find as jest.Mock).mockResolvedValue([
      {
        bundle,
        status: BundleEnrollmentStatus.REVOKED,
        paymentStatus: BundlePaymentStatus.CANCELLED,
      },
    ]);

    const result = await service.mine(studentId);

    expect(result).toHaveLength(0);
  });

  it('resolves admin-revoked enrollment with PAID paymentStatus as REVOKED', async () => {
    const { service, enrollments } = build(false);
    const bundle = {
      id: bundleId, title: 'Paid bundle', status: BundleStatus.PUBLISHED, isFree: false,
    } as Bundle;
    (enrollments.find as jest.Mock).mockResolvedValue([
      {
        bundle,
        status: BundleEnrollmentStatus.REVOKED,
        paymentStatus: BundlePaymentStatus.PAID,
      },
    ]);

    const result = await service.mine(studentId);

    expect(result).toHaveLength(0);
  });

  it('resolves self-enrolled pending payment as PENDING_PAYMENT', async () => {
    const { service, enrollments } = build(false);
    const bundle = {
      id: bundleId, title: 'Paid bundle', status: BundleStatus.PUBLISHED, isFree: false,
    } as Bundle;
    (enrollments.find as jest.Mock).mockResolvedValue([
      {
        bundle,
        status: BundleEnrollmentStatus.REVOKED,
        paymentStatus: BundlePaymentStatus.PENDING,
      },
    ]);

    const result = await service.mine(studentId);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      access_status: 'PENDING_PAYMENT',
      accessible: false,
      payment_required: true,
    }));
  });

  it('filters catalog bundles by requested semester', async () => {
    const { service } = build(true);
    const bundleS3 = { id: 's3', title: 'Year 2 — Semester 3', slug: 'year-2-semester-3', academicYear: 2, status: BundleStatus.PUBLISHED, accessMode: BundleAccessMode.PUBLIC } as Bundle;
    const bundleS4 = { id: 's4', title: 'Year 2 — Semester 4', slug: 'year-2-semester-4', academicYear: 2, status: BundleStatus.PUBLISHED, accessMode: BundleAccessMode.PUBLIC } as Bundle;

    jest.spyOn(service['bundles'], 'createQueryBuilder').mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([bundleS3, bundleS4]),
    } as any);

    const result = await service.catalog(undefined, 3);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('s3');
    expect(result[0].semesterNumber).toBe(3);
  });

  it('restricts student mine() bundles to student current semester', async () => {
    const { service, enrollments } = build(true);
    const bundleS3 = { id: 's3', title: 'Year 2 — Semester 3', slug: 'year-2-semester-3', academicYear: 2, status: BundleStatus.PUBLISHED, isFree: true } as Bundle;
    const bundleS4 = { id: 's4', title: 'Year 2 — Semester 4', slug: 'year-2-semester-4', academicYear: 2, status: BundleStatus.PUBLISHED, isFree: true } as Bundle;

    (enrollments.find as jest.Mock).mockResolvedValue([
      { bundle: bundleS3, status: BundleEnrollmentStatus.ACTIVE, paymentStatus: BundlePaymentStatus.NOT_REQUIRED },
      { bundle: bundleS4, status: BundleEnrollmentStatus.ACTIVE, paymentStatus: BundlePaymentStatus.NOT_REQUIRED },
    ]);

    // Mock student repository returning currentSemester: 3
    service['dataSource'] = {
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue({ userId: studentId, currentSemester: 3 }),
      }),
      query: jest.fn().mockResolvedValue([]),
    } as any;

    const result = await service.mine(studentId);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('s3');
    expect(result[0].semesterNumber).toBe(3);
  });

  it('rejects public enrollment for bundles not matching student semester', async () => {
    const { service } = build(true);
    const bundleS4 = { id: 'bundle-s4', title: 'Year 2 — Semester 4', slug: 'year-2-semester-4', academicYear: 2, status: BundleStatus.PUBLISHED, accessMode: BundleAccessMode.PUBLIC, isFree: true } as Bundle;

    jest.spyOn(service, 'requireBundle').mockResolvedValue(bundleS4);
    service['dataSource'] = {
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue({ userId: studentId, currentSemester: 3 }),
      }),
      query: jest.fn().mockResolvedValue([]),
    } as any;

    await expect(service.enrollPublic('bundle-s4', studentId)).rejects.toThrow('You can only enroll in bundles for your current semester');
  });
});
