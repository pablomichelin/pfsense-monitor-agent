import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  InternalServerErrorException,
  Post,
  Req,
} from '@nestjs/common';
import { IngestService } from './ingest.service';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { RawBodyRequest } from '../common/raw-body-request.type';

const readHeader = (value?: string | string[]): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

@Controller('api/v1/ingest')
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post('heartbeat')
  async heartbeat(
    @Body() body: HeartbeatDto,
    @Req() request: RawBodyRequest<HeartbeatDto>,
    @Headers('x-node-uid') nodeUid?: string,
    @Headers('x-timestamp') timestamp?: string,
    @Headers('x-signature') signature?: string,
  ): Promise<{
    ok: true;
    server_time: string;
    node_status: string;
  }> {
    if (!request.rawBody) {
      throw new InternalServerErrorException('raw body capture is not enabled');
    }

    const rawBody =
      typeof request.rawBody === 'string'
        ? Buffer.from(request.rawBody, 'utf8')
        : request.rawBody;

    return this.ingestService.ingestHeartbeat({
      body,
      rawBody,
      headerNodeUid: nodeUid,
      headerTimestamp: timestamp,
      headerSignature: signature,
      clientIp: readHeader(request.headers['cf-connecting-ip']) ?? request.ip,
      cfRay: readHeader(request.headers['cf-ray']),
    });
  }

  @Post('test-connection')
  async testConnection(
    @Req() request: RawBodyRequest,
    @Headers('x-node-uid') nodeUid?: string,
    @Headers('x-timestamp') timestamp?: string,
    @Headers('x-signature') signature?: string,
  ): Promise<{
    ok: true;
    message: 'connection validated';
    server_time: string;
    node_status: string;
    node_uid_status: string;
  }> {
    const rawBody =
      request.rawBody === undefined
        ? Buffer.alloc(0)
        : typeof request.rawBody === 'string'
          ? Buffer.from(request.rawBody, 'utf8')
          : request.rawBody;

    if (rawBody.byteLength > 0) {
      throw new BadRequestException('test-connection does not accept a request body');
    }

    return this.ingestService.testConnection({
      rawBody,
      headerNodeUid: nodeUid,
      headerTimestamp: timestamp,
      headerSignature: signature,
      clientIp: readHeader(request.headers['cf-connecting-ip']) ?? request.ip,
      cfRay: readHeader(request.headers['cf-ray']),
    });
  }
}
