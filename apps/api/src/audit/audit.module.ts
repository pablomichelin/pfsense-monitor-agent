import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessDeniedAuditFilter } from './access-denied.filter';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    AuditService,
    {
      provide: APP_FILTER,
      useClass: AccessDeniedAuditFilter,
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
