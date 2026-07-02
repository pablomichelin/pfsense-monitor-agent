import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { AgentModule } from './agent/agent.module';
import { AdminModule } from './admin/admin.module';
import { AlertsModule } from './alerts/alerts.module';
import { AuthModule } from './auth/auth.module';
import { BackupsModule } from './backups/backups.module';
import { CommandsModule } from './commands/commands.module';
import { CommonModule } from './common/common.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { IngestModule } from './ingest/ingest.module';
import { NodesModule } from './nodes/nodes.module';
import { OperationalActionsModule } from './operational-actions/operational-actions.module';
import { PackageUpgradeModule } from './package-upgrade/package-upgrade.module';
import { PfsenseUpgradeModule } from './pfsense-upgrade/pfsense-upgrade.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FleetOrgModule } from './fleet-org/fleet-org.module';
import { MetricsHistoryModule } from './metrics-history/metrics-history.module';
import { NodeCapabilitiesModule } from './node-capabilities/node-capabilities.module';
import { PfsenseApiModule } from './pfsense-api/pfsense-api.module';
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
    PackageUpgradeModule,
    NotificationsModule,
    FleetOrgModule,
    MetricsHistoryModule,
    CommandsModule,
    OperationalActionsModule,
    NodeCapabilitiesModule,
    PfsenseApiModule,
  ],
})
export class AppModule {}
