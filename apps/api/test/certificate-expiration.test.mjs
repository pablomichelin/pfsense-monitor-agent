import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeExpiryThresholds,
  assertNoPrivateKeyMaterial,
  buildCertificateExpirationAlert,
  buildCertificateExpirationFingerprint,
  daysUntilExpiry,
  normalizeHeartbeatCertificate,
  summarizeCertificateExpiryBadge,
} from '../dist/certificates/certificate-expiration.util.js';
import {
  buildActiveCertificateAlerts,
  normalizeHeartbeatCertificates,
} from '../dist/certificates/certificate-sync.util.js';

test('normalizeHeartbeatCertificate parses ISO dates', () => {
  const normalized = normalizeHeartbeatCertificate({
    cert_key: 'cert:abc',
    subject: 'CN=webgui',
    issuer: 'CN=internal-ca',
    not_before: '2025-01-01T00:00:00.000Z',
    not_after: '2026-01-01T00:00:00.000Z',
    usage: 'Web GUI',
  });

  assert.ok(normalized);
  assert.equal(normalized.certKey, 'cert:abc');
  assert.equal(normalized.usageDescriptor, 'Web GUI');
});

test('assertNoPrivateKeyMaterial rejects private key fields', () => {
  assert.throws(() =>
    assertNoPrivateKeyMaterial([
      {
        cert_key: 'x',
        subject: 'CN=test',
        not_before: '2025-01-01T00:00:00.000Z',
        not_after: '2026-01-01T00:00:00.000Z',
        private_key: 'secret',
      },
    ]),
  );
});

test('activeExpiryThresholds respects 30/15/7 windows', () => {
  assert.deepEqual(activeExpiryThresholds(45), []);
  assert.deepEqual(activeExpiryThresholds(30), [30]);
  assert.deepEqual(activeExpiryThresholds(20), [30]);
  assert.deepEqual(activeExpiryThresholds(10), [30, 15]);
  assert.deepEqual(activeExpiryThresholds(7), [30, 15, 7]);
  assert.deepEqual(activeExpiryThresholds(0), [30, 15, 7]);
});

test('buildCertificateExpirationAlert marks expired as critical', () => {
  const alert = buildCertificateExpirationAlert({
    certKey: 'cert:1',
    subject: 'CN=expired',
    usageDescriptor: 'OpenVPN',
    notAfter: new Date('2026-01-01T00:00:00.000Z'),
    thresholdDays: 7,
    daysRemaining: 0,
  });

  assert.equal(alert.severity, 'critical');
  assert.match(alert.title, /expirado/i);
});

test('buildActiveCertificateAlerts resolves when renewed beyond 30 days', () => {
  const reference = new Date('2026-06-01T00:00:00.000Z');
  const active = buildActiveCertificateAlerts({
    nodeId: 'node-1',
    certificates: [
      {
        certKey: 'cert:safe',
        subject: 'CN=safe',
        issuer: null,
        usageDescriptor: 'Lab',
        notBefore: new Date('2025-01-01T00:00:00.000Z'),
        notAfter: new Date('2027-01-01T00:00:00.000Z'),
      },
    ],
    observedAt: reference,
  });

  assert.equal(active.size, 0);
  assert.equal(
    daysUntilExpiry(new Date('2027-01-01T00:00:00.000Z'), reference) > 30,
    true,
  );
});

test('buildActiveCertificateAlerts opens alert inside 15-day window', () => {
  const reference = new Date('2026-06-01T00:00:00.000Z');
  const active = buildActiveCertificateAlerts({
    nodeId: 'node-1',
    certificates: [
      {
        certKey: 'cert:soon',
        subject: 'CN=soon',
        issuer: null,
        usageDescriptor: 'Web GUI',
        notBefore: new Date('2025-01-01T00:00:00.000Z'),
        notAfter: new Date('2026-06-10T00:00:00.000Z'),
      },
    ],
    observedAt: reference,
  });

  assert.equal(active.size, 1);
  const fingerprint = buildCertificateExpirationFingerprint({
    nodeId: 'node-1',
    certKey: 'cert:soon',
    thresholdDays: 15,
  });
  assert.ok(active.has(fingerprint));
});

test('normalizeHeartbeatCertificates deduplicates cert_key', () => {
  const normalized = normalizeHeartbeatCertificates([
    {
      cert_key: 'cert:dup',
      subject: 'CN=a',
      not_before: '2025-01-01T00:00:00.000Z',
      not_after: '2026-01-01T00:00:00.000Z',
    },
    {
      cert_key: 'cert:dup',
      subject: 'CN=b',
      not_before: '2025-01-01T00:00:00.000Z',
      not_after: '2026-01-01T00:00:00.000Z',
    },
  ]);

  assert.equal(normalized.length, 1);
});

test('summarizeCertificateExpiryBadge maps tones', () => {
  assert.equal(summarizeCertificateExpiryBadge(45).tone, 'success');
  assert.equal(summarizeCertificateExpiryBadge(20).tone, 'warning');
  assert.equal(summarizeCertificateExpiryBadge(5).tone, 'danger');
  assert.equal(summarizeCertificateExpiryBadge(0).label, 'Expirado');
});
