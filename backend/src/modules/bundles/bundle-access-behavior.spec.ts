import { ForbiddenException } from '@nestjs/common';
import { BundleEnrollment, BundleEnrollmentStatus, BundlePaymentStatus } from '../../common/entities/bundle-enrollment.entity';
import { Bundle, BundleStatus } from '../../common/entities/bundle.entity';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/entities/user.entity';
import { BundlesService } from './bundles.service';

describe('BundlesService access behavior (getAccessible / requireEnrollment)', () => {
  const actor: AuthenticatedUser = {
    userId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    email: 'student@example.test',
    role: UserRole.STUDENT,
  };

  const createHarness = (options: {
    bundle?: Partial<Bundle> | null;
    enrollment?: Partial<BundleEnrollment> | null;
  } = {}) => {
    const bundleRecord = options.bundle === null ? null : ({
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Test Bundle',
      status: BundleStatus.PUBLISHED,
      isFree: false,
      availableFrom: null,
      availableUntil: null,
      ...options.bundle,
    } as Bundle);

    const enrollmentRecord = options.enrollment === null ? null : ({
      id: '44444444-4444-4444-8444-444444444444',
      bundleId: '33333333-3333-4333-8333-333333333333',
      studentId: actor.userId,
      status: BundleEnrollmentStatus.ACTIVE,
      paymentStatus: BundlePaymentStatus.PAID,
      startsAt: new Date(Date.now() - 3600_000),
      expiresAt: new Date(Date.now() + 86400_000),
      ...options.enrollment,
    } as BundleEnrollment);

    const bundlesRepo = {
      findOne: jest.fn().mockResolvedValue(bundleRecord),
    };
    const enrollmentsRepo = {
      findOne: jest.fn().mockResolvedValue(enrollmentRecord),
    };

    const service = new BundlesService(
      bundlesRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      enrollmentsRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    return { service, bundlesRepo, enrollmentsRepo };
  };

  it('grants access when enrollment is ACTIVE, dates valid, and paid', async () => {
    const { service } = createHarness();
    const result = await service.getAccessible('33333333-3333-4333-8333-333333333333', actor);
    expect(result).toBeDefined();
    expect(result.id).toBe('33333333-3333-4333-8333-333333333333');
    expect(result.accessible).toBe(true);
  });

  it('denies access when enrollment status is EXPIRED with HTTP 403', async () => {
    const { service } = createHarness({
      enrollment: { status: BundleEnrollmentStatus.EXPIRED },
    });
    await expect(service.getAccessible('33333333-3333-4333-8333-333333333333', actor))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies access when enrollment status is REVOKED with HTTP 403', async () => {
    const { service } = createHarness({
      enrollment: { status: BundleEnrollmentStatus.REVOKED },
    });
    await expect(service.getAccessible('33333333-3333-4333-8333-333333333333', actor))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies access when enrollment expires_at is in the past with HTTP 403', async () => {
    const { service } = createHarness({
      enrollment: { expiresAt: new Date(Date.now() - 3600_000) },
    });
    await expect(service.getAccessible('33333333-3333-4333-8333-333333333333', actor))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies access when enrollment payment is PENDING with HTTP 403', async () => {
    const { service } = createHarness({
      enrollment: { paymentStatus: BundlePaymentStatus.PENDING },
    });
    await expect(service.getAccessible('33333333-3333-4333-8333-333333333333', actor))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies access when bundle status is DRAFT with HTTP 403', async () => {
    const { service } = createHarness({
      bundle: { status: BundleStatus.DRAFT },
    });
    await expect(service.getAccessible('33333333-3333-4333-8333-333333333333', actor))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies access when bundle status is ARCHIVED with HTTP 403', async () => {
    const { service } = createHarness({
      bundle: { status: BundleStatus.ARCHIVED },
    });
    await expect(service.getAccessible('33333333-3333-4333-8333-333333333333', actor))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies access when bundle available_until is in the past with HTTP 403', async () => {
    const { service } = createHarness({
      bundle: { availableUntil: new Date(Date.now() - 3600_000) },
    });
    await expect(service.getAccessible('33333333-3333-4333-8333-333333333333', actor))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies access when no enrollment exists with HTTP 403', async () => {
    const { service } = createHarness({
      enrollment: null,
    });
    await expect(service.getAccessible('33333333-3333-4333-8333-333333333333', actor))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
