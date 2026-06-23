import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NodeCommandsModule } from '../node-commands/node-commands.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PfsenseUpgradeController } from './pfsense-upgrade.controller';
import { PfsenseUpgradeService } from './pfsense-upgrade.service';

@Module({
  imports: [PrismaModule, AuthModule, NodeCommandsModule],
  controllers: [PfsenseUpgradeController],
  providers: [PfsenseUpgradeService],
})
export class PfsenseUpgradeModule {}
