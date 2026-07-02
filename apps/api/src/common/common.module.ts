import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NodeRequestAuthService } from './node-request-auth.service';
import { NodeSecretCryptoService } from './node-secret-crypto.service';
import { SystemJobLockService } from './system-job-lock.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    NodeSecretCryptoService,
    NodeRequestAuthService,
    SystemJobLockService,
  ],
  exports: [
    NodeSecretCryptoService,
    NodeRequestAuthService,
    SystemJobLockService,
  ],
})
export class CommonModule {}
