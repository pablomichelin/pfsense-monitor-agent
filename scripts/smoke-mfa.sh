#!/usr/bin/env bash

# C-MFA: smoke fim a fim do MFA TOTP.
# Fluxo: cria usuario -> enroll (secret/QR + verify) -> login 2 etapas com TOTP ->
# login com codigo de recuperacao (consumo unico) -> reuso do recovery rejeitado.
# API-first. Usuario criado com prefixo mfa-smoke-<ts> (removido pelo purge oficial).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:8088}"
OTPLIB_DIR="$ROOT_DIR/apps/api/node_modules/otplib"

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

if [[ ! -d "$OTPLIB_DIR" ]]; then
  echo "otplib nao encontrado em $OTPLIB_DIR (rode npm install em apps/api)." >&2
  exit 1
fi

COOKIE_ADMIN="$(mktemp)"
COOKIE_USER="$(mktemp)"
RESPONSE_FILE="$(mktemp)"

cleanup() {
  rm -f "$COOKIE_ADMIN" "$COOKIE_USER" "$RESPONSE_FILE"
}
trap cleanup EXIT

json_get() {
  node -e '
const payload = JSON.parse(process.argv[1]);
const expression = process.argv[2].split(".");
let current = payload;
for (const part of expression) {
  current = /^\d+$/.test(part) ? current?.[Number(part)] : current?.[part];
}
if (current === undefined || current === null) { process.exit(1); }
process.stdout.write(typeof current === "object" ? JSON.stringify(current) : String(current));
' "$1" "$2"
}

totp_now() {
  # $1 = secret base32
  OTPLIB_DIR="$OTPLIB_DIR" node -e '
const { authenticator } = require(process.env.OTPLIB_DIR);
process.stdout.write(authenticator.generate(process.argv[1]));
' "$1"
}

csrf_for() {
  awk '$6=="monitor_pfsense_csrf"{print $7}' "$1"
}

echo "[1/9] Login do superadmin bootstrap"
curl -skS -c "$COOKIE_ADMIN" -H "content-type: application/json" -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}" >/dev/null
ADMIN_CSRF="$(csrf_for "$COOKIE_ADMIN")"
[[ -n "$ADMIN_CSRF" ]]

echo "[2/9] Criando usuario humano dedicado para o smoke de MFA"
TS="$(date +%s)"
USER_EMAIL="mfa-smoke-$TS@systemup.inf.br"
USER_PASSWORD="MfaSmoke!$TS"
CREATE_STATUS="$(curl -skS -o "$RESPONSE_FILE" -w "%{http_code}" \
  -b "$COOKIE_ADMIN" -H "content-type: application/json" -H "x-csrf-token: $ADMIN_CSRF" \
  -X POST "$BASE_URL/api/v1/admin/users" \
  --data "{\"email\":\"$USER_EMAIL\",\"display_name\":\"MFA Smoke $TS\",\"password\":\"$USER_PASSWORD\",\"role\":\"operator\",\"status\":\"active\"}")"
[[ "$CREATE_STATUS" == "200" || "$CREATE_STATUS" == "201" ]]

echo "[3/9] Login do usuario (ainda sem MFA) deve criar sessao direta"
LOGIN1="$(curl -skS -c "$COOKIE_USER" -H "content-type: application/json" -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\"}")"
[[ "$(json_get "$LOGIN1" "mfa_required")" == "false" ]]
USER_CSRF="$(csrf_for "$COOKIE_USER")"
[[ -n "$USER_CSRF" ]]

echo "[4/9] Enrollment: start (gera secret + QR otpauth)"
START="$(curl -skS -b "$COOKIE_USER" -H "content-type: application/json" -H "x-csrf-token: $USER_CSRF" \
  -X POST "$BASE_URL/api/v1/auth/mfa/enroll/start")"
SECRET="$(json_get "$START" "secret")"
[[ -n "$SECRET" ]]
OTPAUTH="$(json_get "$START" "otpauth_uri")"
grep -q '^otpauth://totp/' <<<"$OTPAUTH"
QR="$(json_get "$START" "qr_data_url")"
grep -q '^data:image/png;base64,' <<<"$QR"

