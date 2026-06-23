import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NodeCommandsService } from './node-commands.service';

@Module({
  imports: [PrismaModule],
  providers: [NodeCommandsService],
  exports: [NodeCommandsService],
})
export class NodeCommandsModule {}
