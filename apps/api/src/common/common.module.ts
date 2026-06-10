import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NodeRequestAuthService } from './node-request-auth.service';
import { NodeSecretCryptoService } from './node-secret-crypto.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [NodeSecretCryptoService, NodeRequestAuthService],
  exports: [NodeSecretCryptoService, NodeRequestAuthService],
})
export class CommonModule {}
