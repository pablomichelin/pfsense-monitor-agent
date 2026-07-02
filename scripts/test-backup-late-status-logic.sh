#!/usr/bin/env bash
# Valida status visual de backup (agendamento do agente vs limiar fixo).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/apps/api"

cd "$API_DIR"
npm run build >/dev/null

node <<'NODE'
const {
  deriveBackupVisualStatus,
} = require('./dist/nodes/backup-visual-status.util');
const {
  computeNextScheduledBackupAt,
  isBackupLateBySchedule,
} = require('./dist/nodes/backup-schedule.util');

const failures = [];

function assert(label, condition) {
  if (!condition) {
    failures.push(label);
    console.log(`FAIL ${label}`);
    return;
  }
  console.log(`OK   ${label}`);
}

const now = new Date('2026-06-24T12:00:00.000Z');
const lastBackup = new Date('2026-06-10T12:00:00.000Z'); // 14 dias atras

const monthlyPolicy = {
  enabled: true,
  schedule_mode: 'monthly',
  interval_hours: 24,
  schedule_time: '03:00',
  schedule_dow: 1,
  schedule_dom: 1,
};

assert(
  'mensal 14d -> ok (nao atrasado)',
  deriveBackupVisualStatus({
    latestBackupReceivedAt: lastBackup,
    latestFailedCommandAt: null,
    backupPolicy: monthlyPolicy,
    now,
  }) === 'ok',
);

assert(
  'sem politica 14d -> late (fallback 36h)',
  deriveBackupVisualStatus({
    latestBackupReceivedAt: lastBackup,
    latestFailedCommandAt: null,
    now,
  }) === 'late',
);

const dailyPolicy = {
  enabled: true,
  schedule_mode: 'daily',
  interval_hours: 24,
  schedule_time: '03:00',
  schedule_dow: 1,
  schedule_dom: 1,
};

assert(
  'diario 14d -> late',
  deriveBackupVisualStatus({
    latestBackupReceivedAt: lastBackup,
    latestFailedCommandAt: null,
    backupPolicy: dailyPolicy,
    now,
  }) === 'late',
);

const recent = new Date('2026-06-24T11:00:00.000Z');
assert(
  'diario 1h -> ok',
  deriveBackupVisualStatus({
    latestBackupReceivedAt: recent,
    latestFailedCommandAt: null,
    backupPolicy: dailyPolicy,
    now,
  }) === 'ok',
);

const hoursPolicy = {
  enabled: true,
  schedule_mode: 'hours',
  interval_hours: 24,
  schedule_time: '03:00',
  schedule_dow: 1,
  schedule_dom: 1,
};

assert(
  'hours 40min -> ok',
  deriveBackupVisualStatus({
    latestBackupReceivedAt: new Date('2026-06-24T11:20:00.000Z'),
    latestFailedCommandAt: null,
    backupPolicy: hoursPolicy,
    now,
  }) === 'ok',
);

const nextMonthly = computeNextScheduledBackupAt(
  lastBackup,
  monthlyPolicy,
  'UTC',
);
assert(
  'proximo slot mensal fica no futuro',
  nextMonthly instanceof Date && nextMonthly.getTime() > now.getTime(),
);

assert(
  'grace de 6h apos vencimento diario',
  !isBackupLateBySchedule(
    new Date('2026-06-23T04:00:00.000Z'),
    dailyPolicy,
    new Date('2026-06-24T08:00:00.000Z'),
    'UTC',
  ),
);

if (failures.length > 0) {
  console.log(`RESULTADO: ${failures.length} falha(s)`);
  process.exit(1);
}

console.log('RESULTADO: todos os cenarios passaram');
NODE

echo "test-backup-late-status-logic: OK"
