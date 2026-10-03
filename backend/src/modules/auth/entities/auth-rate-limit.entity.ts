import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('auth_rate_limits')
export class AuthRateLimit {
  @PrimaryColumn({ type: 'char', length: 64, name: 'limit_key' })
  limitKey: string;

  @Column({ type: 'timestamp', name: 'window_started_at' })
  windowStartedAt: Date;

  @Column({ type: 'integer', default: 0, name: 'request_count' })
  requestCount: number;

  @Column({ type: 'timestamp', name: 'expires_at' })
  expiresAt: Date;
}
