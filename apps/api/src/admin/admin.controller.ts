import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { RawBodyRequest } from '../common/raw-body-request.type';
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
import { UpdateClientDto } from './dto/update-client.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateAgentTokenDto } from './dto/create-agent-token.dto';

@Roles(UserRole.superadmin, UserRole.admin)
@UseGuards(SessionAuthGuard, RolesGuard)
@Controller('api/v1/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @Roles(UserRole.superadmin)
  listUsers() {
    return this.adminService.listUsers();
  }

  @Get('audit')
  listAuditLogs(@Query() query: ListAuditLogsQueryDto) {
    return this.adminService.listAuditLogs(query);
  }

  @Post('users')
  @Roles(UserRole.superadmin)
  createUser(
    @Body() body: CreateUserDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.createUser(
      body,
      request.auth?.userId,
      cfConnectingIp ?? request.ip,
    );
  }

  @Post('users/:id')
  @Roles(UserRole.superadmin)
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
      cfConnectingIp ?? request.ip,
    );
  }

  @Get('users/:id/sessions')
  @Roles(UserRole.superadmin)
  listUserSessions(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminService.listUserSessions(id, {
      actorSessionId: request.auth!.sessionId,
    });
  }

  @Post('users/:id/sessions/:sessionId/revoke')
  @Roles(UserRole.superadmin)
  revokeUserSession(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.revokeUserSession(id, sessionId, {
      actorId: request.auth!.userId,
      actorSessionId: request.auth!.sessionId,
      ipAddress: cfConnectingIp ?? request.ip,
    });
  }

  @Post('clients')
  createClient(
    @Body() body: CreateClientDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.createClient(
      body,
      request.auth?.userId,
      cfConnectingIp ?? request.ip,
    );
  }

  @Post('clients/:id')
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
      cfConnectingIp ?? request.ip,
    );
  }

  @Post('sites')
  createSite(
    @Body() body: CreateSiteDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.createSite(
      body,
      request.auth?.userId,
      cfConnectingIp ?? request.ip,
    );
  }

  @Post('sites/:id')
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
      cfConnectingIp ?? request.ip,
    );
  }

  @Post('nodes')
  createNode(
    @Body() body: CreateNodeDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.createNode(
      body,
      request.auth?.userId,
      cfConnectingIp ?? request.ip,
    );
  }

  @Post('nodes/:id/rekey')
  rotateNodeSecret(
    @Param('id') id: string,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.adminService.rotateNodeSecret(
      id,
      request.auth?.userId,
      cfConnectingIp ?? request.ip,
    );
  }

  @Post('nodes/:id')
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
      cfConnectingIp ?? request.ip,
    );
  }

  @Post('nodes/:id/maintenance')
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
      cfConnectingIp ?? request.ip,
    );
  }

  @Get('nodes/:id/agent-tokens')
  listAgentTokens(@Param('id') id: string) {
    return this.adminService.listAgentTokens(id);
  }

  @Post('nodes/:id/agent-tokens')
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
      cfConnectingIp ?? request.ip,
    );
  }

  @Post('nodes/:id/agent-tokens/:tokenId/revoke')
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
      cfConnectingIp ?? request.ip,
    );
  }

  @Get('nodes/:id/bootstrap-command')
  getBootstrapCommand(
    @Param('id') id: string,
    @Query('release_base_url') releaseBaseUrl?: string,
    @Query('controller_url') controllerUrl?: string,
  ) {
    return this.adminService.getBootstrapCommand(id, releaseBaseUrl, controllerUrl);
  }
}
