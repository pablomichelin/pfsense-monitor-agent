#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:8088}"

read_env_value() {
  local key="$1"
  local env_file="${2:-$ROOT_DIR/.env.api}"

  if [[ ! -f "$env_file" ]]; then
    return 1
  fi

  awk -F= -v target="$key" '$1 == target { sub(/^[^=]*=/, ""); print; exit }' "$env_file"
}

AUTH_EMAIL="${AUTH_EMAIL:-$(read_env_value AUTH_BOOTSTRAP_EMAIL 2>/dev/null || true)}"
AUTH_PASSWORD="${AUTH_PASSWORD:-$(read_env_value AUTH_BOOTSTRAP_PASSWORD 2>/dev/null || true)}"

# Modo package: PACKAGE_RELEASE_VERSION configurado
PACKAGE_VERSION="$(read_env_value PACKAGE_RELEASE_VERSION 2>/dev/null || true)"
MODE_PACKAGE=""
if [[ -n "$PACKAGE_VERSION" ]]; then
  MODE_PACKAGE=1
fi

if [[ -z "$AUTH_EMAIL" || -z "$AUTH_PASSWORD" ]]; then
  echo "AUTH_EMAIL/AUTH_PASSWORD ausentes. Defina no ambiente ou em .env.api." >&2
  exit 1
fi

COOKIE_JAR="$(mktemp)"
RESPONSE_FILE="$(mktemp)"
SUFFIX="$(date +%s)"
CLIENT_CODE="BST-$SUFFIX"
SITE_CODE="BST-SITE-$SUFFIX"
NODE_UID="bst-fw-$SUFFIX"
RELEASE_BASE_URL="https://downloads.systemup.inf.br/monitor-pfsense-smoke-$SUFFIX"
CONTROLLER_URL="https://pfs-monitor-hml.systemup.inf.br"

cleanup() {
  rm -f "$COOKIE_JAR" "$RESPONSE_FILE"
}

trap cleanup EXIT

json_get() {
  local json="$1"
  local expression="$2"

  node -e '
const payload = JSON.parse(process.argv[1]);
const expression = process.argv[2].split(".");
let current = payload;
for (const part of expression) {
  if (/^\d+$/.test(part)) {
    current = current?.[Number(part)];
  } else {
    current = current?.[part];
  }
}
if (current === undefined || current === null) {
  process.exit(1);
}
if (typeof current === "object") {
  process.stdout.write(JSON.stringify(current));
} else {
  process.stdout.write(String(current));
}
' "$json" "$expression"
}

request_json() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local csrf_header=()

  if [[ "$method" != "GET" ]]; then
    local csrf_token
    csrf_token="$(awk '$6=="monitor_pfsense_csrf"{print $7}' "$COOKIE_JAR")"
    if [[ -n "$csrf_token" ]]; then
      csrf_header=(-H "x-csrf-token: $csrf_token")
    fi
  fi

  if [[ -n "$body" ]]; then
    curl -skS \
      -b "$COOKIE_JAR" \
      -c "$COOKIE_JAR" \
      -H "content-type: application/json" \
      "${csrf_header[@]}" \
      -X "$method" \
      "$BASE_URL$path" \
      --data "$body"
  else
    curl -skS \
      -b "$COOKIE_JAR" \
      -c "$COOKIE_JAR" \
      "${csrf_header[@]}" \
      -X "$method" \
      "$BASE_URL$path"
  fi
}

echo "[1/7] Login administrativo"
LOGIN_RESPONSE="$(curl -skS \
  -b "$COOKIE_JAR" \
  -c "$COOKIE_JAR" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}")"
json_get "$LOGIN_RESPONSE" "ok" >/dev/null

