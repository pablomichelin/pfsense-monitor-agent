const parseNumber = (
  input: string | undefined,
  fallback: number,
  fieldName: string,
): number => {
  if (input === undefined || input.trim() === '') {
    return fallback;
  }

  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a valid number`);
  }

  return parsed;
};

const parseBoolean = (input: string | undefined, fallback: boolean): boolean => {
  if (input === undefined || input.trim() === '') {
    return fallback;
  }

  if (input === 'true') {
    return true;
  }

  if (input === 'false') {
    return false;
  }

  throw new Error(`Expected boolean value, received "${input}"`);
};

const requireEnv = (fieldName: string): string => {
  const value = process.env[fieldName]?.trim();
  if (!value) {
    throw new Error(`${fieldName} is required`);
  }

  return value;
};

const parseEncryptionKey = (value: string): Buffer => {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'NODE_SECRET_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes',
    );
  }

  return key;
};

const parseList = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

export const appConfig = Object.freeze({
  nodeEnv: process.env.NODE_ENV?.trim() || 'development',
  port: parseNumber(process.env.PORT, 8088, 'PORT'),
  databaseUrl: requireEnv('DATABASE_URL'),
  systemVersion: process.env.SYSTEM_VERSION?.trim() || '0.1.0',
  trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
  trustedProxyIps: parseList(process.env.TRUSTED_PROXY_IPS),
  heartbeat: {
    maxPayloadBytes: 64 * 1024,
    maxSkewSeconds: parseNumber(
      process.env.HEARTBEAT_MAX_SKEW_SECONDS,
      300,
      'HEARTBEAT_MAX_SKEW_SECONDS',
    ),
  },
  nodeStatus: {
    degradedAfterSeconds: parseNumber(
      process.env.NODE_DEGRADED_AFTER_SECONDS,
      90,
      'NODE_DEGRADED_AFTER_SECONDS',
    ),
    offlineAfterSeconds: parseNumber(
      process.env.NODE_OFFLINE_AFTER_SECONDS,
      300,
      'NODE_OFFLINE_AFTER_SECONDS',
    ),
    reconcileIntervalSeconds: parseNumber(
      process.env.NODE_RECONCILE_INTERVAL_SECONDS,
      30,
      'NODE_RECONCILE_INTERVAL_SECONDS',
    ),
  },
  auth: {
    bootstrapEmail: requireEnv('AUTH_BOOTSTRAP_EMAIL').toLowerCase(),
    bootstrapPassword: requireEnv('AUTH_BOOTSTRAP_PASSWORD'),
    bootstrapDisplayName:
      process.env.AUTH_BOOTSTRAP_DISPLAY_NAME?.trim() || 'SystemUp Admin',
    sessionCookieName:
      process.env.AUTH_SESSION_COOKIE_NAME?.trim() || 'monitor_pfsense_session',
    csrfCookieName:
      process.env.AUTH_CSRF_COOKIE_NAME?.trim() || 'monitor_pfsense_csrf',
    sessionTtlHours: parseNumber(
      process.env.AUTH_SESSION_TTL_HOURS,
      12,
      'AUTH_SESSION_TTL_HOURS',
    ),
    cookieSecure: parseBoolean(process.env.AUTH_COOKIE_SECURE, true),
  },
  gateway: {
    degradedLatencyMs: parseNumber(
      process.env.GATEWAY_DEGRADED_LATENCY_MS,
      150,
      'GATEWAY_DEGRADED_LATENCY_MS',
    ),
    degradedLossPercent: parseNumber(
      process.env.GATEWAY_DEGRADED_LOSS_PERCENT,
      5,
      'GATEWAY_DEGRADED_LOSS_PERCENT',
    ),
  },
  agentBootstrap: {
    releaseBaseUrl: process.env.AGENT_BOOTSTRAP_RELEASE_BASE_URL?.trim() || '',
  },
  versionMatrix: {
    homologatedPfSenseVersions: (() => {
      const versions = parseList(process.env.HOMOLOGATED_PFSENSE_VERSIONS);
      return versions.length > 0 ? versions : ['2.8.1'];
    })(),
  },
  nodeSecretEncryptionKey: parseEncryptionKey(
    requireEnv('NODE_SECRET_ENCRYPTION_KEY_BASE64'),
  ),
});

export type AppConfig = typeof appConfig;