echo "[5/9] Enrollment: verify com TOTP valido habilita o MFA e retorna recovery codes"
CODE="$(totp_now "$SECRET")"
VERIFY="$(curl -skS -b "$COOKIE_USER" -H "content-type: application/json" -H "x-csrf-token: $USER_CSRF" \
  -X POST "$BASE_URL/api/v1/auth/mfa/enroll/verify" --data "{\"code\":\"$CODE\"}")"
RECOVERY0="$(json_get "$VERIFY" "recovery_codes.0")"
[[ -n "$RECOVERY0" ]]
STATUS_JSON="$(curl -skS -b "$COOKIE_USER" "$BASE_URL/api/v1/auth/mfa/status")"
[[ "$(json_get "$STATUS_JSON" "enabled")" == "true" ]]

echo "[6/9] Novo login agora exige desafio MFA (sem cookie de sessao)"
: > "$COOKIE_USER"
LOGIN2="$(curl -skS -c "$COOKIE_USER" -H "content-type: application/json" -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\"}")"
[[ "$(json_get "$LOGIN2" "mfa_required")" == "true" ]]
MFA_TOKEN="$(json_get "$LOGIN2" "mfa_token")"
[[ -n "$MFA_TOKEN" ]]
# Sem cookie de sessao ainda
ME_STATUS_PRE="$(curl -skS -o /dev/null -w "%{http_code}" -b "$COOKIE_USER" "$BASE_URL/api/v1/auth/me")"
[[ "$ME_STATUS_PRE" == "401" ]]

echo "[7/9] Segunda etapa do login com TOTP cria a sessao"
# Garante codigo de janela diferente do verify, evitando colisao.
sleep 1
CODE2="$(totp_now "$SECRET")"
LOGIN2B="$(curl -skS -c "$COOKIE_USER" -H "content-type: application/json" -X POST \
  "$BASE_URL/api/v1/auth/login/mfa" \
  --data "{\"mfa_token\":\"$MFA_TOKEN\",\"code\":\"$CODE2\"}")"
[[ "$(json_get "$LOGIN2B" "user.email")" == "$USER_EMAIL" ]]
ME_STATUS_POST="$(curl -skS -o /dev/null -w "%{http_code}" -b "$COOKIE_USER" "$BASE_URL/api/v1/auth/me")"
[[ "$ME_STATUS_POST" == "200" ]]

echo "[8/9] Login com codigo de recuperacao (consumo unico)"
: > "$COOKIE_USER"
LOGIN3="$(curl -skS -c "$COOKIE_USER" -H "content-type: application/json" -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\"}")"
MFA_TOKEN3="$(json_get "$LOGIN3" "mfa_token")"
RECOVERY_LOGIN="$(curl -skS -c "$COOKIE_USER" -H "content-type: application/json" -X POST \
  "$BASE_URL/api/v1/auth/login/mfa" \
  --data "{\"mfa_token\":\"$MFA_TOKEN3\",\"code\":\"$RECOVERY0\"}")"
[[ "$(json_get "$RECOVERY_LOGIN" "user.email")" == "$USER_EMAIL" ]]

echo "[9/9] Reuso do mesmo codigo de recuperacao deve ser rejeitado"
LOGIN4="$(curl -skS -H "content-type: application/json" -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\"}")"
MFA_TOKEN4="$(json_get "$LOGIN4" "mfa_token")"
REUSE_STATUS="$(curl -skS -o /dev/null -w "%{http_code}" -H "content-type: application/json" -X POST \
  "$BASE_URL/api/v1/auth/login/mfa" \
  --data "{\"mfa_token\":\"$MFA_TOKEN4\",\"code\":\"$RECOVERY0\"}")"
[[ "$REUSE_STATUS" == "401" ]]

echo "Smoke MFA OK: enroll, login TOTP em 2 etapas e codigo de recuperacao (consumo unico) validados."
