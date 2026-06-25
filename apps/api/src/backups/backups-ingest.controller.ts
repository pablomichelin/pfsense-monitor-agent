import {
  Body,
  Controller,
  Headers,
  InternalServerErrorException,
  Post,
  Req,
} from '@nestjs/common';
import { BackupsCommandService } from './backups-command.service';
import { NodeCommandsService } from '../node-commands/node-commands.service';
import { BackupsIngestService } from './backups-ingest.service';
import { CommandAckDto } from './dto/command-ack.dto';
import { CommandResultDto } from './dto/command-result.dto';
import { NodeRequestAuthService } from '../common/node-request-auth.service';
import { resolveClientIp } from '../common/client-ip';
import { RawBodyRequest } from '../common/raw-body-request.type';

const readRawBody = (request: RawBodyRequest): Buffer => {
  if (!request.rawBody) {
    throw new InternalServerErrorException('raw body capture is not enabled');
  }

  return typeof request.rawBody === 'string'
    ? Buffer.from(request.rawBody, 'utf8')
    : request.rawBody;
};

@Controller('api/v1/ingest')
export class BackupsIngestController {
  constructor(
    private readonly ingestService: BackupsIngestService,
    private readonly commandService: BackupsCommandService,
    private readonly nodeCommandsService: NodeCommandsService,
    private readonly nodeRequestAuth: NodeRequestAuthService,
  ) {}

  @Post('config-backup')
  async configBackup(
    @Req() request: RawBodyRequest,
    @Headers('x-node-uid') nodeUid?: string,
    @Headers('x-timestamp') timestamp?: string,
    @Headers('x-signature') signature?: string,
    @Headers('x-config-sha256') configSha256?: string,
    @Headers('x-config-size') configSize?: string,
    @Headers('x-backup-id') backupId?: string,
    @Headers('x-command-id') commandId?: string,
    @Headers('x-agent-version') agentVersion?: string,
    @Headers('x-pfsense-version') pfsenseVersion?: string,
    @Headers('x-config-compression') configCompression?: string,
    @Headers('x-config-backup-enabled') configBackupEnabled?: string,
    @Headers('x-config-backup-schedule-mode') configBackupScheduleMode?: string,
    @Headers('x-config-backup-interval-hours') configBackupIntervalHours?: string,
    @Headers('x-config-backup-schedule-time') configBackupScheduleTime?: string,
    @Headers('x-config-backup-schedule-dow') configBackupScheduleDow?: string,
    @Headers('x-config-backup-schedule-dom') configBackupScheduleDom?: string,
    @Headers('content-type') contentType?: string,
  ) {
    return this.ingestService.ingestConfigBackup({
      rawBody: readRawBody(request),
      headerNodeUid: nodeUid,
      headerTimestamp: timestamp,
      headerSignature: signature,
      headerConfigSha256: configSha256,
      headerConfigSize: configSize,
      headerBackupId: backupId,
      headerCommandId: commandId,
      headerAgentVersion: agentVersion,
      headerPfsenseVersion: pfsenseVersion,
      headerConfigCompression: configCompression,
      headerBackupEnabled: configBackupEnabled,
      headerBackupScheduleMode: configBackupScheduleMode,
      headerBackupIntervalHours: configBackupIntervalHours,
      headerBackupScheduleTime: configBackupScheduleTime,
      headerBackupScheduleDow: configBackupScheduleDow,
      headerBackupScheduleDom: configBackupScheduleDom,
      contentType,
      clientIp: resolveClientIp(request),
    });
  }

  @Post('command-ack')
  async commandAck(
    @Body() body: CommandAckDto,
    @Req() request: RawBodyRequest,
    @Headers('x-node-uid') nodeUid?: string,
    @Headers('x-timestamp') timestamp?: string,
    @Headers('x-signature') signature?: string,
  ) {
    const receivedAt = new Date();
    const rawBody = readRawBody(request);
    const { node, credential } = await this.nodeRequestAuth.authenticateNodeRequest({
      headerNodeUid: nodeUid,
      headerTimestamp: timestamp,
      headerSignature: signature,
      rawBody,
      receivedAt,
    });

    return this.nodeCommandsService.acknowledgeCommand({
      nodeId: node.id,
      credentialId: credential.id,
      commandId: body.command_id,
      status: body.status,
      clientIp: resolveClientIp(request),
    });
  }

  @Post('command-result')
  async commandResult(
    @Body() body: CommandResultDto,
    @Req() request: RawBodyRequest,
    @Headers('x-node-uid') nodeUid?: string,
    @Headers('x-timestamp') timestamp?: string,
    @Headers('x-signature') signature?: string,
  ) {
    const receivedAt = new Date();
    const rawBody = readRawBody(request);
    const { node, credential } = await this.nodeRequestAuth.authenticateNodeRequest({
      headerNodeUid: nodeUid,
      headerTimestamp: timestamp,
      headerSignature: signature,
      rawBody,
      receivedAt,
    });

    return this.nodeCommandsService.reportCommandResult({
      nodeId: node.id,
      credentialId: credential.id,
      commandId: body.command_id,
      status: body.status,
      errorMessage: body.error_message,
      resultJson: body.result_json,
      clientIp: resolveClientIp(request),
    });
  }
}
