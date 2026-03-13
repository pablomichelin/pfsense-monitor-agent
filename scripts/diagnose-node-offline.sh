#!/usr/bin/env bash
# Diagnostico: por que um node aparece offline no painel?
# O status "offline" significa: ultimo heartbeat recebido ha mais de 300s (NODE_OFFLINE_AFTER_SECONDS).
# Uso: BASE_URL=https://pfs-monitor.systemup.inf.br ./scripts/diagnose-node-offline.sh <node_uid>
# Ou com auth: passar cookie/sessao se a API exigir login para GET /api/v1/nodes (o dashboard pode ser publico so para ingest).

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8088}"
NODE_UID="${1:-}"

if [[ -z "$NODE_UID" ]]; then
  echo "Uso: $0 <node_uid>" >&2
  echo "Exemplo: $0 lasalle-agro" >&2
  echo "Variavel: BASE_URL (default http://127.0.0.1:8088)" >&2
  exit 1
fi

echo "=== Diagnostico node_uid=$NODE_UID ==="
echo ""

# Tentar listar nodes e filtrar por node_uid (se a API permitir sem auth)
# GET /api/v1/nodes geralmente exige auth; GET /api/v1/dashboard/summary tambem.
# Entao este script so pode funcionar com sessao/cookie ou em ambiente local com API sem auth.
# Alternativa: consultar o banco diretamente.
if command -v psql >/dev/null 2>&1 && [[ -n "${DATABASE_URL:-}" ]]; then
  echo "Consultando ultimo heartbeat no banco (DATABASE_URL)..."
  psql "$DATABASE_URL" -t -A -c "
    SELECT n.id, n.\"nodeUid\", n.\"lastSeenAt\", n.status,
           (EXTRACT(EPOCH FROM (NOW() - n.\"lastSeenAt\")))::int AS seconds_ago
    FROM nodes n
    WHERE n.\"nodeUid\" = '$NODE_UID';
  " 2>/dev/null || true
  echo ""
  echo "Se 'lastSeenAt' for NULL ou 'seconds_ago' > 300, o painel mostra offline."
  echo "Se 'lastSeenAt' for recente e ainda aparece offline, verifique cache do navegador ou SSE."
else
  echo "Para ver ultimo heartbeat:"
  echo "  1. No painel: abra o detalhe do firewall e veja 'Ultimo contato' / last_seen_at."
  echo "  2. Se tiver DATABASE_URL e psql: execute o SELECT acima manualmente."
  echo "  3. Logs da API: busque 'heartbeat accepted node_uid=$NODE_UID' ou erros 4xx em POST /api/v1/ingest/heartbeat."
fi

echo ""
echo "Causas comuns de offline:"
echo "  - Firewall nao enviou heartbeat ha mais de 5 minutos (agente parado, rede, DNS)."
echo "  - Controlador rejeitando heartbeats (401 assinatura, 400 validacao, 413 payload)."
echo "  - Relogio do firewall muito deslocado (>300s) causa 401 (HEARTBEAT_MAX_SKEW_SECONDS)."
echo ""
echo "No pfSense (Lasalle Agro), execute:"
echo "  service monitor_pfsense_agent status"
echo "  /usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh test-connection"
echo "  /usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh heartbeat"
echo "  tail -n 30 /var/log/monitor-pfsense-agent.log"
echo ""
echo "No servidor do controlador, verifique logs:"
echo "  docker compose logs api 2>&1 | grep -E 'heartbeat accepted|lasalle-agro|401|400|413'"
echo "  ou journalctl -u <servico-api> | grep lasalle-agro"
