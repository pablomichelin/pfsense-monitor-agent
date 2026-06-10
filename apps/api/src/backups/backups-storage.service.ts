import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { appConfig } from '../config/app-config';

const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

@Injectable()
export class BackupsStorageService {
  async encryptToFile(plainBytes: Buffer, absolutePath: string): Promise<void> {
    const iv = randomBytes(GCM_IV_BYTES);
    const cipher = createCipheriv(
      'aes-256-gcm',
      appConfig.backupEncryptionKey,
      iv,
    );
    const ciphertext = Buffer.concat([cipher.update(plainBytes), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, ciphertext, authTag]);

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, payload, { mode: 0o600 });
  }

  async decryptFromFile(absolutePath: string): Promise<Buffer> {
    const payload = await readFile(absolutePath);
    if (payload.byteLength < GCM_IV_BYTES + GCM_TAG_BYTES) {
      throw new InternalServerErrorException('encrypted backup payload is invalid');
    }

    const iv = payload.subarray(0, GCM_IV_BYTES);
    const authTag = payload.subarray(payload.byteLength - GCM_TAG_BYTES);
    const ciphertext = payload.subarray(
      GCM_IV_BYTES,
      payload.byteLength - GCM_TAG_BYTES,
    );

    const decipher = createDecipheriv(
      'aes-256-gcm',
      appConfig.backupEncryptionKey,
      iv,
    );
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  async removeFile(absolutePath: string): Promise<void> {
    try {
      await unlink(absolutePath);
    } catch {
      // ignore missing file during retention cleanup
    }
  }

  buildStoragePath(
    nodeUid: string,
    receivedAt: Date,
    configSha256: string,
  ): { relativePath: string; absolutePath: string } {
    const year = receivedAt.getUTCFullYear();
    const month = String(receivedAt.getUTCMonth() + 1).padStart(2, '0');
    const timestamp = receivedAt
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
    const hash8 = configSha256.slice(0, 8);
    const fileName = `cfgb_${timestamp}_${hash8}.enc`;
    const relativePath = join(nodeUid, String(year), month, fileName);

    return {
      relativePath,
      absolutePath: join(appConfig.configBackup.storageDir, relativePath),
    };
  }

  sha256Hex(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }
}
