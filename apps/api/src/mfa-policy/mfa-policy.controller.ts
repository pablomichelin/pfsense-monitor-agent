import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { getAccessActor } from '../auth/access-actor.util';
import { MfaEnrollmentGuard } from '../auth/mfa-enrollment.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { resolveClientIp } from '../common/client-ip';
import { UpdateMfaPolicyDto } from './dto/mfa-policy.dto';
import { MfaPolicyService } from './mfa-policy.service';

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/security/mfa-policy')
export class MfaPolicyController {
  constructor(private readonly mfaPolicyService: MfaPolicyService) {}

  @Get()
  @RequirePermissions('security.mfa_policy.view')
  getPolicy() {
    return this.mfaPolicyService.getPolicyView();
  }

  @Patch()
  @RequirePermissions('security.mfa_policy.manage')
  updatePolicy(
    @Body() body: UpdateMfaPolicyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = getAccessActor(request);
    return this.mfaPolicyService.updatePolicy(
      body,
      {
        userId: actor.userId,
        role: actor.role,
      },
      resolveClientIp(request),
    );
  }
}
