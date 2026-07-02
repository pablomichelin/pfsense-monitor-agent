import { Controller, Get, Param, Patch, Body, Query, Req, UseGuards } from '@nestjs/common';
import { getAccessActor } from '../auth/access-actor.util';
import { MfaEnrollmentGuard } from '../auth/mfa-enrollment.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { resolveClientIp } from '../common/client-ip';
import { UpdateNodeFleetMetadataDto } from '../fleet-org/dto/node-fleet-metadata.dto';
import { NodeFleetMetadataService } from '../fleet-org/node-fleet-metadata.service';
import { ListNodesQueryDto } from './dto/list-nodes-query.dto';
import { NodesService } from './nodes.service';

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/nodes')
export class NodesController {
  constructor(
    private readonly nodesService: NodesService,
    private readonly nodeFleetMetadataService: NodeFleetMetadataService,
  ) {}

  @Get('filters')
  @RequirePermissions('firewalls.view')
  getFilters(@Req() request: AuthenticatedRequest) {
    return this.nodesService.getFilters(getAccessActor(request));
  }

  @Get()
  @RequirePermissions('firewalls.view')
  listNodes(
    @Query() query: ListNodesQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.nodesService.listNodes(getAccessActor(request), query);
  }

  @Get(':id')
  @RequirePermissions('firewalls.view')
  getNodeById(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.nodesService.getNodeById(getAccessActor(request), id);
  }

  @Patch(':id/fleet-metadata')
  @RequirePermissions('firewalls.update')
  updateNodeFleetMetadata(
    @Param('id') id: string,
    @Body() body: UpdateNodeFleetMetadataDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.nodeFleetMetadataService.updateNodeFleetMetadata(
      getAccessActor(request),
      id,
      body,
      request.auth?.userId,
      resolveClientIp(request),
    );
  }
}
