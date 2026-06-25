// Carregar config versionado do package pfSense (usado no bootstrap-command)
try {
  const path = require('path');
  const dotenv = require('dotenv');
  const pkgReleasePath = path.resolve(process.cwd(), 'config/package-release.env');
  dotenv.config({ path: pkgReleasePath });
} catch {
  // dotenv ou path indisponível; variáveis vêm do env (ex.: Docker env_file)
}

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

const parseEncryptionKey = (value: string, fieldName: string): Buffer => {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new Error(`${fieldName} must decode to exactly 32 bytes`);
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
      60,
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
    bootstrapLoginEnabled: parseBoolean(
      process.env.AUTH_BOOTSTRAP_LOGIN_ENABLED,
      true,
    ),
  },
  mfa: {
    // C-MFA: rotulo exibido no app autenticador (otpauth issuer).
    issuer: process.env.MFA_ISSUER?.trim() || 'Monitor-Pfsense',
    // Capacidade sempre disponivel; imposicao e opt-in por papel. Vazio = nenhum
    // papel forcado (default seguro: nao tranca ninguem). A imposicao e "suave":
    // direciona ao enrollment, sem bloquear a sessao/API (evita lockout).
    enforcedRoles: parseList(process.env.MFA_ENFORCED_ROLES),
    enforcementBlocking: parseBoolean(
      process.env.MFA_ENFORCEMENT_BLOCKING,
      false,
    ),
    challengeTtlMinutes: parseNumber(
      process.env.MFA_CHALLENGE_TTL_MINUTES,
      5,
      'MFA_CHALLENGE_TTL_MINUTES',
    ),
    recoveryCodeCount: parseNumber(
      process.env.MFA_RECOVERY_CODE_COUNT,
      10,
      'MFA_RECOVERY_CODE_COUNT',
    ),
    // Tolerancia de janelas TOTP (cada janela = 30s) para clock skew leve.
    totpWindow: parseNumber(process.env.MFA_TOTP_WINDOW, 1, 'MFA_TOTP_WINDOW'),
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
  packageRelease: {
    version: process.env.PACKAGE_RELEASE_VERSION?.trim() || '',
    sha256: process.env.PACKAGE_RELEASE_SHA256?.trim() || '',
    repoRawBase:
      process.env.PACKAGE_RELEASE_REPO_RAW_BASE?.trim() ||
      'https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main',
    publicBaseUrl:
      process.env.PACKAGE_RELEASE_PUBLIC_BASE_URL?.trim() ||
      'https://pfs-monitor.systemup.inf.br',
    artifactDir:
      process.env.PACKAGE_RELEASE_ARTIFACT_DIR?.trim() ||
      '/app/dist/pfsense-package',
  },
  nodeSecretEncryptionKey: parseEncryptionKey(
    requireEnv('NODE_SECRET_ENCRYPTION_KEY_BASE64'),
    'NODE_SECRET_ENCRYPTION_KEY_BASE64',
  ),
  configBackup: {
    maxBytes: parseNumber(
      process.env.CONFIG_BACKUP_MAX_BYTES,
      5 * 1024 * 1024,
      'CONFIG_BACKUP_MAX_BYTES',
    ),
    retentionCount: parseNumber(
      process.env.CONFIG_BACKUP_RETENTION_COUNT,
      30,
      'CONFIG_BACKUP_RETENTION_COUNT',
    ),
    retentionMaxBytesPerNode: parseNumber(
      process.env.CONFIG_BACKUP_RETENTION_MAX_BYTES_PER_NODE,
      250 * 1024 * 1024,
      'CONFIG_BACKUP_RETENTION_MAX_BYTES_PER_NODE',
    ),
    storageDir:
      process.env.BACKUP_STORAGE_DIR?.trim() ||
      '/app/data/pfsense-config-backups',
    commandExpireMinutes: parseNumber(
      process.env.CONFIG_BACKUP_COMMAND_EXPIRE_MINUTES,
      15,
      'CONFIG_BACKUP_COMMAND_EXPIRE_MINUTES',
    ),
    attemptIdempotencyHours: parseNumber(
      process.env.CONFIG_BACKUP_ATTEMPT_IDEMPOTENCY_HOURS,
      24,
      'CONFIG_BACKUP_ATTEMPT_IDEMPOTENCY_HOURS',
    ),
    encryptionVersion: 'aes-256-gcm:v1',
  },
  backupEncryptionKey: parseEncryptionKey(
    requireEnv('BACKUP_ENCRYPTION_KEY_BASE64'),
    'BACKUP_ENCRYPTION_KEY_BASE64',
  ),
  rbac: {
    scopeEnabled: parseBoolean(process.env.RBAC_SCOPE_ENABLED, true),
    permissionsEnabled: parseBoolean(process.env.RBAC_PERMISSIONS_ENABLED, true),
  },
  pfsenseUpgrade: {
    enabled: parseBoolean(process.env.PFSENSE_UPGRADE_ENABLED, false),
    commandExpireMinutes: parseNumber(
      process.env.PFSENSE_UPGRADE_COMMAND_EXPIRE_MINUTES,
      120,
      'PFSENSE_UPGRADE_COMMAND_EXPIRE_MINUTES',
    ),
    offlineGraceMinutes: parseNumber(
      process.env.PFSENSE_UPGRADE_OFFLINE_GRACE_MINUTES,
      90,
      'PFSENSE_UPGRADE_OFFLINE_GRACE_MINUTES',
    ),
    lateResultReconcileHours: parseNumber(
      process.env.PFSENSE_UPGRADE_LATE_RESULT_RECONCILE_HOURS,
      24,
      'PFSENSE_UPGRADE_LATE_RESULT_RECONCILE_HOURS',
    ),
    maxConcurrentGlobal: parseNumber(
      process.env.PFSENSE_UPGRADE_MAX_CONCURRENT,
      0,
      'PFSENSE_UPGRADE_MAX_CONCURRENT',
    ),
    updateCheckIntervalHours: parseNumber(
      process.env.PFSENSE_UPGRADE_UPDATE_CHECK_INTERVAL_HOURS,
      6,
      'PFSENSE_UPGRADE_UPDATE_CHECK_INTERVAL_HOURS',
    ),
    minAgentVersion:
      process.env.PFSENSE_UPGRADE_MIN_AGENT_VERSION?.trim() || '0.3.1',
    requireRecentBackupHours: parseNumber(
      process.env.PFSENSE_UPGRADE_REQUIRE_BACKUP_HOURS,
      24,
      'PFSENSE_UPGRADE_REQUIRE_BACKUP_HOURS',
    ),
  },
});

// C6: em producao, RBAC nao pode ser desligado silenciosamente. Falha no boot.
if (appConfig.nodeEnv === 'production') {
  if (!appConfig.rbac.scopeEnabled || !appConfig.rbac.permissionsEnabled) {
    throw new Error(
      'RBAC obrigatorio em producao: defina RBAC_SCOPE_ENABLED=true e RBAC_PERMISSIONS_ENABLED=true.',
    );
  }
}

export type AppConfig = typeof appConfig;
