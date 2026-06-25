import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { getAccessActor } from '../auth/access-actor.util';
import { MfaEnrollmentGuard } from '../auth/mfa-enrollment.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { ListNodesQueryDto } from './dto/list-nodes-query.dto';
import { NodesService } from './nodes.service';

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/nodes')
export class NodesController {
  constructor(private readonly nodesService: NodesService) {}

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
}
