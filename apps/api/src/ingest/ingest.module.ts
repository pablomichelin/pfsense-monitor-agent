import { Module } from '@nestjs/common';
import { BackupsModule } from '../backups/backups.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';

@Module({
  imports: [RealtimeModule, BackupsModule],
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}
