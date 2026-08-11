import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { BundleCourse } from '../../common/entities/bundle-course.entity';
import {
  BundleEnrollment,
  BundleEnrollmentStatus,
  BundlePaymentStatus,
} from '../../common/entities/bundle-enrollment.entity';
import { BundleInstructor } from '../../common/entities/bundle-instructor.entity';
import { BundleTest } from '../../common/entities/bundle-test.entity';
import { BundleWeek } from '../../common/entities/bundle-week.entity';
import { Bundle, BundleAccessMode, BundleStatus } from '../../common/entities/bundle.entity';
import { Course } from '../../common/entities/course.entity';
import { Test } from '../../common/entities/test.entity';
import { Week } from '../../common/entities/week.entity';
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
      repo<Course>(),
      repo<Week>(),
      repo<Test>(),
      repo<User>(),
      {} as DataSource,
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
});
