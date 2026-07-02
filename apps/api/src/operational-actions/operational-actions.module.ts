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
  imports: [PrismaModule, AuthModule, CommandsModule],
  controllers: [OperationalActionsController, OperationalActionsBatchController],
  providers: [OperationalActionsService],
})
export class OperationalActionsModule {}
