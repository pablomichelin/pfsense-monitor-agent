import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { BackupsStorageService } from '../backups/backups-storage.service';
import { NodeCapabilitiesModule } from '../node-capabilities/node-capabilities.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PfsenseApiController } from './pfsense-api.controller';
import { PfsenseApiService } from './pfsense-api.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule, NodeCapabilitiesModule],
  controllers: [PfsenseApiController],
  providers: [PfsenseApiService, BackupsStorageService],
})
export class PfsenseApiModule {}
