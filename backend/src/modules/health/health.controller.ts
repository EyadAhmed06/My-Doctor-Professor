import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimit } from '../auth/decorators/rate-limit.decorator';
import { HealthService } from './health.service';

@RateLimit({ key: 'health', maximum: 3000, windowSeconds: 900, scope: 'ip' })
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live() {
    return this.health.liveness();
  }

  @Get('ready')
  ready() {
    return this.health.readiness();
  }
}
