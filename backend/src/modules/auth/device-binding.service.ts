import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { isIP } from 'net';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { DeviceBinding } from '../users/entities/device-binding.entity';
import { User, UserRole } from '../users/entities/user.entity';

export type DeviceAuthorization = {
  bindingId: string;
  issuedToken: string | null;
  created: boolean;
} | null;

@Injectable()
export class DeviceBindingService {
  constructor(
    @InjectRepository(DeviceBinding)
    private readonly bindings: Repository<DeviceBinding>,
    private readonly config: ConfigService,
  ) {}

  async authorize(
    user: User,
    presentedToken?: string | null,
    ipAddress?: string | null,
    userAgent?: string | null,
  ): Promise<DeviceAuthorization> {
    if (!this.isEnforced(user.role)) return null;

    const active = await this.findActive(user.id);
    if (active) {
      if (
        !presentedToken ||
        !this.matches(presentedToken, active.deviceTokenHash)
      ) {
        this.throwDeviceLocked();
      }
      await this.bindings.update(
        { id: active.id },
        {
          lastSeenAt: new Date(),
          ipAddress: this.normalizeIp(ipAddress),
          userAgent: this.normalizeUserAgent(userAgent),
        },
      );
      return { bindingId: active.id, issuedToken: null, created: false };
    }

    const rawToken = randomBytes(32).toString('base64url');
    try {
      const binding = await this.bindings.save(
        this.bindings.create({
          userId: user.id,
          deviceTokenHash: this.digest(rawToken),
          ipAddress: this.normalizeIp(ipAddress),
          userAgent: this.normalizeUserAgent(userAgent),
          lastSeenAt: new Date(),
          releasedAt: null,
          releasedByAdminId: null,
        }),
      );
      return { bindingId: binding.id, issuedToken: rawToken, created: true };
    } catch (error) {
      if (this.isUniqueViolation(error)) this.throwDeviceLocked();
      throw error;
    }
  }

  async releaseIfNew(authorization: DeviceAuthorization): Promise<void> {
    if (!authorization?.created) return;
    await this.bindings.update(
      { id: authorization.bindingId, releasedAt: IsNull() },
      { releasedAt: new Date() },
    );
  }

  isEnforced(role: UserRole): boolean {
    const enforcedRoles = (
      this.config.get<string>('AUTH_DEVICE_BINDING_ROLES') ?? 'STUDENT'
    )
      .split(',')
      .map((roleName) => roleName.trim().toUpperCase())
      .filter(Boolean);
    const exemptRoles = (
      this.config.get<string>('AUTH_DEVICE_BINDING_EXEMPT_ROLES') ??
      'INSTRUCTOR,SYSTEM_ADMIN'
    )
      .split(',')
      .map((roleName) => roleName.trim().toUpperCase())
      .filter(Boolean);
    return !exemptRoles.includes(role) && enforcedRoles.includes(role);
  }

  private findActive(userId: string): Promise<DeviceBinding | null> {
    return this.bindings.findOne({ where: { userId, releasedAt: IsNull() } });
  }

  private digest(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private matches(rawToken: string, expectedDigest: string): boolean {
    const presented = Buffer.from(this.digest(rawToken), 'hex');
    const expected = Buffer.from(expectedDigest, 'hex');
    return (
      presented.length === expected.length &&
      timingSafeEqual(presented, expected)
    );
  }

  private normalizeIp(value?: string | null): string | null {
    if (!value) return null;
    const candidate = value.startsWith('::ffff:') ? value.slice(7) : value;
    return isIP(candidate) ? candidate : null;
  }

  private normalizeUserAgent(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized.slice(0, 1000) : null;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code === '23505'
    );
  }

  private throwDeviceLocked(): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.LOCKED,
        error: 'DEVICE_LOCKED',
        message:
          'This account is registered to another device. Contact an administrator to authorize a device change.',
      },
      HttpStatus.LOCKED,
    );
  }
}
