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

if [[ -z "$AUTH_EMAIL" || -z "$AUTH_PASSWORD" ]]; then
  echo "AUTH_EMAIL/AUTH_PASSWORD ausentes. Defina no ambiente ou em .env.api." >&2
  exit 1
fi

COOKIE_A="$(mktemp)"
COOKIE_B="$(mktemp)"
COOKIE_C="$(mktemp)"
RESPONSE_FILE="$(mktemp)"

cleanup() {
  rm -f "$COOKIE_A" "$COOKIE_B" "$COOKIE_C" "$RESPONSE_FILE"
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

csrf_header_for() {
  local cookie_jar="$1"
  local csrf_token

  csrf_token="$(awk '$6=="monitor_pfsense_csrf"{print $7}' "$cookie_jar")"
  if [[ -n "$csrf_token" ]]; then
    printf '%s' "$csrf_token"
  fi
}

request_with_status() {
  local cookie_jar="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
  local csrf_token
  local csrf_args=()

  csrf_token="$(csrf_header_for "$cookie_jar")"
  if [[ -n "$csrf_token" && "$method" != "GET" ]]; then
    csrf_args=(-H "x-csrf-token: $csrf_token")
  fi

  if [[ -n "$body" ]]; then
    curl -skS \
      -o "$RESPONSE_FILE" \
      -w "%{http_code}" \
      -b "$cookie_jar" \
      -c "$cookie_jar" \
      -H "content-type: application/json" \
      "${csrf_args[@]}" \
      -X "$method" \
      "$BASE_URL$path" \
      --data "$body"
  else
    curl -skS \
      -o "$RESPONSE_FILE" \
      -w "%{http_code}" \
      -b "$cookie_jar" \
      -c "$cookie_jar" \
      "${csrf_args[@]}" \
      -X "$method" \
      "$BASE_URL$path"
  fi
}

echo "[1/10] Abrindo duas sessoes humanas independentes"
LOGIN_A="$(curl -skS \
  -b "$COOKIE_A" \
  -c "$COOKIE_A" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}")"
LOGIN_B="$(curl -skS \
  -b "$COOKIE_B" \
  -c "$COOKIE_B" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}")"

SESSION_A_ID="$(json_get "$LOGIN_A" "user.id" >/dev/null; curl -skS -b "$COOKIE_A" "$BASE_URL/api/v1/auth/me" | node -e 'const payload = JSON.parse(require("fs").readFileSync(0, "utf8")); process.stdout.write(payload.session.id);')"
SESSION_B_ID="$(curl -skS -b "$COOKIE_B" "$BASE_URL/api/v1/auth/me" | node -e 'const payload = JSON.parse(require("fs").readFileSync(0, "utf8")); process.stdout.write(payload.session.id);')"
[[ "$SESSION_A_ID" != "$SESSION_B_ID" ]]

echo "[2/10] Listando sessoes da conta atual"
SESSIONS_RESPONSE="$(curl -skS -b "$COOKIE_A" "$BASE_URL/api/v1/auth/sessions")"
[[ "$(json_get "$SESSIONS_RESPONSE" "items.0.id" || true)" != "" ]]
[[ "$(json_get "$SESSIONS_RESPONSE" "items.0.current" || true)" != "" ]]

COUNT="$(node -e 'const payload = JSON.parse(process.argv[1]); process.stdout.write(String(payload.items.length));' "$SESSIONS_RESPONSE")"
if [[ "$COUNT" -lt 2 ]]; then
  echo "Esperava ao menos 2 sessoes abertas para a mesma conta." >&2
  echo "$SESSIONS_RESPONSE" >&2
  exit 1
fi

echo "[3/10] Validando renderizacao da tela /sessions"
SESSIONS_PAGE="$(curl -skS -b "$COOKIE_A" "$BASE_URL/sessions")"
grep -q 'Sessoes da conta' <<<"$SESSIONS_PAGE"
grep -q 'Revogar sessao' <<<"$SESSIONS_PAGE"
grep -q "$SESSION_B_ID" <<<"$SESSIONS_PAGE"

