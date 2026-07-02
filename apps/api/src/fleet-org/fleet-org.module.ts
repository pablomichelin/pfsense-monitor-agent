import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { NodesModule } from '../nodes/nodes.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  GroupsController,
  TagsController,
} from './fleet-org.controller';
import { GroupsService } from './groups.service';
import { NodeFleetMetadataService } from './node-fleet-metadata.service';
import { TagsService } from './tags.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule, forwardRef(() => NodesModule)],
  controllers: [TagsController, GroupsController],
  providers: [TagsService, GroupsService, NodeFleetMetadataService],
  exports: [TagsService, GroupsService, NodeFleetMetadataService],
})
export class FleetOrgModule {}
