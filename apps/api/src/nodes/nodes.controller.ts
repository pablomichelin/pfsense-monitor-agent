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
import { BackupFleetQueryDto } from './dto/backup-fleet-query.dto';
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

  @Get('backup-fleet')
  @RequirePermissions('backups.view')
  getBackupFleet(@Query() query: BackupFleetQueryDto, @Req() request: AuthenticatedRequest) {
    return this.nodesService.getBackupFleet(getAccessActor(request), query);
  }

  @Get('backup-filters')
  @RequirePermissions('backups.view')
  async getBackupFilters(@Req() request: AuthenticatedRequest) {
    const { generated_at, clients, sites } = await this.nodesService.getFilters(getAccessActor(request));
    return { generated_at, clients, sites };
  }

  @Get('bootstrap-inventory')
  @RequirePermissions('bootstrap.view')
  async getBootstrapInventory(@Query() query: ListNodesQueryDto, @Req() request: AuthenticatedRequest) {
    const actor = getAccessActor(request);
    const { client_id, site_id, search, bootstrap_bucket, limit, cursor } = query;
    const [{ items, ...page }, { clients, sites }] = await Promise.all([
      this.nodesService.listNodes(actor, { client_id, site_id, search, bootstrap_bucket, limit, cursor }),
      this.nodesService.getFilters(actor),
    ]);
    return {
      nodes: {
        ...page,
        items: items.map((node) => ({
          id: node.id,
          node_uid: node.node_uid,
          node_uid_status: node.node_uid_status,
          hostname: node.hostname,
          display_name: node.display_name,
          client: { name: node.client.name },
          site: { name: node.site.name },
          pfsense_version: node.pfsense_version,
          agent_version: node.agent_version,
          last_seen_at: node.last_seen_at,
        })),
      },
      filters: {
        clients: clients.map(({ id, name, node_count }) => ({ id, name, node_count })),
        sites: sites.map(({ id, name, client_id, client_name, node_count }) =>
          ({ id, name, client_id, client_name, node_count })),
      },
    };
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
