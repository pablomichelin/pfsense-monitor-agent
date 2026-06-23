import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { AgentModule } from './agent/agent.module';
import { AdminModule } from './admin/admin.module';
import { AlertsModule } from './alerts/alerts.module';
import { AuthModule } from './auth/auth.module';
import { BackupsModule } from './backups/backups.module';
import { CommonModule } from './common/common.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { IngestModule } from './ingest/ingest.module';
import { NodesModule } from './nodes/nodes.module';
import { PfsenseUpgradeModule } from './pfsense-upgrade/pfsense-upgrade.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    CommonModule,
    HealthModule,
    AgentModule,
    AuthModule,
    AlertsModule,
    BackupsModule,
    IngestModule,
    DashboardModule,
    NodesModule,
    AdminModule,
    PfsenseUpgradeModule,
  ],
})
export class AppModule {}
