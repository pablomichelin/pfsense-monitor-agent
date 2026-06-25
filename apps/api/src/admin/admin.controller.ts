import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { resolveClientIp } from '../common/client-ip';
import { RawBodyRequest } from '../common/raw-body-request.type';
import { getAccessActor } from '../auth/access-actor.util';
import { RequirePermissions } from '../auth/permissions.decorator';
import { MfaEnrollmentGuard } from '../auth/mfa-enrollment.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AdminService } from './admin.service';
import { CreateClientDto } from './dto/create-client.dto';
import { CreateNodeDto } from './dto/create-node.dto';
import { CreateSiteDto } from './dto/create-site.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { SetNodeMaintenanceDto } from './dto/set-node-maintenance.dto';
import { SetUserClientScopesDto } from './dto/set-user-client-scopes.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateAgentTokenDto } from './dto/create-agent-token.dto';
import { DeleteNodesBatchDto } from './dto/delete-nodes-batch.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';

@Roles('superadmin', 'admin')
@UseGuards(SessionAuthGuard, RolesGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('permissions-matrix')
  @RequirePermissions('users.view')
  listPermissionsMatrix() {
    return this.adminService.listPermissionsMatrix();
  }

  @Get('roles')
  @RequirePermissions('users.view')
  listRoles() {
    return this.adminService.listRoles();
  }

  @Post('roles')
  @RequirePermissions('roles.manage')
  createRole(
    @Body() body: CreateRoleDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.createRole(
      body,
      request.auth?.userId,
      resolveClientIp(request),
    );
  }

  @Delete('roles/:code')
  @RequirePermissions('roles.manage')
  deleteRole(
    @Param('code') code: string,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.deleteRole(
      code,
      request.auth?.userId,
      resolveClientIp(request),
    );
  }

  @Post('roles/:code/permissions')
  @RequirePermissions('roles.manage')
  setRolePermissions(
    @Param('code') code: string,
    @Body() body: SetRolePermissionsDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.setRolePermissions(
      code,
      body,
      request.auth?.userId,
      resolveClientIp(request),
    );
  }

  @Get('users')
  @Roles('superadmin')
  @RequirePermissions('users.view')
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Delete('users/:id')
  @Roles('superadmin')
  @RequirePermissions('users.delete')
  deleteUser(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.deleteUser(
      id,
      request.auth?.userId,
      resolveClientIp(request),
    );
  }

  @Get('audit')
  @RequirePermissions('audit.view')
  listAuditLogs(
    @Query() query: ListAuditLogsQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminService.listAuditLogs(getAccessActor(request), query);
  }

  @Post('users')
  @Roles('superadmin')
  @RequirePermissions('users.create')
  createUser(
    @Body() body: CreateUserDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.createUser(
      body,
      request.auth?.userId,
      resolveClientIp(request),
    );
  }

  @Post('users/:id')
  @Roles('superadmin')
  @RequirePermissions('users.update')
  updateUser(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.updateUser(
      id,
      body,
      request.auth?.userId,
      resolveClientIp(request),
    );
  }

  @Get('users/:id/client-scopes')
  @Roles('superadmin')
  @RequirePermissions('users.view')
  listUserClientScopes(@Param('id') id: string) {
    return this.adminService.listUserClientScopes(id);
  }

  @Post('users/:id/client-scopes')
  @Roles('superadmin')
  @RequirePermissions('users.update')
  setUserClientScopes(
    @Param('id') id: string,
    @Body() body: SetUserClientScopesDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.setUserClientScopes(
      id,
      body,
      request.auth?.userId,
      resolveClientIp(request),
    );
  }

  @Get('users/:id/sessions')
  @Roles('superadmin')
  @RequirePermissions('users.view')
  listUserSessions(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminService.listUserSessions(id, {
      actorSessionId: request.auth!.sessionId,
    });
  }

  @Post('users/:id/sessions/:sessionId/revoke')
  @Roles('superadmin')
  @RequirePermissions('users.update')
  revokeUserSession(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.revokeUserSession(id, sessionId, {
      actorId: request.auth!.userId,
      actorSessionId: request.auth!.sessionId,
      ipAddress: resolveClientIp(request),
    });
  }

  @Post('clients')
  @RequirePermissions('clients.create')
  createClient(
    @Body() body: CreateClientDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.createClient(
      body,
      request.auth?.userId,
      resolveClientIp(request),
      getAccessActor(request),
    );
  }

  @Post('clients/:id')
  @RequirePermissions('clients.update')
  updateClient(
    @Param('id') id: string,
    @Body() body: UpdateClientDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.updateClient(
      id,
      body,
      request.auth?.userId,
      resolveClientIp(request),
      getAccessActor(request),
    );
  }

  @Delete('clients/:id')
  @RequirePermissions('clients.delete')
  deleteClient(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.deleteClient(
      id,
      request.auth?.userId,
      resolveClientIp(request),
      getAccessActor(request),
    );
  }

  @Post('sites')
  @RequirePermissions('clients.create')
  createSite(
    @Body() body: CreateSiteDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.createSite(
      body,
      request.auth?.userId,
      resolveClientIp(request),
      getAccessActor(request),
    );
  }

  @Post('sites/:id')
  @RequirePermissions('clients.update')
  updateSite(
    @Param('id') id: string,
    @Body() body: UpdateSiteDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.updateSite(
      id,
      body,
      request.auth?.userId,
      resolveClientIp(request),
      getAccessActor(request),
    );
  }

  @Post('nodes')
  @RequirePermissions('firewalls.create')
  createNode(
    @Body() body: CreateNodeDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.createNode(
      body,
      request.auth?.userId,
      resolveClientIp(request),
      getAccessActor(request),
    );
  }

  @Post('nodes/delete-batch')
  @RequirePermissions('firewalls.delete')
  deleteNodesBatch(
    @Body() body: DeleteNodesBatchDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.deleteNodesBatch(
      body.ids,
      request.auth?.userId,
      resolveClientIp(request),
      getAccessActor(request),
    );
  }

  @Post('nodes/:id/rekey')
  @RequirePermissions('bootstrap.execute')
  rotateNodeSecret(
    @Param('id') id: string,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.rotateNodeSecret(
      id,
      request.auth?.userId,
      resolveClientIp(request),
      getAccessActor(request),
    );
  }

  @Post('nodes/:id')
  @RequirePermissions('firewalls.update')
  updateNode(
    @Param('id') id: string,
    @Body() body: UpdateNodeDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.updateNode(
      id,
      body,
      request.auth?.userId,
      resolveClientIp(request),
      getAccessActor(request),
    );
  }

  @Post('nodes/:id/maintenance')
  @RequirePermissions('firewalls.update')
  setNodeMaintenance(
    @Param('id') id: string,
    @Body() body: SetNodeMaintenanceDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.setNodeMaintenance(
      id,
      body.maintenance_mode,
      request.auth?.userId,
      resolveClientIp(request),
      getAccessActor(request),
    );
  }

  @Get('nodes/:id/agent-tokens')
  @RequirePermissions('firewalls.view')
  listAgentTokens(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminService.listAgentTokens(id, getAccessActor(request));
  }

  @Post('nodes/:id/agent-tokens')
  @RequirePermissions('bootstrap.execute')
  createAgentToken(
    @Param('id') id: string,
    @Body() body: CreateAgentTokenDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.createAgentToken(
      id,
      body,
      request.auth?.userId,
      resolveClientIp(request),
      getAccessActor(request),
    );
  }

  @Post('nodes/:id/agent-tokens/:tokenId/revoke')
  @RequirePermissions('bootstrap.execute')
  revokeAgentToken(
    @Param('id') id: string,
    @Param('tokenId') tokenId: string,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.revokeAgentToken(
      id,
      tokenId,
      request.auth?.userId,
      resolveClientIp(request),
      getAccessActor(request),
    );
  }

  @Get('nodes/:id/bootstrap-command')
  @RequirePermissions('bootstrap.view')
  getBootstrapCommand(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Query('release_base_url') releaseBaseUrl?: string,
    @Query('controller_url') controllerUrl?: string,
    @Query('heartbeat_mode') heartbeatMode?: string,
    @Query('config_backup_enabled') configBackupEnabled?: string,
  ) {
    return this.adminService.getBootstrapCommand(
      id,
      releaseBaseUrl,
      controllerUrl,
      heartbeatMode,
      configBackupEnabled,
      getAccessActor(request),
    );
  }

  @Delete('nodes/:id')
  @RequirePermissions('firewalls.delete')
  deleteNode(
    @Param('id') id: string,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.deleteNode(
      id,
      request.auth?.userId,
      resolveClientIp(request),
      getAccessActor(request),
    );
  }
}
