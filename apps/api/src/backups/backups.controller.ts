import {
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';

import { getAccessActor } from '../auth/access-actor.util';
import { AccessPolicyService } from '../auth/access-policy.service';
import { MfaEnrollmentGuard } from '../auth/mfa-enrollment.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { resolveClientIp } from '../common/client-ip';
import { BackupsCommandService } from './backups-command.service';
import { BackupsDownloadService } from './backups-download.service';

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/nodes/:id/config-backups')
export class BackupsController {
  constructor(
    private readonly downloadService: BackupsDownloadService,
    private readonly commandService: BackupsCommandService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  @Get()
  @RequirePermissions('backups.view')
  async listBackups(
    @Param('id') nodeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.downloadService.listBackups(nodeId);
  }

  @Get('requests/:commandId')
  @RequirePermissions('backups.view')
  async getRequestStatus(
    @Param('id') nodeId: string,
    @Param('commandId') commandId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.commandService.getCommandStatus(nodeId, commandId);
  }

  @Post('request')
  @RequirePermissions('backups.run')
  async requestBackup(
    @Param('id') nodeId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);

    return this.commandService.requestBackupNow({
      nodeId,
      requestedByUserId: request.auth!.userId,
      ipAddress: resolveClientIp(request),
    });
  }

  @Get(':backupId/download')
  @RequirePermissions('backups.download')
  async downloadBackup(
    @Param('id') nodeId: string,
    @Param('backupId') backupId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);

    const result = await this.downloadService.downloadBackup({
      nodeId,
      backupId,
      userId: request.auth!.userId,
      actorRole: request.auth!.role as string,
      ipAddress: resolveClientIp(request),
    });

    reply.header('content-type', 'application/xml; charset=utf-8');
    reply.header(
      'content-disposition',
      `attachment; filename="${result.backup_uid}.xml"`,
    );
    reply.header('x-config-sha256', result.config_sha256);
    reply.header('x-backup-received-at', result.received_at);

    return result.xmlBytes;
  }
}
