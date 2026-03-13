import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AlertsModule } from './alerts/alerts.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { IngestModule } from './ingest/ingest.module';
import { NodesModule } from './nodes/nodes.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    AlertsModule,
    IngestModule,
    DashboardModule,
    NodesModule,
    AdminModule,
  ],
})
export class AppModule {}
