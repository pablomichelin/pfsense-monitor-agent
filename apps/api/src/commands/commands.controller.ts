import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { getAccessActor } from '../auth/access-actor.util';
import { AccessPolicyService } from '../auth/access-policy.service';
import { MfaEnrollmentGuard } from '../auth/mfa-enrollment.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionsService } from '../auth/permissions.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { resolveClientIp } from '../common/client-ip';
import { CommandOrchestratorService } from './command-orchestrator.service';
import {
  CreateCommandBatchDto,
  ListNodeCommandsQueryDto,
} from './dto/commands.dto';
import { getCommandPermission } from './command-registry';

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/nodes/:nodeId/commands')
export class NodeCommandsController {
  constructor(
    private readonly orchestrator: CommandOrchestratorService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get('history')
  @RequirePermissions('firewalls.view')
  async listHistory(
    @Param('nodeId') nodeId: string,
    @Query() query: ListNodeCommandsQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.orchestrator.listNodeCommandHistory({
      nodeId,
      limit: query.limit,
      type: query.type,
    });
  }

  @Get(':commandId')
  @RequirePermissions('firewalls.view')
  async getCommand(
    @Param('nodeId') nodeId: string,
    @Param('commandId') commandId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.orchestrator.getCommandDetail(nodeId, commandId);
  }

  @Post(':commandId/cancel')
  async cancelCommand(
    @Param('nodeId') nodeId: string,
    @Param('commandId') commandId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);

    const detail = await this.orchestrator.getCommandDetail(nodeId, commandId);
    const permission = getCommandPermission(detail.command.type);

    await this.permissionsService.assertPermission(
      request.auth!.role,
      permission,
    );

    return this.orchestrator.cancelCommand({
      nodeId,
      commandId,
      cancelledByUserId: request.auth!.userId,
      ipAddress: resolveClientIp(request),
    });
  }
}

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/command-batches')
export class CommandBatchesController {
  constructor(
    private readonly orchestrator: CommandOrchestratorService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Post()
  async createBatch(
    @Body() body: CreateCommandBatchDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const permission = getCommandPermission(body.command_type);
    await this.permissionsService.assertPermission(
      request.auth!.role,
      permission,
    );

    const actor = getAccessActor(request);
    for (const nodeId of body.node_ids) {
      await this.accessPolicy.assertNodeAccess(actor, nodeId);
    }

    return this.orchestrator.createBatch({
      commandType: body.command_type,
      nodeIds: body.node_ids,
      requestedByUserId: request.auth!.userId,
      label: body.label,
      clientId: body.client_id,
      idempotencyPrefix: body.idempotency_prefix,
      ipAddress: resolveClientIp(request),
    });
  }

  @Get('registry')
  @RequirePermissions('firewalls.view')
  getRegistry() {
    return this.orchestrator.getRegistrySummary();
  }

  @Get(':batchId')
  @RequirePermissions('firewalls.view')
  async getBatch(
    @Param('batchId') batchId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const batch = await this.orchestrator.getBatchStatus(batchId);

    const actor = getAccessActor(request);
    for (const node of batch.nodes) {
      await this.accessPolicy.assertNodeAccess(actor, node.node_id);
    }

    return batch;
  }
}
