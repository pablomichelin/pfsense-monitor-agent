import {
  Body,
  Controller,
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
import {
  CreateBackupBatchDto,
  NodeRebootRequestDto,
  ServiceRestartRequestDto,
} from './dto/operational-actions.dto';
import { OperationalActionsService } from './operational-actions.service';

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/nodes/:id/operational-actions')
export class OperationalActionsController {
  constructor(
    private readonly actionsService: OperationalActionsService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  @Get('status')
  @RequirePermissions('firewalls.view')
  async getStatus(
    @Param('id') nodeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.actionsService.getStatus(nodeId);
  }

  @Post('service-restart')
  @RequirePermissions('service.restart.run')
  async requestServiceRestart(
    @Param('id') nodeId: string,
    @Body() body: ServiceRestartRequestDto,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.actionsService.requestServiceRestart(
      nodeId,
      request.auth!.userId,
      body,
      resolveClientIp(request),
    );
  }

  @Post('reboot')
  @RequirePermissions('node.reboot.run')
  async requestReboot(
    @Param('id') nodeId: string,
    @Body() body: NodeRebootRequestDto,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.actionsService.requestNodeReboot(
      nodeId,
      request.auth!.userId,
      body,
      resolveClientIp(request),
    );
  }
}

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/operational-actions')
export class OperationalActionsBatchController {
  constructor(
    private readonly actionsService: OperationalActionsService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  @Post('backup-batch')
  @RequirePermissions('backups.run')
  async createBackupBatch(
    @Body() body: CreateBackupBatchDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = getAccessActor(request);
    for (const nodeId of body.node_ids) {
      await this.accessPolicy.assertNodeAccess(actor, nodeId);
    }

    return this.actionsService.createBackupBatch(
      request.auth!.userId,
      body,
      resolveClientIp(request),
    );
  }
}
