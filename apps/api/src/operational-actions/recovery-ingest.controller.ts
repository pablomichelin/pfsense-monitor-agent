import { Body, Controller, Headers, InternalServerErrorException, Post, Req } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { NodeRequestAuthService } from '../common/node-request-auth.service';
import { RawBodyRequest } from '../common/raw-body-request.type';
import { NodeCommandsService } from '../node-commands/node-commands.service';
import { PrismaService } from '../prisma/prisma.service';
class RecoveryPollDto {
  @IsIn(['0.5.30'])
  version!: string;
}
@Controller('api/v1/ingest')
export class RecoveryIngestController {
  constructor(private readonly auth: NodeRequestAuthService, private readonly prisma: PrismaService,
    private readonly commands: NodeCommandsService) {}

  @Post('recovery-poll')
  async poll(@Body() body: RecoveryPollDto, @Req() request: RawBodyRequest,
    @Headers('x-node-uid') uid?: string, @Headers('x-timestamp') timestamp?: string,
    @Headers('x-signature') signature?: string) {
    if (!request.rawBody) throw new InternalServerErrorException('raw body capture is not enabled');
    const {node} = await this.auth.authenticateNodeRequest({headerNodeUid: uid, headerTimestamp: timestamp,
      headerSignature: signature, rawBody: Buffer.from(request.rawBody), receivedAt: new Date()});
    await this.prisma.node.update({where: {id: node.id}, data: {recoveryVersion: body.version, recoverySeenAt: new Date()}});
    return {commands: await this.commands.getPendingCommandsForNode(node.id, 'supervisor_v1')};
  }
}
