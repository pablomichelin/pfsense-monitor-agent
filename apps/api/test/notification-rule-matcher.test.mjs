import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNotificationIdempotencyKey,
  ruleMatchesAlert,
} from '../dist/notifications/notification-rule-matcher.util.js';

test('ruleMatchesAlert accepts wildcard fields', () => {
  assert.equal(
    ruleMatchesAlert(
      {
        enabled: true,
        severity: null,
        alertType: null,
        clientId: null,
      },
      {
        severity: 'critical',
        alertType: 'heartbeat_missing',
        clientId: '11111111-1111-1111-1111-111111111111',
      },
    ),
    true,
  );
});

test('ruleMatchesAlert filters by severity client and type', () => {
  const alert = {
    severity: 'warning',
    alertType: 'service_down',
    clientId: '22222222-2222-2222-2222-222222222222',
  };

  assert.equal(
    ruleMatchesAlert(
      {
        enabled: true,
        severity: 'critical',
        alertType: null,
        clientId: null,
      },
      alert,
    ),
    false,
  );

  assert.equal(
    ruleMatchesAlert(
      {
        enabled: true,
        severity: 'warning',
        alertType: 'service_down',
        clientId: '22222222-2222-2222-2222-222222222222',
      },
      alert,
    ),
    true,
  );
});

test('buildNotificationIdempotencyKey is stable per open event', () => {
  const openedAt = new Date('2026-07-02T12:00:00.000Z');
  const key = buildNotificationIdempotencyKey(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    openedAt,
  );

  assert.equal(
    key,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb:2026-07-02T12:00:00.000Z',
  );
});