echo "[4/10] Criando usuario humano adicional para governanca administrativa"
USER_SUFFIX="$(date +%s)"
USER_EMAIL="session-audit-$USER_SUFFIX@systemup.inf.br"
USER_PASSWORD="SessionAudit!$USER_SUFFIX"

CREATE_USER_STATUS="$(request_with_status "$COOKIE_A" POST "/api/v1/admin/users" "{\"email\":\"$USER_EMAIL\",\"display_name\":\"Session Audit $USER_SUFFIX\",\"password\":\"$USER_PASSWORD\",\"role\":\"operator\",\"status\":\"active\"}")"
[[ "$CREATE_USER_STATUS" == "200" || "$CREATE_USER_STATUS" == "201" ]]
USER_ID="$(node -e 'const payload = JSON.parse(require("fs").readFileSync(0, "utf8")); process.stdout.write(payload.user.id);' < "$RESPONSE_FILE")"

LOGIN_C="$(curl -skS \
  -b "$COOKIE_C" \
  -c "$COOKIE_C" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\"}")"
SESSION_C_ID="$(curl -skS -b "$COOKIE_C" "$BASE_URL/api/v1/auth/me" | node -e 'const payload = JSON.parse(require("fs").readFileSync(0, "utf8")); process.stdout.write(payload.session.id);')"
[[ -n "$SESSION_C_ID" ]]

echo "[5/10] Validando listagem administrativa das sessoes do usuario criado"
ADMIN_SESSIONS_STATUS="$(request_with_status "$COOKIE_A" GET "/api/v1/admin/users/$USER_ID/sessions")"
[[ "$ADMIN_SESSIONS_STATUS" == "200" ]]
ADMIN_SESSIONS_RESPONSE="$(cat "$RESPONSE_FILE")"
[[ "$(json_get "$ADMIN_SESSIONS_RESPONSE" "items.0.user_id")" == "$USER_ID" ]]

echo "[6/10] Revogando administrativamente a sessao do usuario criado"
ADMIN_REVOKE_STATUS="$(request_with_status "$COOKIE_A" POST "/api/v1/admin/users/$USER_ID/sessions/$SESSION_C_ID/revoke")"
[[ "$ADMIN_REVOKE_STATUS" == "200" || "$ADMIN_REVOKE_STATUS" == "201" ]]
ADMIN_REVOKE_RESPONSE="$(cat "$RESPONSE_FILE")"
[[ "$(json_get "$ADMIN_REVOKE_RESPONSE" "session_id")" == "$SESSION_C_ID" ]]

echo "[7/10] Confirmando que a sessao revogada administrativamente perdeu acesso"
REVOKED_ADMIN_ME_STATUS="$(request_with_status "$COOKIE_C" GET "/api/v1/auth/me")"
[[ "$REVOKED_ADMIN_ME_STATUS" == "401" ]]

echo "[8/10] Revogando a segunda sessao pela primeira"
REVOKE_STATUS="$(request_with_status "$COOKIE_A" POST "/api/v1/auth/sessions/$SESSION_B_ID/revoke")"
[[ "$REVOKE_STATUS" == "200" || "$REVOKE_STATUS" == "201" ]]
REVOKE_RESPONSE="$(cat "$RESPONSE_FILE")"
[[ "$(json_get "$REVOKE_RESPONSE" "session_id")" == "$SESSION_B_ID" ]]

echo "[9/10] Confirmando que a sessao revogada perdeu acesso"
REVOKED_ME_STATUS="$(request_with_status "$COOKIE_B" GET "/api/v1/auth/me")"
[[ "$REVOKED_ME_STATUS" == "401" ]]

echo "[10/10] Confirmando que a sessao atual nao pode se auto-revogar"
SELF_REVOKE_STATUS="$(request_with_status "$COOKIE_A" POST "/api/v1/auth/sessions/$SESSION_A_ID/revoke")"
[[ "$SELF_REVOKE_STATUS" == "403" ]]

echo "Smoke auth sessions OK: listagem propria, governanca administrativa e protecao da sessao atual validadas."
