import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
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
import { BackupsDiffService } from './backups-diff.service';
import { BackupsDownloadService } from './backups-download.service';
import { BackupsDriftService } from './backups-drift.service';
import { BackupsPolicyService } from './backups-policy.service';
import { UpdateBackupRetentionPolicyDto } from './dto/update-backup-retention-policy.dto';

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/nodes/:id/config-backups')
export class BackupsController {
  constructor(
    private readonly downloadService: BackupsDownloadService,
    private readonly commandService: BackupsCommandService,
    private readonly diffService: BackupsDiffService,
    private readonly driftService: BackupsDriftService,
    private readonly policyService: BackupsPolicyService,
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

  @Get('drift')
  @RequirePermissions('backups.view')
  async getDriftStatus(
    @Param('id') nodeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.driftService.getDriftStatus(nodeId);
  }

  @Post('drift/acknowledge')
  @RequirePermissions('backups.manage')
  async acknowledgeDrift(
    @Param('id') nodeId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.driftService.acknowledgeDrift({
      nodeId,
      userId: request.auth!.userId,
      actorRole: request.auth!.role as string,
      ipAddress: resolveClientIp(request),
    });
  }

  @Get('retention-policy')
  @RequirePermissions('backups.view')
  async getRetentionPolicy(
    @Param('id') nodeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.policyService.getRetentionPolicy(nodeId);
  }

  @Patch('retention-policy')
  @RequirePermissions('backups.manage')
  async updateRetentionPolicy(
    @Param('id') nodeId: string,
    @Body() body: UpdateBackupRetentionPolicyDto,
    @Req() request: AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.policyService.updateRetentionPolicy({
      nodeId,
      userId: request.auth!.userId,
      actorRole: request.auth!.role as string,
      ipAddress: resolveClientIp(request),
      retention_count: body.retention_count,
      retention_max_bytes: body.retention_max_bytes,
    });
  }

  @Get('diff')
  @RequirePermissions('backups.view')
  async diffBackups(
    @Param('id') nodeId: string,
    @Query('from') fromBackupId: string,
    @Query('to') toBackupId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);

    if (!fromBackupId?.trim() || !toBackupId?.trim()) {
      throw new BadRequestException('query params from and to are required');
    }

    return this.diffService.compareBackups({
      nodeId,
      fromBackupId: fromBackupId.trim(),
      toBackupId: toBackupId.trim(),
      userId: request.auth!.userId,
      actorRole: request.auth!.role as string,
      ipAddress: resolveClientIp(request),
    });
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

  @Get(':backupId/export-guide')
  @RequirePermissions('backups.download')
  async exportGuide(
    @Param('id') nodeId: string,
    @Param('backupId') backupId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);

    return this.diffService.buildExportGuide({
      nodeId,
      backupId,
      userId: request.auth!.userId,
      actorRole: request.auth!.role as string,
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
