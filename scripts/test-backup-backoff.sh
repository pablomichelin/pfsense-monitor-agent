#!/usr/bin/env bash
# Valida classify_upload_error, exponential backoff e backup_backoff_blocks_scheduled.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_SH="$ROOT/packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh"
TMP_DIR="$(mktemp -d)"
failures=0

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "OK   $label -> $actual"
  else
    echo "FAIL $label: esperado '$expected', obteve '$actual'"
    failures=$((failures + 1))
  fi
}

# Carrega funcoes de backoff do agente sem executar o script inteiro.
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

extract_agent_functions() {
  sed -n '/^backup_state_dir()/,/^process_heartbeat_commands()/{ /^process_heartbeat_commands()/d; p; }' "$AGENT_SH" >"$TMP_DIR/agent-fns.sh"
  # shellcheck source=/dev/null
  . "$TMP_DIR/agent-fns.sh"
}

export MONITOR_AGENT_CONFIG_BACKUP_STATE_DIR="$TMP_DIR/state"
mkdir -p "$MONITOR_AGENT_CONFIG_BACKUP_STATE_DIR"

extract_agent_functions

echo "=== classify_upload_error ==="
assert_eq "502 upstream" "upstream" "$(classify_upload_error 502 "")"
assert_eq "503 upstream" "upstream" "$(classify_upload_error 503 "")"
assert_eq "408 timeout" "timeout" "$(classify_upload_error 408 "")"
assert_eq "401 auth" "auth" "$(classify_upload_error 401 "")"
assert_eq "413 client" "client" "$(classify_upload_error 413 "")"
assert_eq "200 success" "success" "$(classify_upload_error 200 "")"
assert_eq "curl timeout" "timeout" "$(classify_upload_error "" "Operation timed out after 30 seconds")"
assert_eq "connection reset" "upstream" "$(classify_upload_error "" "Recv failure: Connection reset by peer")"

echo ""
echo "=== backup_backoff_record_failure (502 -> ~5min) ==="
backup_backoff_clear
backup_backoff_record_failure 502 "" 2>"$TMP_DIR/backoff.log" || true
if grep -q 'backup-backoff class=upstream http=502' "$TMP_DIR/backoff.log"; then
  echo "OK   log estruturado backup-backoff"
else
  echo "FAIL log estruturado backup-backoff"
  failures=$((failures + 1))
fi

if [[ -f "$(backup_backoff_path)" ]]; then
  delay_check=$(php -r '
    $data = json_decode(file_get_contents($argv[1]), true);
    $next = strtotime($data["next_attempt_at"] ?? "");
    $delay = $next - time();
    echo ($data["consecutive_failures"] ?? 0) . " " . $delay;
  ' "$(backup_backoff_path)")
  failures_count="${delay_check%% *}"
  delay_seconds="${delay_check#* }"
  if [[ "$failures_count" == "1" ]] && [[ "$delay_seconds" -ge 270 ]] && [[ "$delay_seconds" -le 330 ]]; then
    echo "OK   primeira falha 502 -> backoff ~5min (${delay_seconds}s)"
  else
    echo "FAIL primeira falha 502: failures=$failures_count delay=${delay_seconds}s"
    failures=$((failures + 1))
  fi
else
  echo "FAIL arquivo backoff nao criado"
  failures=$((failures + 1))
fi

echo ""
echo "=== backup_backoff_blocks_scheduled ==="
if backup_backoff_blocks_scheduled; then
  echo "OK   backoff ativo bloqueia agendado"
else
  echo "FAIL backoff deveria bloquear agendado"
  failures=$((failures + 1))
fi

# Simula expiracao do backoff
php -r '
  $path = $argv[1];
  $data = json_decode(file_get_contents($path), true);
  $data["next_attempt_at"] = gmdate("Y-m-d\TH:i:s\Z", time() - 60);
  file_put_contents($path, json_encode($data));
' "$(backup_backoff_path)"

if backup_backoff_blocks_scheduled; then
  echo "FAIL backoff expirado ainda bloqueia"
  failures=$((failures + 1))
else
  echo "OK   backoff expirado libera agendado"
fi

echo ""
echo "=== backup_backoff_clear ==="
backup_backoff_clear
if [[ ! -f "$(backup_backoff_path)" ]]; then
  echo "OK   sucesso limpa backoff"
else
  echo "FAIL sucesso deveria remover arquivo backoff"
  failures=$((failures + 1))
fi

echo ""
echo "=== config_backup_now bypass (nao usa backup_should_run_scheduled) ==="
if grep -q 'config_backup_now)' "$AGENT_SH" && grep -A2 'config_backup_now)' "$AGENT_SH" | grep -q 'backup_config_now "$command_id"'; then
  echo "OK   config_backup_now chama backup_config_now com command_id (bypass backoff agendado)"
else
  echo "FAIL config_backup_now nao encontrado ou sem bypass"
  failures=$((failures + 1))
fi

echo ""
if [[ "$failures" -gt 0 ]]; then
  echo "RESULTADO: $failures falha(s)"
  exit 1
fi
echo "RESULTADO: todos os cenarios passaram"
