import { RecoveryIngestController } from './recovery-ingest.controller';
import { NodeCommandsModule } from '../node-commands/node-commands.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommandsModule } from '../commands/commands.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  OperationalActionsBatchController,
  OperationalActionsController,
} from './operational-actions.controller';
import { OperationalActionsService } from './operational-actions.service';

@Module({
  imports: [PrismaModule, AuthModule, CommandsModule, NodeCommandsModule],
  controllers: [OperationalActionsController, OperationalActionsBatchController, RecoveryIngestController],
  providers: [OperationalActionsService],
})
export class OperationalActionsModule {}
