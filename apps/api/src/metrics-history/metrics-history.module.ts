import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MetricsHistoryController } from './metrics-history.controller';
import { MetricsHistoryService } from './metrics-history.service';
import { MetricsRollupService } from './metrics-rollup.service';
import { MetricsSamplerService } from './metrics-sampler.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MetricsHistoryController],
  providers: [
    MetricsHistoryService,
    MetricsRollupService,
    MetricsSamplerService,
  ],
  exports: [MetricsHistoryService],
})
export class MetricsHistoryModule {}
