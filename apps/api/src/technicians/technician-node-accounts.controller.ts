import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { getAccessActor } from '../auth/access-actor.util';
import { AccessPolicyService } from '../auth/access-policy.service';
import { MfaEnrollmentGuard } from '../auth/mfa-enrollment.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { resolveClientIp } from '../common/client-ip';
import { DeleteTechnicianAccountDto, PasswordResetTechnicianAccountDto, ProvisionTechnicianAccountDto } from './dto/technicians.dto';
import { TechniciansService } from './technicians.service';

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/nodes/:id/technician-accounts')
export class TechnicianNodeAccountsController {
  constructor(
    private readonly techniciansService: TechniciansService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  @Get()
  @RequirePermissions('technicians.view')
  async listAccounts(
    @Param('id') nodeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.techniciansService.listNodeAccounts(nodeId);
  }

  @Post()
  @RequirePermissions('technicians.manage')
  async provisionAccount(
    @Param('id') nodeId: string,
    @Body() body: ProvisionTechnicianAccountDto,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.techniciansService.provisionNodeAccount(
      nodeId,
      request.auth!.userId,
      body,
      resolveClientIp(request),
    );
  }

  @Post(':accountId/password-reset')
  @RequirePermissions('technicians.password_reset.run')
  async resetPassword(
    @Param('id') nodeId: string,
    @Param('accountId') accountId: string,
    @Body() body: PasswordResetTechnicianAccountDto,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.techniciansService.resetNodeAccountPassword(
      nodeId,
      accountId,
      request.auth!.userId,
      body,
      resolveClientIp(request),
    );
  }

  @Post(':accountId/disable')
  @RequirePermissions('technicians.manage')
  async disableAccount(
    @Param('id') nodeId: string,
    @Param('accountId') accountId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.techniciansService.disableNodeAccount(
      nodeId,
      accountId,
      request.auth!.userId,
      resolveClientIp(request),
    );
  }

  @Delete(':accountId')
  @RequirePermissions('technicians.manage')
  async deleteAccount(
    @Param('id') nodeId: string,
    @Param('accountId') accountId: string,
    @Body() body: DeleteTechnicianAccountDto,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.techniciansService.deleteNodeAccount(
      nodeId,
      accountId,
      request.auth!.userId,
      body,
      resolveClientIp(request),
    );
  }
}
