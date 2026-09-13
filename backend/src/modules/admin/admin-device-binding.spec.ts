import { UserRole } from '../users/entities/user.entity';
import { AdminService } from './admin.service';

describe('AdminService device release', () => {
  function setup(binding: Record<string, unknown> | null) {
    const target = {
      id: '11111111-1111-4111-8111-111111111111',
      role: UserRole.STUDENT,
    };
    const actor = {
      userId: '22222222-2222-4222-8222-222222222222',
      sessionId: '33333333-3333-4333-8333-333333333333',
      email: 'admin@example.test',
      role: UserRole.SYSTEM_ADMIN,
    };
    const execute = jest.fn().mockResolvedValue({ affected: 2 });
    const manager = {
      findOne: jest.fn().mockResolvedValue(binding),
      save: jest.fn(async (_entity, value) => value),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute,
      })),
    };
    const dataSource = {
      transaction: jest.fn(async (work) => work(manager)),
    };
    const service = new AdminService(
      { findOne: jest.fn().mockResolvedValue(target) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      dataSource as never,
      {} as never,
    );
    return { service, actor, binding, manager, execute };
  }

  it('releases the binding and revokes sessions in one transaction', async () => {
    const binding = {
      id: '44444444-4444-4444-8444-444444444444',
      releasedAt: null,
      releasedByAdminId: null,
    };
    const { service, actor, manager, execute } = setup(binding);

    const result = await service.releaseUserDevice(
      '11111111-1111-4111-8111-111111111111',
      actor,
    );

    expect(binding.releasedAt).toBeInstanceOf(Date);
    expect(binding.releasedByAdminId).toBe(actor.userId);
    expect(manager.save).toHaveBeenCalled();
    expect(execute).toHaveBeenCalled();
    expect(result).toMatchObject({
      device_released: true,
      revoked_session_count: 2,
    });
  });

  it('still revokes sessions when there is no active binding', async () => {
    const { service, actor, manager } = setup(null);

    const result = await service.releaseUserDevice(
      '11111111-1111-4111-8111-111111111111',
      actor,
    );

    expect(manager.save).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      device_released: false,
      revoked_session_count: 2,
    });
  });
});
