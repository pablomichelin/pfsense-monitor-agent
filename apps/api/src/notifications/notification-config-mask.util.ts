const SECRET_FIELD_NAMES = new Set([
  'password',
  'smtp_password',
  'bot_token',
  'auth_header',
  'authorization',
  'secret',
  'api_key',
]);

export function maskSecretFields(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const masked: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_FIELD_NAMES.has(key.toLowerCase())) {
      masked[key] = entry ? '********' : null;
      continue;
    }

    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      masked[key] = maskSecretFields(entry as Record<string, unknown>);
      continue;
    }

    masked[key] = entry;
  }

  return masked;
}

export function mergePublicAndSecretConfig(
  publicConfig: Record<string, unknown>,
  secrets: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...publicConfig,
    ...secrets,
  };
}
