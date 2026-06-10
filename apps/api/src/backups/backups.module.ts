import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BackupsCommandService } from './backups-command.service';
import { BackupsController } from './backups.controller';
import { BackupsDownloadService } from './backups-download.service';
import { BackupsIngestController } from './backups-ingest.controller';
import { BackupsIngestService } from './backups-ingest.service';
import { BackupsRetentionService } from './backups-retention.service';
import { BackupsStorageService } from './backups-storage.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [BackupsIngestController, BackupsController],
  providers: [
    BackupsStorageService,
    BackupsRetentionService,
    BackupsCommandService,
    BackupsIngestService,
    BackupsDownloadService,
  ],
  exports: [BackupsCommandService],
})
export class BackupsModule {}
