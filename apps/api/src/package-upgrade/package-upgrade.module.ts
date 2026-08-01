import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { AuthModule } from '../auth/auth.module';
import { CommandsModule } from '../commands/commands.module';
import { NodeCommandsModule } from '../node-commands/node-commands.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PackageUpgradeBatchController } from './package-upgrade-batch.controller';
import { PackageUpgradeController } from './package-upgrade.controller';
import { PackageUpgradeService } from './package-upgrade.service';

@Module({
  imports: [PrismaModule, AuthModule, NodeCommandsModule, AgentModule, CommandsModule],
  controllers: [PackageUpgradeController, PackageUpgradeBatchController],
  providers: [PackageUpgradeService],
})
export class PackageUpgradeModule {}
