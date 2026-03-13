import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const PASSWORD_HASH_PREFIX = 'scrypt';
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_BYTES = 64;

export const hashPassword = (password: string): string => {
  const salt = randomBytes(PASSWORD_SALT_BYTES);
  const derivedKey = scryptSync(password, salt, PASSWORD_KEY_BYTES);

  return [
    PASSWORD_HASH_PREFIX,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
};

export const verifyPassword = (
  password: string,
  storedHash: string | null | undefined,
): boolean => {
  if (!storedHash) {
    return false;
  }

  const [prefix, saltEncoded, keyEncoded] = storedHash.split('$');
  if (!prefix || !saltEncoded || !keyEncoded || prefix !== PASSWORD_HASH_PREFIX) {
    return false;
  }

  const salt = Buffer.from(saltEncoded, 'base64url');
  const expectedKey = Buffer.from(keyEncoded, 'base64url');
  const derivedKey = scryptSync(password, salt, expectedKey.length);

  return (
    expectedKey.length === derivedKey.length &&
    timingSafeEqual(expectedKey, derivedKey)
  );
};
