import { HttpStatus } from '@nestjs/common';
import { DeviceBinding } from '../users/entities/device-binding.entity';
import { UserRole } from '../users/entities/user.entity';
import { DeviceBindingService } from './device-binding.service';

describe('DeviceBindingService', () => {
  let active: DeviceBinding | null;
  let service: DeviceBindingService;
  let repository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };

  const student = {
    id: '11111111-1111-4111-8111-111111111111',
    role: UserRole.STUDENT,
  };

  beforeEach(() => {
    active = null;
    repository = {
      findOne: jest.fn(async () => (active?.releasedAt ? null : active)),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        active = {
          ...value,
          id: '22222222-2222-4222-8222-222222222222',
          boundAt: new Date(),
        } as DeviceBinding;
        return active;
      }),
      update: jest.fn(async (_criteria, changes) => {
        if (active) Object.assign(active, changes);
        return { affected: active ? 1 : 0 };
      }),
    };
    const config = { get: jest.fn(() => undefined) };
    service = new DeviceBindingService(repository as never, config as never);
  });

  it('issues a random credential on first student login and stores only its digest', async () => {
    const result = await service.authorize(
      student as never,
      null,
      '::ffff:127.0.0.1',
      ' Test Browser ',
    );

    expect(result?.created).toBe(true);
    expect(result?.issuedToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(active?.deviceTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(active?.deviceTokenHash).not.toBe(result?.issuedToken);
    expect(active?.ipAddress).toBe('127.0.0.1');
    expect(active?.userAgent).toBe('Test Browser');
  });

  it('accepts the registered credential but refuses a missing or different credential', async () => {
    const first = await service.authorize(student as never);

    await expect(
      service.authorize(student as never, 'wrong-device-token'),
    ).rejects.toMatchObject({ status: HttpStatus.LOCKED });
    await expect(
      service.authorize(student as never, null),
    ).rejects.toMatchObject({ status: HttpStatus.LOCKED });

    const returning = await service.authorize(
      student as never,
      first?.issuedToken,
      '10.0.0.4',
      'Returning Browser',
    );
    expect(returning).toMatchObject({ created: false, issuedToken: null });
    expect(active?.lastSeenAt).toBeInstanceOf(Date);
    expect(active?.userAgent).toBe('Returning Browser');
  });

  it('does not device-bind exempt instructor accounts', async () => {
    const result = await service.authorize({
      ...student,
      role: UserRole.INSTRUCTOR,
    } as never);

    expect(result).toBeNull();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('can roll back a newly created binding when session creation fails', async () => {
    const authorization = await service.authorize(student as never);
    await service.releaseIfNew(authorization);

    expect(active?.releasedAt).toBeInstanceOf(Date);
    await expect(service.authorize(student as never)).resolves.toMatchObject({
      created: true,
    });
  });
});
