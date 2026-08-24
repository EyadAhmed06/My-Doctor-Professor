import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { HealthService } from './health.service';

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
