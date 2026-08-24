import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CommandOrchestratorService } from './command-orchestrator.service';
import { CommandWorkerService } from './command-worker.service';
import {
  CommandBatchesController,
  NodeCommandsController,
} from './commands.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [NodeCommandsController, CommandBatchesController],
  providers: [CommandOrchestratorService, CommandWorkerService],
  exports: [CommandOrchestratorService],
})
export class CommandsModule {}
