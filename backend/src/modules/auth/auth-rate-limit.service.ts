import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';

@Injectable()
export class AuthRateLimitService {
  constructor(private readonly dataSource: DataSource) {}

  async enforce(ip: string, email: string, action: string): Promise<void> {
    await Promise.all([
      this.consume(`ip:${action}:${ip}`, 10, 15 * 60),
      this.consume(`account:${action}:${email.trim().toLowerCase()}`, 3, 60 * 60),
    ]);
  }

  private async consume(rawKey: string, maximum: number, windowSeconds: number): Promise<void> {
    const key = createHash('sha256').update(rawKey).digest('hex');
    const rows = await this.dataSource.query(
      `INSERT INTO auth_rate_limits (limit_key, window_started_at, request_count, expires_at)
       VALUES ($1, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP + ($2 * INTERVAL '1 second'))
       ON CONFLICT (limit_key) DO UPDATE
       SET request_count = CASE
             WHEN auth_rate_limits.expires_at <= CURRENT_TIMESTAMP THEN 1
             ELSE auth_rate_limits.request_count + 1
           END,
           window_started_at = CASE
             WHEN auth_rate_limits.expires_at <= CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP
             ELSE auth_rate_limits.window_started_at
           END,
           expires_at = CASE
             WHEN auth_rate_limits.expires_at <= CURRENT_TIMESTAMP
               THEN CURRENT_TIMESTAMP + ($2 * INTERVAL '1 second')
             ELSE auth_rate_limits.expires_at
           END
       RETURNING request_count, expires_at`,
      [key, windowSeconds],
    ) as Array<{ request_count: number; expires_at: Date }>;

    if (Number(rows[0].request_count) > maximum) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Try again later.',
          retryAfter: Math.max(
            1,
            Math.ceil((new Date(rows[0].expires_at).getTime() - Date.now()) / 1000),
          ),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
