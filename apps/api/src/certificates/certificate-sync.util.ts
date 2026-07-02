import {
  AlertSeverity,
  AlertStatus,
  AlertType,
  Prisma,
} from '@prisma/client';
import {
  activeExpiryThresholds,
  assertNoPrivateKeyMaterial,
  buildCertificateExpirationAlert,
  buildCertificateExpirationFingerprint,
  daysUntilExpiry,
  HeartbeatCertificateInput,
  normalizeHeartbeatCertificate,
  NormalizedNodeCertificate,
} from './certificate-expiration.util';

interface ActiveCertificateAlert {
  fingerprint: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  metadataJson: Prisma.JsonObject;
}

export function normalizeHeartbeatCertificates(
  certificates: HeartbeatCertificateInput[],
): NormalizedNodeCertificate[] {
  assertNoPrivateKeyMaterial(certificates);

  const normalized: NormalizedNodeCertificate[] = [];
  const seenKeys = new Set<string>();

  for (const certificate of certificates) {
    const entry = normalizeHeartbeatCertificate(certificate);
    if (!entry || seenKeys.has(entry.certKey)) {
      continue;
    }
    seenKeys.add(entry.certKey);
    normalized.push(entry);
  }

  return normalized;
}

export function buildActiveCertificateAlerts(input: {
  nodeId: string;
  certificates: NormalizedNodeCertificate[];
  observedAt: Date;
}): Map<string, ActiveCertificateAlert> {
  const activeAlerts = new Map<string, ActiveCertificateAlert>();

  for (const certificate of input.certificates) {
    const daysRemaining = daysUntilExpiry(certificate.notAfter, input.observedAt);
    const thresholds = activeExpiryThresholds(daysRemaining);
    if (thresholds.length === 0) {
      continue;
    }

    const highestThreshold = thresholds[thresholds.length - 1];
    const details = buildCertificateExpirationAlert({
      certKey: certificate.certKey,
      subject: certificate.subject,
      usageDescriptor: certificate.usageDescriptor,
      notAfter: certificate.notAfter,
      thresholdDays: highestThreshold,
      daysRemaining,
    });

    const fingerprint = buildCertificateExpirationFingerprint({
      nodeId: input.nodeId,
      certKey: certificate.certKey,
      thresholdDays: highestThreshold,
    });

    activeAlerts.set(fingerprint, {
      fingerprint,
      type: AlertType.certificate_expiring,
      severity: details.severity,
      title: details.title,
      description: details.description,
      metadataJson: details.metadataJson as Prisma.JsonObject,
    });
  }

  return activeAlerts;
}

export async function syncNodeCertificates(
  tx: Prisma.TransactionClient,
  nodeId: string,
  certificates: NormalizedNodeCertificate[],
  observedAt: Date,
): Promise<void> {
  const certKeys = certificates.map((certificate) => certificate.certKey);

  for (const certificate of certificates) {
    await tx.nodeCertificate.upsert({
      where: {
        nodeId_certKey: {
          nodeId,
          certKey: certificate.certKey,
        },
      },
      create: {
        nodeId,
        certKey: certificate.certKey,
        subject: certificate.subject,
        issuer: certificate.issuer,
        usageDescriptor: certificate.usageDescriptor,
        notBefore: certificate.notBefore,
        notAfter: certificate.notAfter,
        observedAt,
      },
      update: {
        subject: certificate.subject,
        issuer: certificate.issuer,
        usageDescriptor: certificate.usageDescriptor,
        notBefore: certificate.notBefore,
        notAfter: certificate.notAfter,
        observedAt,
      },
    });
  }

  if (certKeys.length > 0) {
    await tx.nodeCertificate.deleteMany({
      where: {
        nodeId,
        certKey: { notIn: certKeys },
      },
    });
  } else {
    await tx.nodeCertificate.deleteMany({
      where: { nodeId },
    });
  }
}

export async function syncCertificateExpirationAlerts(
  tx: Prisma.TransactionClient,
  nodeId: string,
  certificates: NormalizedNodeCertificate[],
  observedAt: Date,
): Promise<string[]> {
  const activeAlerts = buildActiveCertificateAlerts({
    nodeId,
    certificates,
    observedAt,
  });
  const notifyAlertIds: string[] = [];

  const existingAlerts = await tx.alert.findMany({
    where: {
      nodeId,
      type: AlertType.certificate_expiring,
    },
  });

  const existingByFingerprint = new Map(
    existingAlerts.map((alert) => [alert.fingerprint, alert]),
  );

  for (const alert of activeAlerts.values()) {
    const existing = existingByFingerprint.get(alert.fingerprint);

    if (!existing) {
      const created = await tx.alert.create({
        data: {
          nodeId,
          fingerprint: alert.fingerprint,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          description: alert.description,
          status: AlertStatus.open,
          metadataJson: alert.metadataJson,
          openedAt: observedAt,
        },
      });
      notifyAlertIds.push(created.id);
      continue;
    }

    const wasResolved = existing.status === AlertStatus.resolved;

    await tx.alert.update({
      where: { id: existing.id },
      data: {
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        status: AlertStatus.open,
        metadataJson: alert.metadataJson,
        openedAt: wasResolved ? observedAt : existing.openedAt,
        acknowledgedAt: wasResolved ? null : existing.acknowledgedAt,
        acknowledgedBy: wasResolved ? null : existing.acknowledgedBy,
        resolvedAt: null,
        resolutionNote: null,
      },
    });

    if (wasResolved) {
      notifyAlertIds.push(existing.id);
    }
  }

  for (const existing of existingAlerts) {
    if (activeAlerts.has(existing.fingerprint)) {
      continue;
    }

    if (existing.status === AlertStatus.resolved) {
      continue;
    }

    await tx.alert.update({
      where: { id: existing.id },
      data: {
        status: AlertStatus.resolved,
        resolvedAt: observedAt,
        resolutionNote: 'Certificate renewed, removed or outside expiry window',
      },
    });
  }

  return notifyAlertIds;
}
