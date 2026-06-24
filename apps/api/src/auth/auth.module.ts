import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessPolicyService } from './access-policy.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsService } from './permissions.service';
import { RolesGuard } from './roles.guard';
import { SessionAuthGuard } from './session-auth.guard';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    MfaService,
    SessionAuthGuard,
    RolesGuard,
    PermissionsGuard,
    PermissionsService,
    AccessPolicyService,
  ],
  exports: [
    AuthService,
    MfaService,
    SessionAuthGuard,
    RolesGuard,
    PermissionsGuard,
    PermissionsService,
    AccessPolicyService,
  ],
})
export class AuthModule {}
