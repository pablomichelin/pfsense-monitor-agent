import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { NodeUidStatus } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { appConfig } from '../config/app-config';
import { NodeSecretCryptoService } from './node-secret-crypto.service';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthenticatedNodeRequest {
  headerNodeUid: string;
  node: Awaited<ReturnType<NodeRequestAuthService['findNodeForAuth']>>;
  credential: NonNullable<
    Awaited<ReturnType<NodeRequestAuthService['findNodeForAuth']>>['credentials'][number]
  >;
}

@Injectable()
export class NodeRequestAuthService {
  private readonly logger = new Logger(NodeRequestAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nodeSecretCrypto: NodeSecretCryptoService,
  ) {}

  requireHeader(name: string, value?: string): string {
    if (!value) {
      throw new BadRequestException(`${name} header is required`);
    }

    return value;
  }

  parseIsoDate(rawValue: string, fieldName: string): Date {
    const parsed = new Date(rawValue);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid ISO-8601 date`);
    }

    return parsed;
  }

  assertTimestampWindow(timestamp: Date, receivedAt: Date): void {
    const differenceSeconds =
      Math.abs(receivedAt.getTime() - timestamp.getTime()) / 1000;

    if (differenceSeconds > appConfig.heartbeat.maxSkewSeconds) {
      throw new UnauthorizedException('timestamp outside allowed window');
    }
  }

  assertSignature(
    encryptedSecret: string,
    timestamp: string,
    rawBody: Buffer,
    providedSignature: string,
    nodeUidForLog?: string,
  ): void {
    let secret: string;

    try {
      secret = this.nodeSecretCrypto.decrypt(encryptedSecret);
    } catch (error) {
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'unable to decrypt node secret',
      );
    }

    const payload = Buffer.concat([
      Buffer.from(timestamp, 'utf8'),
      Buffer.from('\n', 'utf8'),
      rawBody,
    ]);

    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    const normalizedProvided = providedSignature
      .trim()
      .toLowerCase()
      .replace(/^sha256=/, '');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const providedBuffer = Buffer.from(normalizedProvided, 'utf8');

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      this.logger.warn(
        `node request signature mismatch node_uid=${nodeUidForLog ?? '?'} rawBody_len=${rawBody.byteLength}`,
      );
      throw new UnauthorizedException('invalid node request signature');
    }
  }

  async authenticateNodeRequest(input: {
    headerNodeUid?: string;
    headerTimestamp?: string;
    headerSignature?: string;
    rawBody: Buffer;
    receivedAt: Date;
  }): Promise<AuthenticatedNodeRequest> {
    const headerNodeUid = this.requireHeader('X-Node-Uid', input.headerNodeUid);
    const headerTimestampRaw = this.requireHeader(
      'X-Timestamp',
      input.headerTimestamp,
    );
    const headerTimestamp = this.parseIsoDate(
      headerTimestampRaw,
      'X-Timestamp',
    );
    const headerSignature = this.requireHeader(
      'X-Signature',
      input.headerSignature,
    );

    this.assertTimestampWindow(headerTimestamp, input.receivedAt);

    const node = await this.findNodeForAuth(headerNodeUid, input.receivedAt);
    const credential = node.credentials[0];
    if (!credential) {
      throw new ForbiddenException('active node credential not found');
    }

    this.assertSignature(
      credential.secretEncrypted,
      headerTimestampRaw,
      input.rawBody,
      headerSignature,
      headerNodeUid,
    );

    await this.assertNotReplay(
      node.id,
      headerSignature,
      input.receivedAt,
      headerNodeUid,
    );

    return {
      headerNodeUid,
      node,
      credential,
    };
  }

  /**
   * C2: anti-replay. Registra a assinatura ja vista por node (unique). Uma assinatura
   * repetida dentro da janela e rejeitada. O TTL = janela de skew, pois fora dela a
   * verificacao de timestamp ja rejeita. Usa PostgreSQL (sem Redis).
   */
  async assertNotReplay(
    nodeId: string,
    providedSignature: string,
    receivedAt: Date,
    nodeUidForLog?: string,
  ): Promise<void> {
    const normalized = providedSignature
      .trim()
      .toLowerCase()
      .replace(/^sha256=/, '');
    const signatureHash = createHash('sha256').update(normalized).digest('hex');

    // Janela dobrada para cobrir skew em ambos os sentidos.
    const ttlMs = appConfig.heartbeat.maxSkewSeconds * 2 * 1000;
    const expiresAt = new Date(receivedAt.getTime() + ttlMs);

    // Limpeza oportunista de nonces expirados (baixa frequencia para nao onerar).
    if (Math.random() < 0.02) {
      try {
        await this.prisma.nodeRequestNonce.deleteMany({
          where: { expiresAt: { lt: receivedAt } },
        });
      } catch {
        // limpeza best-effort; nao bloqueia o request
      }
    }

    try {
      await this.prisma.nodeRequestNonce.create({
        data: { nodeId, signatureHash, expiresAt },
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        (error as { code?: string }).code === 'P2002'
      ) {
        this.logger.warn(
          `node request replay detected node_uid=${nodeUidForLog ?? '?'}`,
        );
        throw new UnauthorizedException('replayed node request signature');
      }
      throw error;
    }
  }

  async findNodeForAuth(nodeUid: string, receivedAt: Date) {
    const node = await this.prisma.node.findUnique({
      where: {
        nodeUid,
      },
      include: {
        credentials: {
          where: {
            status: 'active',
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    if (!node) {
      throw new UnauthorizedException('unknown node');
    }

    if (node.nodeUidStatus === NodeUidStatus.conflict) {
      await this.ensureNodeUidConflictAlert(node.id, receivedAt);
      throw new ConflictException('node_uid conflict');
    }

    return node;
  }

  private async ensureNodeUidConflictAlert(
    nodeId: string,
    observedAt: Date,
  ): Promise<void> {
    const fingerprint = `node_uid_conflict:${nodeId}`;
    const existing = await this.prisma.alert.findUnique({
      where: {
        fingerprint,
      },
    });

    if (!existing) {
      await this.prisma.alert.create({
        data: {
          nodeId,
          fingerprint,
          type: 'node_uid_conflict',
          severity: 'critical',
          title: 'node_uid conflict detected',
          description:
            'The server marked this node as conflicting and requires rekey or rebootstrap.',
          status: 'open',
          openedAt: observedAt,
          metadataJson: {
            node_id: nodeId,
          },
        },
      });
      return;
    }

    await this.prisma.alert.update({
      where: {
        id: existing.id,
      },
      data: {
        severity: 'critical',
        title: 'node_uid conflict detected',
        description:
          'The server marked this node as conflicting and requires rekey or rebootstrap.',
        status: 'open',
        openedAt:
          existing.status === 'resolved' ? observedAt : existing.openedAt,
        resolvedAt: null,
        resolutionNote: null,
      },
    });
  }
}
