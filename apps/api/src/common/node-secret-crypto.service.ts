import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { appConfig } from '../config/app-config';

@Injectable()
export class NodeSecretCryptoService {
  private readonly algorithm = 'aes-256-gcm';

  encrypt(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      this.algorithm,
      appConfig.nodeSecretEncryptionKey,
      iv,
    );

    const ciphertext = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      iv.toString('base64'),
      authTag.toString('base64'),
      ciphertext.toString('base64'),
    ].join('.');
  }

  decrypt(payload: string): string {
    const [ivEncoded, authTagEncoded, ciphertextEncoded] = payload.split('.');
    if (!ivEncoded || !authTagEncoded || !ciphertextEncoded) {
      throw new Error('Invalid encrypted node secret payload');
    }

    const decipher = createDecipheriv(
      this.algorithm,
      appConfig.nodeSecretEncryptionKey,
      Buffer.from(ivEncoded, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagEncoded, 'base64'));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, 'base64')),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }
}

