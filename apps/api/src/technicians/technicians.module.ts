import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommandsModule } from '../commands/commands.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TechnicianAccountsBatchController } from './technician-accounts-batch.controller';
import { TechnicianNodeAccountsController } from './technician-node-accounts.controller';
import { TechniciansController } from './technicians.controller';
import { TechniciansService } from './technicians.service';

@Module({
  imports: [PrismaModule, AuthModule, CommandsModule],
  controllers: [
    TechniciansController,
    TechnicianNodeAccountsController,
    TechnicianAccountsBatchController,
  ],
  providers: [TechniciansService],
  exports: [TechniciansService],
})
export class TechniciansModule {}
