import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { getAccessActor } from '../auth/access-actor.util';
import { AccessPolicyService } from '../auth/access-policy.service';
import { MfaEnrollmentGuard } from '../auth/mfa-enrollment.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { resolveClientIp } from '../common/client-ip';
import { BatchRevokeTechnicianDto, BatchProvisionTechnicianDto, BatchPasswordResetTechnicianDto } from './dto/technicians.dto';
import { TechniciansService } from './technicians.service';

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/technician-accounts')
export class TechnicianAccountsBatchController {
  constructor(
    private readonly techniciansService: TechniciansService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  @Post('batch-revoke')
  @RequirePermissions('technicians.manage')
  async createBatchRevoke(
    @Body() body: BatchRevokeTechnicianDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = getAccessActor(request);

    for (const nodeId of body.node_ids) {
      await this.accessPolicy.assertNodeAccess(actor, nodeId);
    }

    return this.techniciansService.createBatchRevoke(
      request.auth!.userId,
      body,
      resolveClientIp(request),
    );
  }

  @Post('batch-provision')
  @RequirePermissions('technicians.manage')
  async createBatchProvision(
    @Body() body: BatchProvisionTechnicianDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = getAccessActor(request);

    for (const nodeId of body.node_ids) {
      await this.accessPolicy.assertNodeAccess(actor, nodeId);
    }

    return this.techniciansService.createBatchProvision(
      request.auth!.userId,
      body,
      resolveClientIp(request),
    );
  }

  @Post('batch-password-reset')
  @RequirePermissions('technicians.password_reset.run')
  async createBatchPasswordReset(
    @Body() body: BatchPasswordResetTechnicianDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = getAccessActor(request);

    for (const nodeId of body.node_ids) {
      await this.accessPolicy.assertNodeAccess(actor, nodeId);
    }

    return this.techniciansService.createBatchPasswordReset(
      request.auth!.userId,
      body,
      resolveClientIp(request),
    );
  }
}
