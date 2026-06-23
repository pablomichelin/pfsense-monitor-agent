#!/usr/bin/env bash
# Audita a frota: nodes com loop de backup agendado duplicado ou comandos presos.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! docker compose ps db --status running >/dev/null 2>&1; then
  echo "Container db nao esta rodando." >&2
  exit 1
fi

docker compose exec -T db psql -U monitor_pfsense -d monitor_pfsense -v ON_ERROR_STOP=1 <<'SQL'
\pset footer off
\timing off

\echo '=== Nodes com loop provavel (>= 50 duplicatas agendadas / 24h) ==='
SELECT n.hostname,
       c.name AS client,
       n.agent_version,
       COUNT(*) FILTER (
         WHERE b.status = 'duplicate' AND b.source = 'scheduled'
       ) AS dup_sched_24h,
       COUNT(*) FILTER (WHERE b.status = 'stored') AS stored_total,
       MAX(b.received_at) FILTER (WHERE b.status = 'duplicate') AS last_dup,
       MAX(b.received_at) FILTER (WHERE b.status = 'stored') AS last_stored
FROM nodes n
JOIN sites s ON s.id = n.site_id
JOIN clients c ON c.id = s.client_id
LEFT JOIN node_config_backups b ON b.node_id = n.id
  AND b.received_at > now() - interval '24 hours'
GROUP BY n.id, n.hostname, c.name, n.agent_version
HAVING COUNT(*) FILTER (
         WHERE b.status = 'duplicate' AND b.source = 'scheduled'
       ) >= 50
ORDER BY dup_sched_24h DESC;

\echo ''
\echo '=== Comandos config_backup_now presos (expirados ou ativos) ==='
SELECT n.hostname,
       c.name AS client,
       nc.status,
       COUNT(*) AS qty,
       MIN(nc.requested_at) AS oldest,
       MAX(nc.expires_at) AS max_expires
FROM node_commands nc
JOIN nodes n ON n.id = nc.node_id
JOIN sites s ON s.id = n.site_id
JOIN clients c ON c.id = s.client_id
WHERE nc.type = 'config_backup_now'
  AND nc.status IN ('pending', 'picked_up', 'running')
GROUP BY n.hostname, c.name, nc.status
ORDER BY qty DESC;

\echo ''
\echo '=== Resumo frota backup (nodes com qualquer backup) ==='
SELECT COUNT(DISTINCT node_id) AS nodes_com_backup,
       COUNT(*) FILTER (WHERE status = 'stored') AS total_stored,
       COUNT(*) FILTER (WHERE status = 'duplicate') AS total_duplicate,
       COUNT(*) FILTER (
         WHERE status = 'duplicate'
           AND source = 'scheduled'
           AND received_at > now() - interval '1 hour'
       ) AS dup_sched_ultima_hora
FROM node_config_backups;
SQL
