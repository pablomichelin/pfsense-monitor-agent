import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessPolicyService } from './access-policy.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MfaEnrollmentGuard } from './mfa-enrollment.guard';
import { MfaService } from './mfa.service';
import { MfaPolicyController } from '../mfa-policy/mfa-policy.controller';
import { MfaPolicyService } from '../mfa-policy/mfa-policy.service';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsService } from './permissions.service';
import { RolesGuard } from './roles.guard';
import { SessionAuthGuard } from './session-auth.guard';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController, MfaPolicyController],
  providers: [
    AuthService,
    MfaService,
    MfaPolicyService,
    MfaEnrollmentGuard,
    SessionAuthGuard,
    RolesGuard,
    PermissionsGuard,
    PermissionsService,
    AccessPolicyService,
  ],
  exports: [
    AuthService,
    MfaService,
    MfaPolicyService,
    MfaEnrollmentGuard,
    SessionAuthGuard,
    RolesGuard,
    PermissionsGuard,
    PermissionsService,
    AccessPolicyService,
  ],
})
export class AuthModule {}
