import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FleetOrgModule } from '../fleet-org/fleet-org.module';
import { NodeCommandsModule } from '../node-commands/node-commands.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NodeLifecycleService } from './node-lifecycle.service';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    RealtimeModule,
    NodeCommandsModule,
    NotificationsModule,
    forwardRef(() => FleetOrgModule),
  ],
  controllers: [NodesController],
  providers: [NodesService, NodeLifecycleService],
  exports: [NodesService],
})
export class NodesModule {}
