import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { NodeSecretCryptoService } from '../common/node-secret-crypto.service';

@Module({
  imports: [RealtimeModule],
  controllers: [IngestController],
  providers: [IngestService, NodeSecretCryptoService],
})
export class IngestModule {}