echo "[2/7] Criando client/site/node para o fluxo de bootstrap"
CLIENT_RESPONSE="$(request_json POST /api/v1/admin/clients "{\"name\":\"Bootstrap Smoke $SUFFIX\",\"code\":\"$CLIENT_CODE\"}")"
CLIENT_ID="$(json_get "$CLIENT_RESPONSE" "client.id")"
SITE_RESPONSE="$(request_json POST /api/v1/admin/sites "{\"client_id\":\"$CLIENT_ID\",\"name\":\"Bootstrap Site $SUFFIX\",\"code\":\"$SITE_CODE\"}")"
SITE_ID="$(json_get "$SITE_RESPONSE" "site.id")"
NODE_RESPONSE="$(request_json POST /api/v1/admin/nodes "{\"site_id\":\"$SITE_ID\",\"node_uid\":\"$NODE_UID\",\"hostname\":\"$NODE_UID.local\",\"display_name\":\"Bootstrap Firewall $SUFFIX\",\"management_ip\":\"10.251.0.1\",\"wan_ip\":\"198.51.100.61\",\"pfsense_version\":\"2.8.1\"}")"
NODE_ID="$(json_get "$NODE_RESPONSE" "node.id")"
NODE_SECRET_HINT="$(json_get "$NODE_RESPONSE" "bootstrap.secret_hint")"

if [[ -n "$MODE_PACKAGE" ]]; then
  echo "[3/7] (modo package) Validando package_command presente"
  BOOTSTRAP_RESPONSE_NO_OVERRIDE="$(request_json GET "/api/v1/admin/nodes/$NODE_ID/bootstrap-command")"
  PACKAGE_CMD="$(json_get "$BOOTSTRAP_RESPONSE_NO_OVERRIDE" "package_command" 2>/dev/null || true)"
  [[ -n "$PACKAGE_CMD" ]]
  grep -q "monitor-pfsense-package-v${PACKAGE_VERSION}.tar.gz" <<<"$PACKAGE_CMD"
  grep -q 'install-from-release.sh' <<<"$PACKAGE_CMD"
  grep -q -- '--sha256' <<<"$PACKAGE_CMD"
  grep -q -- '--node-uid' <<<"$PACKAGE_CMD"
  grep -q -- '--customer-code' <<<"$PACKAGE_CMD"

  NODE_PAGE_NO_OVERRIDE="$(curl -skS -b "$COOKIE_JAR" "$BASE_URL/nodes/$NODE_ID")"
  grep -q "$NODE_SECRET_HINT" <<<"$NODE_PAGE_NO_OVERRIDE"

  echo "[4/7] (modo package) Comando package homologado OK"
  BOOTSTRAP_COMMAND="$PACKAGE_CMD"
else
  echo "[3/7] Validando fallback sem release_base_url configurada"
  BOOTSTRAP_RESPONSE_NO_OVERRIDE="$(request_json GET "/api/v1/admin/nodes/$NODE_ID/bootstrap-command")"
  [[ "$(json_get "$BOOTSTRAP_RESPONSE_NO_OVERRIDE" "command" || true)" == "" ]]
  [[ "$(json_get "$BOOTSTRAP_RESPONSE_NO_OVERRIDE" "release.ready")" == "false" ]]

  NODE_PAGE_NO_OVERRIDE="$(curl -skS -b "$COOKIE_JAR" "$BASE_URL/nodes/$NODE_ID")"
  grep -q 'Configure `AGENT_BOOTSTRAP_RELEASE_BASE_URL` na API' <<<"$NODE_PAGE_NO_OVERRIDE"
  grep -q "$NODE_SECRET_HINT" <<<"$NODE_PAGE_NO_OVERRIDE"

  echo "[4/7] Validando comando de bootstrap com override temporario"
  BOOTSTRAP_RESPONSE_OVERRIDE="$(request_json GET "/api/v1/admin/nodes/$NODE_ID/bootstrap-command?release_base_url=$RELEASE_BASE_URL&controller_url=$CONTROLLER_URL")"
  [[ "$(json_get "$BOOTSTRAP_RESPONSE_OVERRIDE" "release.ready")" == "true" ]]
  [[ "$(json_get "$BOOTSTRAP_RESPONSE_OVERRIDE" "release.release_base_url")" == "$RELEASE_BASE_URL" ]]
  [[ "$(json_get "$BOOTSTRAP_RESPONSE_OVERRIDE" "release.controller_url")" == "$CONTROLLER_URL" ]]
  BOOTSTRAP_COMMAND="$(json_get "$BOOTSTRAP_RESPONSE_OVERRIDE" "command")"
  grep -q "$RELEASE_BASE_URL/monitor-pfsense-agent-v0.1.0.tar.gz" <<<"$BOOTSTRAP_COMMAND"
  grep -q "$RELEASE_BASE_URL/monitor-pfsense-agent-v0.1.0.tar.gz.sha256" <<<"$BOOTSTRAP_COMMAND"
  grep -q 'SHA256_VALUE=$(awk' <<<"$BOOTSTRAP_COMMAND"
  grep -q -- '--sha256' <<<"$BOOTSTRAP_COMMAND"
  grep -q -- "--controller-url '$CONTROLLER_URL'" <<<"$BOOTSTRAP_COMMAND"
  grep -q -- "--node-uid '$NODE_UID'" <<<"$BOOTSTRAP_COMMAND"
