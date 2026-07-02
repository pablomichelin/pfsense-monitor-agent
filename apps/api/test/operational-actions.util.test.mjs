import test from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmationMatchesHostname,
  evaluateHaRebootGate,
  evaluateRebootMaintenanceGate,
  isRestartableService,
  normalizeRestartableService,
  validateNodeRebootPayload,
  validateServiceRestartPayload,
} from '../dist/operational-actions/operational-actions.util.js';

test('normalizeRestartableService accepts allowlist only', () => {
  assert.equal(normalizeRestartableService('unbound'), 'unbound');
  assert.throws(() => normalizeRestartableService('openvpn'));
  assert.throws(() => normalizeRestartableService(''));
});

test('isRestartableService mirrors allowlist', () => {
  assert.equal(isRestartableService('dhcpd'), true);
  assert.equal(isRestartableService('filter'), false);
});

test('validateServiceRestartPayload returns normalized service', () => {
  assert.deepEqual(validateServiceRestartPayload({ service: 'NTPD' }), {
    service: 'ntpd',
  });
});

test('validateNodeRebootPayload clamps delay and defaults', () => {
  const payload = validateNodeRebootPayload({});
  assert.equal(payload.delay_seconds, 60);
  assert.equal(payload.enable_maintenance_mode, true);
  assert.equal(payload.acknowledge_ha_risk, false);

  assert.throws(() => validateNodeRebootPayload({ delay_seconds: 10 }));
});

test('evaluateRebootMaintenanceGate requires maintenance or toggle', () => {
  assert.deepEqual(
    evaluateRebootMaintenanceGate({
      maintenanceMode: true,
      enableMaintenanceMode: false,
    }),
    { allowed: true, willEnableMaintenance: false },
  );

  assert.deepEqual(
    evaluateRebootMaintenanceGate({
      maintenanceMode: false,
      enableMaintenanceMode: true,
    }),
    { allowed: true, willEnableMaintenance: true },
  );

  assert.deepEqual(
    evaluateRebootMaintenanceGate({
      maintenanceMode: false,
      enableMaintenanceMode: false,
    }),
    { allowed: false, willEnableMaintenance: false },
  );
});

test('evaluateHaRebootGate blocks HA without acknowledgement', () => {
  const blocked = evaluateHaRebootGate({
    haRole: 'MASTER',
    haDetectedFromAgent: false,
    acknowledgeHaRisk: false,
  });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.requiresAcknowledgement, true);

  const allowed = evaluateHaRebootGate({
    haRole: 'MASTER',
    haDetectedFromAgent: false,
    acknowledgeHaRisk: true,
  });
  assert.equal(allowed.blocked, false);
});

test('confirmationMatchesHostname accepts hostname or CONFIRMAR', () => {
  assert.equal(confirmationMatchesHostname('fw-lab', 'fw-lab'), true);
  assert.equal(confirmationMatchesHostname('fw-lab', 'CONFIRMAR'), true);
  assert.equal(confirmationMatchesHostname('fw-lab', 'wrong'), false);
});
