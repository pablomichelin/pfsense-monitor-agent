import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { AuthModule } from '../auth/auth.module';
import { NodeCommandsModule } from '../node-commands/node-commands.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PackageUpgradeController } from './package-upgrade.controller';
import { PackageUpgradeService } from './package-upgrade.service';

@Module({
  imports: [PrismaModule, AuthModule, NodeCommandsModule, AgentModule],
  controllers: [PackageUpgradeController],
  providers: [PackageUpgradeService],
})
export class PackageUpgradeModule {}
