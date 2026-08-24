import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommandsModule } from '../commands/commands.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TechnicianAccountsBatchController } from './technician-accounts-batch.controller';
import { TechnicianNodeAccountsController } from './technician-node-accounts.controller';
import { TechniciansController } from './technicians.controller';
import { TechnicianBackupFollowUpService } from './technician-backup-followup.service';
import { TechniciansService } from './technicians.service';

@Module({
  imports: [PrismaModule, AuthModule, CommandsModule],
  controllers: [
    TechniciansController,
    TechnicianNodeAccountsController,
    TechnicianAccountsBatchController,
  ],
  providers: [TechniciansService, TechnicianBackupFollowUpService],
  exports: [TechniciansService, TechnicianBackupFollowUpService],
})
export class TechniciansModule {}
