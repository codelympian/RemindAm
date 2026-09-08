import { Controller, Get } from '@nestjs/common';
import type { HealthStatus } from '@remindam/shared';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthStatus> {
    const dbUp = await this.prisma.isHealthy();
    return {
      status: dbUp ? 'ok' : 'error',
      service: 'remindam-backend',
      timestamp: new Date().toISOString(),
      database: dbUp ? 'up' : 'down',
    };
  }
}
