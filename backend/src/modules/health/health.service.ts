import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  liveness() {
    return {
      status: 'ok',
      service: 'my-doctor-professor-api',
      timestamp: new Date().toISOString(),
    };
  }

  async readiness() {
    const startedAt = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ready',
        database: 'up',
        response_time_ms: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        database: 'down',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
