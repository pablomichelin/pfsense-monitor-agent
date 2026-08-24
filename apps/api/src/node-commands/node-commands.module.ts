import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TechniciansModule } from '../technicians/technicians.module';
import { NodeCommandsService } from './node-commands.service';

@Module({
  imports: [PrismaModule, forwardRef(() => TechniciansModule)],
  providers: [NodeCommandsService],
  exports: [NodeCommandsService],
})
export class NodeCommandsModule {}
