import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { AuthModule } from '../auth/auth.module';
import { NodeSecretCryptoService } from '../common/node-secret-crypto.service';
import { NodesModule } from '../nodes/nodes.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, NodesModule, AgentModule],
  controllers: [AdminController],
  providers: [AdminService, NodeSecretCryptoService],
})
export class AdminModule {}
