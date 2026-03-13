import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { appConfig } from '../config/app-config';

@Controller('healthz')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth(): Promise<{
    ok: true;
    database: 'up';
    service: string;
    version: string;
    time: string;
  }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      throw new ServiceUnavailableException({
        ok: false,
        database: 'down',
        service: 'monitor-pfsense-api',
        version: appConfig.systemVersion,
        time: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'database unavailable',
      });
    }

    return {
      ok: true,
      database: 'up',
      service: 'monitor-pfsense-api',
      version: appConfig.systemVersion,
      time: new Date().toISOString(),
    };
  }
}