fi

echo "[5/7] Validando renderizacao da tela do node"
if [[ -n "$MODE_PACKAGE" ]]; then
  NODE_PAGE_OVERRIDE="$(curl -skS -b "$COOKIE_JAR" "$BASE_URL/nodes/$NODE_ID")"
  grep -qE 'Comando (principal|one-shot)' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'install-from-release.sh' <<<"$NODE_PAGE_OVERRIDE"
  grep -q "monitor-pfsense-package-v${PACKAGE_VERSION}.tar.gz" <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'Diagnostics' <<<"$NODE_PAGE_OVERRIDE"
else
  ENCODED_RELEASE_BASE_URL="$(node -p 'encodeURIComponent(process.argv[1])' "$RELEASE_BASE_URL")"
  ENCODED_CONTROLLER_URL="$(node -p 'encodeURIComponent(process.argv[1])' "$CONTROLLER_URL")"
  NODE_PAGE_OVERRIDE="$(curl -skS -b "$COOKIE_JAR" "$BASE_URL/nodes/$NODE_ID?release_base_url=$ENCODED_RELEASE_BASE_URL&controller_url=$ENCODED_CONTROLLER_URL")"
  grep -q 'Overrides ativos para esta visualizacao' <<<"$NODE_PAGE_OVERRIDE"
  grep -q "$RELEASE_BASE_URL" <<<"$NODE_PAGE_OVERRIDE"
  grep -q "$CONTROLLER_URL" <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'Comando one-shot para usar em' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'install-from-release.sh --release-url' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'monitor-pfsense-agent.sha256' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'Pre-check da rodada' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'Abrir preflight da rodada' <<<"$NODE_PAGE_OVERRIDE"
  grep -q "/bootstrap?bucket=pending&amp;search=$NODE_UID&amp;node_id=$NODE_ID" <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'Pre-check no pfSense' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'Diagnostics &gt; Command Prompt' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'cat /etc/version' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'drill pfs-monitor-hml.systemup.inf.br' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'drill downloads.systemup.inf.br' <<<"$NODE_PAGE_OVERRIDE"
  grep -q "fetch -qo /tmp/monitor-controller-check.out '$CONTROLLER_URL/healthz'" <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'Sinais esperados na execucao' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'validacao positiva de `SHA256`' <<<"$NODE_PAGE_OVERRIDE"
  grep -q '/usr/local/etc/rc.d/monitor_pfsense_agent' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'Se a execucao falhar' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'capture a saida completa do shell' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'SHA256 mismatch' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'Verificacao pos-bootstrap' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'service monitor_pfsense_agent status' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'test-connection' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'tail -n 50 /var/log/monitor-pfsense-agent.log' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'Evidencias da rodada' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'agent_release_version: 0.1.0' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'test_connection_resultado: \[preencher apos a rodada\]' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'painel_online_evidencia: \[preencher com print ou anotacao\]' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'Criterios de aceite' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'bootstrap sem ajuste manual fora do fluxo versionado' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'Classificacao inicial de falha' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'erro de autenticacao HMAC' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'Verificacao no controlador' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'Abrir auditoria de test-connection' <<<"$NODE_PAGE_OVERRIDE"
  grep -q "action=ingest.test_connection" <<<"$NODE_PAGE_OVERRIDE"
  grep -q "target_id=$NODE_ID" <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'Fechamento da rodada' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'atualize `LEITURA-INICIAL.md` com o resultado da rodada' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'decida o proximo passo: endurecer bootstrap/agente ou avancar para a GUI nativa' <<<"$NODE_PAGE_OVERRIDE"
  grep -q 'corrija a causa no fluxo versionado antes de repetir a rodada' <<<"$NODE_PAGE_OVERRIDE"
fi

