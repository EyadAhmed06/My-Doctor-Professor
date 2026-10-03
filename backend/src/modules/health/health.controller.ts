import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { SkipRateLimit } from '../auth/decorators/rate-limit.decorator';
import { HealthService } from './health.service';

@SkipRateLimit()
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
