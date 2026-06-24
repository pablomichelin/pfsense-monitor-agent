#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

POSTGRES_USER="${POSTGRES_USER:-monitor_pfsense}"
POSTGRES_DB="${POSTGRES_DB:-monitor_pfsense}"
DRY_RUN="${DRY_RUN:-0}"
BOOTSTRAP_EMAIL="$(
  awk -F= '$1=="AUTH_BOOTSTRAP_EMAIL"{print tolower($2)}' "$ROOT_DIR/.env.api" 2>/dev/null || true
)"
BOOTSTRAP_EMAIL="${BOOTSTRAP_EMAIL:-admin@systemup.inf.br}"

psql_exec() {
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
}

smoke_client_sql="(
  code ~ '^(SCOPE-[AB]|CPROF-[AB]|RBAC|RBAC-ND|PERM|BK|UX-CLIENT|AUDIT|DBG|DL|REQ|RET|ADM|BST|LAB)-[0-9]+\$'
  OR name ~ '^(Scope [AB]|Client Profile [AB]|RBAC Smoke|RBAC Node Detail|Perm Smoke|Backup Smoke|UX Client|Audit |Dbg |Admin Smoke |Bootstrap Smoke |SystemUp Smoke )[0-9]+\$'
  OR name = 'DBG'
)"

smoke_user_sql="(
  email ~ '@test\\.local\$'
  OR email ~ '^(scoped-admin|perm-readonly|perm-operator|readonly|operator|client-user|audit-ro|ux-client|dbg-scoped|admin-smoke|operator-nd|readonly-nd|noscope-nd|mfa-smoke)-[0-9]+@'
)"

echo "=== Purge de dados smoke (RBAC, backup, escopo) ==="

echo "[1/4] Contagem"
psql_exec -c "
SELECT 'clientes_smoke' AS tipo, count(*)::text AS qtd FROM clients WHERE ${smoke_client_sql}
UNION ALL
SELECT 'usuarios_smoke', count(*)::text FROM users WHERE ${smoke_user_sql};
"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN=1 — nenhuma exclusao executada."
  psql_exec -c "SELECT code, name FROM clients WHERE ${smoke_client_sql} ORDER BY created_at DESC LIMIT 20;"
  exit 0
fi

echo "[2/4] Removendo nodes e sites de clientes smoke"
psql_exec <<SQL
BEGIN;

CREATE TEMP TABLE smoke_clients ON COMMIT DROP AS
  SELECT id FROM clients WHERE ${smoke_client_sql};

DELETE FROM nodes
WHERE site_id IN (SELECT id FROM sites WHERE client_id IN (SELECT id FROM smoke_clients));

DELETE FROM sites WHERE client_id IN (SELECT id FROM smoke_clients);

DELETE FROM user_client_scopes WHERE client_id IN (SELECT id FROM smoke_clients);

UPDATE users SET client_id = NULL
WHERE client_id IN (SELECT id FROM smoke_clients);

DELETE FROM clients WHERE id IN (SELECT id FROM smoke_clients);

COMMIT;
SQL

echo "[3/4] Removendo usuarios smoke (exceto bootstrap)"
psql_exec <<SQL
BEGIN;

DELETE FROM users
WHERE ${smoke_user_sql}
  AND email <> '${BOOTSTRAP_EMAIL}';

COMMIT;
SQL

echo "[4/4] Contagem final"
psql_exec -c "
SELECT 'clientes_ativos' AS tipo, count(*)::text AS qtd FROM clients WHERE status = 'active'
UNION ALL
SELECT 'usuarios_ativos', count(*)::text FROM users WHERE status = 'active';
"

echo "Purge concluido. Reinicie a API ou aguarde TTL do cache de filtros (120s) se a lista ainda parecer antiga."
