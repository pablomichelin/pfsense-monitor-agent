import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NodeSecretCryptoService } from '../common/node-secret-crypto.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, NodeSecretCryptoService],
})
export class AdminModule {}
