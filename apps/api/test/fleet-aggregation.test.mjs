import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateFleetMetrics,
  normalizePfsenseVersionLabel,
} from '../dist/dashboard/fleet-aggregation.util.js';

test('aggregateFleetMetrics returns empty metrics for scoped empty set', () => {
  const result = aggregateFleetMetrics([], '0.4.7');

  assert.equal(result.totals.nodes, 0);
  assert.equal(result.compliance.backup_ok_percent, null);
  assert.equal(result.compliance.package_outdated_percent, null);
  assert.deepEqual(result.version_matrix.pfsense, []);
  assert.deepEqual(result.version_matrix.package, []);
});

test('aggregateFleetMetrics counts status, backup and package drift', () => {
  const result = aggregateFleetMetrics(
    [
      {
        effectiveStatus: 'online',
        backupStatus: 'ok',
        pfsenseVersion: '2.8.1-RELEASE',
        agentVersion: '0.4.7',
      },
      {
        effectiveStatus: 'degraded',
        backupStatus: 'late',
        pfsenseVersion: '2.8.0-RELEASE',
        agentVersion: '0.4.5',
      },
      {
        effectiveStatus: 'offline',
        backupStatus: 'never',
        pfsenseVersion: null,
        agentVersion: null,
      },
    ],
    '0.4.7',
  );

  assert.equal(result.totals.nodes, 3);
  assert.equal(result.totals.online, 1);
  assert.equal(result.totals.degraded, 1);
  assert.equal(result.totals.offline, 1);
  assert.equal(result.compliance.backup_ok_count, 1);
  assert.equal(result.compliance.backup_ok_percent, 33);
  assert.equal(result.compliance.package_outdated_count, 2);
  assert.equal(result.compliance.package_outdated_percent, 67);
});

test('aggregateFleetMetrics isolates client scope when pre-filtered', () => {
  const clientA = aggregateFleetMetrics(
    [
      {
        effectiveStatus: 'online',
        backupStatus: 'ok',
        pfsenseVersion: '2.8.1',
        agentVersion: '0.4.7',
      },
    ],
    '0.4.7',
  );
  const clientB = aggregateFleetMetrics(
    [
      {
        effectiveStatus: 'offline',
        backupStatus: 'failed',
        pfsenseVersion: '2.7.2',
        agentVersion: '0.4.2',
      },
      {
        effectiveStatus: 'offline',
        backupStatus: 'never',
        pfsenseVersion: '2.7.2',
        agentVersion: '0.4.1',
      },
    ],
    '0.4.7',
  );

  assert.equal(clientA.totals.nodes, 1);
  assert.equal(clientA.compliance.backup_ok_percent, 100);
  assert.equal(clientA.compliance.package_outdated_percent, 0);

  assert.equal(clientB.totals.nodes, 2);
  assert.equal(clientB.compliance.backup_ok_percent, 0);
  assert.equal(clientB.compliance.package_outdated_percent, 100);
});

test('normalizePfsenseVersionLabel strips RELEASE suffix', () => {
  assert.equal(normalizePfsenseVersionLabel('2.8.1-RELEASE'), '2.8.1');
  assert.equal(normalizePfsenseVersionLabel(null), 'nao informado');
});

test('aggregateFleetMetrics builds version matrix sorted by count', () => {
  const result = aggregateFleetMetrics(
    [
      {
        effectiveStatus: 'online',
        backupStatus: 'ok',
        pfsenseVersion: '2.8.1-RELEASE',
        agentVersion: '0.4.7',
      },
      {
        effectiveStatus: 'online',
        backupStatus: 'ok',
        pfsenseVersion: '2.8.1-RELEASE',
        agentVersion: '0.4.6',
      },
      {
        effectiveStatus: 'online',
        backupStatus: 'ok',
        pfsenseVersion: '2.7.2-RELEASE',
        agentVersion: '0.4.6',
      },
    ],
    '0.4.7',
  );

  assert.equal(result.version_matrix.pfsense[0]?.version, '2.8.1');
  assert.equal(result.version_matrix.pfsense[0]?.count, 2);
  assert.equal(result.version_matrix.package[0]?.version, '0.4.6');
  assert.equal(result.version_matrix.package[0]?.alignment, 'outdated');
});
