import { ConflictException, NotFoundException } from '@nestjs/common';
import { BundleEnrollmentStatus, BundlePaymentStatus } from '../../common/entities/bundle-enrollment.entity';
import { UserRole, UserStatus } from '../users/entities/user.entity';
import { BundlesService } from './bundles.service';

describe('Restore a revoked bundle enrollment', () => {
  const actor = { userId: 'instructor-1', role: UserRole.INSTRUCTOR } as never;
  const bundleId = 'bundle-1';
  const studentId = 'student-1';

  function harness(overrides: Record<string, unknown> = {}) {
    const paidAt = new Date('2026-10-15T10:00:00Z');
    const enrollment = {
      id: 'enrollment-1', bundleId, studentId,
      status: BundleEnrollmentStatus.REVOKED,
      paymentStatus: BundlePaymentStatus.PAID,
      paidAt, paymentReference: 'receipt-123',
      expiresAt: null,
      ...overrides,
    };
    const save = jest.fn(async (row: unknown) => row);
    const context = {
      assertManager: jest.fn().mockResolvedValue(undefined),
      requireBundle: jest.fn().mockResolvedValue({ id: bundleId, isFree: false }),
      users: { findOne: jest.fn().mockResolvedValue({ id: studentId, role: UserRole.STUDENT, status: UserStatus.ACTIVE }) },
      enrollments: { findOne: jest.fn().mockResolvedValue(enrollment), save },
    };
    return { enrollment, context, save };
  }

  it('restores paid access without erasing the original receipt or payment timestamp', async () => {
    const { enrollment, context, save } = harness();
    const result = await BundlesService.prototype.restore.call(context as never, bundleId, actor, studentId);
    expect(result.status).toBe(BundleEnrollmentStatus.ACTIVE);
    expect(result.paymentStatus).toBe(BundlePaymentStatus.PAID);
    expect(result.paymentReference).toBe('receipt-123');
    expect(result.paidAt).toEqual(new Date('2026-10-15T10:00:00Z'));
    expect(result).toBe(enrollment);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('never converts a pending payment into confirmed paid access', async () => {
    const { context, save } = harness({ paymentStatus: BundlePaymentStatus.PENDING });
    await expect(BundlesService.prototype.restore.call(context as never, bundleId, actor, studentId))
      .rejects.toBeInstanceOf(ConflictException);
    expect(save).not.toHaveBeenCalled();
  });

  it('requires a new expiry decision rather than silently extending expired access', async () => {
    const { context, save } = harness({ expiresAt: new Date('2020-01-01T00:00:00Z') });
    await expect(BundlesService.prototype.restore.call(context as never, bundleId, actor, studentId))
      .rejects.toBeInstanceOf(ConflictException);
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects restoration when the student account is no longer active', async () => {
    const { context, save } = harness();
    context.users.findOne.mockResolvedValue(null);
    await expect(BundlesService.prototype.restore.call(context as never, bundleId, actor, studentId))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(save).not.toHaveBeenCalled();
  });

  it('checks bundle management authorization before restoring', async () => {
    const { context, save } = harness();
    context.assertManager.mockRejectedValue(new Error('Forbidden'));
    await expect(BundlesService.prototype.restore.call(context as never, bundleId, actor, studentId))
      .rejects.toThrow('Forbidden');
    expect(save).not.toHaveBeenCalled();
  });
});
