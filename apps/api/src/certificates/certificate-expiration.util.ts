import { AlertSeverity } from '@prisma/client';

export const CERTIFICATE_EXPIRY_THRESHOLDS_DAYS = [30, 15, 7] as const;

export type CertificateExpiryThresholdDays =
  (typeof CERTIFICATE_EXPIRY_THRESHOLDS_DAYS)[number];

export interface NormalizedNodeCertificate {
  certKey: string;
  subject: string;
  issuer: string | null;
  usageDescriptor: string | null;
  notBefore: Date;
  notAfter: Date;
}

export interface HeartbeatCertificateInput {
  cert_key: string;
  subject: string;
  issuer?: string;
  not_before: string;
  not_after: string;
  usage?: string;
  private_key?: unknown;
  key?: unknown;
  prv?: unknown;
}

const PRIVATE_KEY_FIELD_NAMES = new Set([
  'private_key',
  'key',
  'prv',
  'privatekey',
  'private',
]);

export function assertNoPrivateKeyMaterial(
  certificates: HeartbeatCertificateInput[],
): void {
  for (const certificate of certificates) {
    for (const fieldName of Object.keys(certificate)) {
      if (PRIVATE_KEY_FIELD_NAMES.has(fieldName.toLowerCase())) {
        throw new Error(
          `certificate payload must not include private key field "${fieldName}"`,
        );
      }
    }
  }
}

export function parseCertificateIsoDate(
  value: string,
  fieldName: string,
): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO8601 date`);
  }

  return parsed;
}

export function normalizeHeartbeatCertificate(
  input: HeartbeatCertificateInput,
): NormalizedNodeCertificate | null {
  const certKey = input.cert_key.trim();
  const subject = input.subject.trim();
  if (!certKey || !subject) {
    return null;
  }

  const notBefore = parseCertificateIsoDate(input.not_before, 'not_before');
  const notAfter = parseCertificateIsoDate(input.not_after, 'not_after');
  if (!notBefore || !notAfter) {
    return null;
  }

  if (notAfter.getTime() < notBefore.getTime()) {
    return null;
  }

  return {
    certKey: certKey.slice(0, 128),
    subject: subject.slice(0, 512),
    issuer: input.issuer?.trim().slice(0, 512) || null,
    usageDescriptor: input.usage?.trim().slice(0, 255) || null,
    notBefore,
    notAfter,
  };
}

export function daysUntilExpiry(notAfter: Date, reference: Date): number {
  const diffMs = notAfter.getTime() - reference.getTime();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

export function activeExpiryThresholds(
  daysRemaining: number,
): CertificateExpiryThresholdDays[] {
  if (daysRemaining > CERTIFICATE_EXPIRY_THRESHOLDS_DAYS[0]) {
    return [];
  }

  return CERTIFICATE_EXPIRY_THRESHOLDS_DAYS.filter(
    (threshold) => daysRemaining <= threshold,
  );
}

export function buildCertificateExpirationFingerprint(input: {
  nodeId: string;
  certKey: string;
  thresholdDays: number;
}): string {
  return `certificate_expiring:${input.nodeId}:${input.certKey}:${input.thresholdDays}`;
}

export function buildCertificateExpirationAlert(input: {
  certKey: string;
  subject: string;
  usageDescriptor: string | null;
  notAfter: Date;
  thresholdDays: number;
  daysRemaining: number;
}): {
  severity: AlertSeverity;
  title: string;
  description: string;
  metadataJson: Record<string, string | number | null>;
} {
  const label = input.usageDescriptor || input.subject;
  const expired = input.daysRemaining <= 0;
  const severity =
    expired || input.thresholdDays <= 7
      ? AlertSeverity.critical
      : AlertSeverity.warning;

  const title = expired
    ? `Certificado expirado: ${label}`
    : `Certificado expira em ${input.daysRemaining} dia(s): ${label}`;

  const description = expired
    ? `O certificado "${label}" expirou em ${input.notAfter.toISOString()}. Renove manualmente no pfSense.`
    : `O certificado "${label}" expira em ${input.notAfter.toISOString()} (limiar ${input.thresholdDays} dias).`;

  return {
    severity,
    title,
    description,
    metadataJson: {
      cert_key: input.certKey,
      subject: input.subject,
      usage_descriptor: input.usageDescriptor,
      not_after: input.notAfter.toISOString(),
      threshold_days: input.thresholdDays,
      days_remaining: input.daysRemaining,
    },
  };
}

export function summarizeCertificateExpiryBadge(daysRemaining: number): {
  label: string;
  tone: 'success' | 'warning' | 'danger';
} {
  if (daysRemaining <= 0) {
    return { label: 'Expirado', tone: 'danger' };
  }
  if (daysRemaining <= 7) {
    return { label: `${daysRemaining}d`, tone: 'danger' };
  }
  if (daysRemaining <= 15) {
    return { label: `${daysRemaining}d`, tone: 'warning' };
  }
  if (daysRemaining <= 30) {
    return { label: `${daysRemaining}d`, tone: 'warning' };
  }
  return { label: `${daysRemaining}d`, tone: 'success' };
}
