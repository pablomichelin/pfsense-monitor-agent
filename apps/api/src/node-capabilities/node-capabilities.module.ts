import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  NodeCapabilitiesController,
  NodeCapabilitiesStatusController,
} from './node-capabilities.controller';
import { NodeCapabilitiesService } from './node-capabilities.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [NodeCapabilitiesController, NodeCapabilitiesStatusController],
  providers: [NodeCapabilitiesService],
  exports: [NodeCapabilitiesService],
})
export class NodeCapabilitiesModule {}