echo "[6/7] Validando tela /bootstrap com filtros do node criado"
if [[ -n "$MODE_PACKAGE" ]]; then
  BOOTSTRAP_PAGE="$(curl -skS -b "$COOKIE_JAR" "$BASE_URL/bootstrap?search=$NODE_UID&bucket=pending&node_id=$NODE_ID")"
else
  ENCODED_RELEASE_BASE_URL="${ENCODED_RELEASE_BASE_URL:-$(node -p 'encodeURIComponent(process.argv[1])' "$RELEASE_BASE_URL")}"
  ENCODED_CONTROLLER_URL="${ENCODED_CONTROLLER_URL:-$(node -p 'encodeURIComponent(process.argv[1])' "$CONTROLLER_URL")}"
  BOOTSTRAP_PAGE="$(curl -skS -b "$COOKIE_JAR" "$BASE_URL/bootstrap?search=$NODE_UID&bucket=pending&node_id=$NODE_ID&release_base_url=$ENCODED_RELEASE_BASE_URL&controller_url=$ENCODED_CONTROLLER_URL")"
fi
grep -q "$NODE_UID" <<<"$BOOTSTRAP_PAGE"
grep -q 'verify-bootstrap-release.sh' <<<"$BOOTSTRAP_PAGE"
grep -q 'run-bootstrap-preflight.sh' <<<"$BOOTSTRAP_PAGE"
grep -qE 'Comando (one-shot|principal)' <<<"$BOOTSTRAP_PAGE"
grep -q "$NODE_ID" <<<"$BOOTSTRAP_PAGE"
if [[ -z "$MODE_PACKAGE" ]]; then
  grep -q 'Bootstrap do agente' <<<"$BOOTSTRAP_PAGE"
  grep -q 'pronto p/ bootstrap' <<<"$BOOTSTRAP_PAGE"
  grep -q 'Preflight local' <<<"$BOOTSTRAP_PAGE"
  grep -q 'Rodada manual' <<<"$BOOTSTRAP_PAGE"
  grep -q 'Pacote operacional do node selecionado' <<<"$BOOTSTRAP_PAGE"
  grep -q 'Comando one-shot para colar em `Diagnostics &gt; Command Prompt`.' <<<"$BOOTSTRAP_PAGE"
  grep -q 'Verificacao pos-bootstrap recomendada pelo backend' <<<"$BOOTSTRAP_PAGE"
  grep -q 'Pre-check no pfSense' <<<"$BOOTSTRAP_PAGE"
  grep -q 'cat /etc/version' <<<"$BOOTSTRAP_PAGE"
  grep -q 'drill pfs-monitor-hml.systemup.inf.br' <<<"$BOOTSTRAP_PAGE"
  grep -q 'drill downloads.systemup.inf.br' <<<"$BOOTSTRAP_PAGE"
  grep -q "fetch -qo /tmp/monitor-controller-check.out '$CONTROLLER_URL/healthz'" <<<"$BOOTSTRAP_PAGE"
  grep -q 'Evidencias da rodada' <<<"$BOOTSTRAP_PAGE"
  grep -q 'test_connection_resultado: \[preencher apos a rodada\]' <<<"$BOOTSTRAP_PAGE"
  grep -q 'painel_online_evidencia: \[preencher com print ou anotacao\]' <<<"$BOOTSTRAP_PAGE"
  grep -q "$RELEASE_BASE_URL" <<<"$BOOTSTRAP_PAGE"
  grep -q "$CONTROLLER_URL" <<<"$BOOTSTRAP_PAGE"
fi

echo "[7/7] Validando bucket ativo apos simular agente instalado"
UPDATE_NODE_RESPONSE="$(request_json POST "/api/v1/admin/nodes/$NODE_ID" '{"agent_version":"0.1.0"}')"
[[ "$(json_get "$UPDATE_NODE_RESPONSE" "node.agent_version")" == "0.1.0" ]]
BOOTSTRAP_PAGE_ACTIVE="$(curl -skS -b "$COOKIE_JAR" "$BASE_URL/bootstrap?search=$NODE_UID&bucket=active")"
grep -q 'agente ativo' <<<"$BOOTSTRAP_PAGE_ACTIVE"
grep -q "$NODE_UID" <<<"$BOOTSTRAP_PAGE_ACTIVE"

echo "Smoke bootstrap OK: fallback, override temporario, detalhe do node e buckets operacionais validados."
