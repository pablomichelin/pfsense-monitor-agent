#!/usr/bin/env bash
# Valida a logica de backup_should_run_scheduled (convencao: 0=pular, 1=executar com "if !").
set -euo pipefail

failures=0

assert_skip() {
  local label="$1" rc="$2"
  if [[ "$rc" -ne 0 ]]; then
    echo "FAIL $label: esperado skip (0), obteve $rc"
    failures=$((failures + 1))
  else
    echo "OK   $label -> skip"
  fi
}

assert_run() {
  local label="$1" rc="$2"
  if [[ "$rc" -ne 1 ]]; then
    echo "FAIL $label: esperado run (1), obteve $rc"
    failures=$((failures + 1))
  else
    echo "OK   $label -> run"
  fi
}

# Simula backup_should_run_scheduled corrigido
should_run() {
  local enabled=$1 due=$2 on_change=$3 changed=$4
  if [[ "$enabled" != "1" ]]; then return 0; fi
  if [[ "$due" != "1" ]]; then return 0; fi
  if [[ "$on_change" == "0" ]]; then return 1; fi
  if [[ "$changed" == "1" ]]; then return 1; fi
  return 0
}

eval_should_run() {
  local label="$1" expect="$2" enabled=$3 due=$4 on_change=$5 changed=$6
  local rc=0
  should_run "$enabled" "$due" "$on_change" "$changed" || rc=$?
  if [[ "$expect" == "skip" ]]; then
    assert_skip "$label" "$rc"
  else
    assert_run "$label" "$rc"
  fi
}

echo "=== backup_should_run_scheduled (logica corrigida) ==="
eval_should_run "desabilitado" skip 0 1 1 1
eval_should_run "agendamento nao vencido" skip 1 0 1 0
eval_should_run "vencido + on_change + hash igual" skip 1 1 1 0
eval_should_run "vencido + on_change + hash mudou" run 1 1 1 1
eval_should_run "vencido + sem on_change" run 1 1 0 0

echo ""
echo "=== backup_should_run_scheduled + backoff (0=skip quando backoff ativo) ==="
should_run_with_backoff() {
  local enabled=$1 due=$2 on_change=$3 changed=$4 backoff=$5
  if [[ "$enabled" != "1" ]]; then return 0; fi
  if [[ "$backoff" == "1" ]]; then return 0; fi
  if [[ "$due" != "1" ]]; then return 0; fi
  if [[ "$on_change" == "0" ]]; then return 1; fi
  if [[ "$changed" == "1" ]]; then return 1; fi
  return 0
}

eval_backoff() {
  local label="$1" expect="$2" enabled=$3 due=$4 on_change=$5 changed=$6 backoff=$7
  local rc=0
  should_run_with_backoff "$enabled" "$due" "$on_change" "$changed" "$backoff" || rc=$?
  if [[ "$expect" == "skip" ]]; then
    assert_skip "$label" "$rc"
  else
    assert_run "$label" "$rc"
  fi
}

eval_backoff "vencido mas backoff ativo" skip 1 1 1 0 1
eval_backoff "vencido backoff expirado + hash mudou" run 1 1 1 1 0

echo ""
echo "=== backup_schedule_due PHP (timestamp invalido nao deve ficar sempre vencido) ==="
php_invalid_rc=$(php -r '
  $lastRaw = "not-a-valid-date";
  $lastAt = $lastRaw !== "" ? strtotime($lastRaw) : false;
  if ($lastRaw !== "" && $lastAt === false) { exit(1); }
  if ($lastAt === false) { exit(0); }
  exit(1);
' ; echo $?)
if [[ "$php_invalid_rc" -eq 1 ]]; then
  echo "OK   timestamp invalido -> nao vencido (exit 1)"
else
  echo "FAIL timestamp invalido: exit $php_invalid_rc"
  failures=$((failures + 1))
fi

php_empty_rc=$(php -r '
  $lastRaw = "";
  $lastAt = $lastRaw !== "" ? strtotime($lastRaw) : false;
  if ($lastRaw !== "" && $lastAt === false) { exit(1); }
  if ($lastAt === false) { exit(0); }
  exit(1);
' ; echo $?)
if [[ "$php_empty_rc" -eq 0 ]]; then
  echo "OK   sem last_at -> vencido (primeira execucao)"
else
  echo "FAIL sem last_at: exit $php_empty_rc"
  failures=$((failures + 1))
fi

php_recent_rc=$(php -r '
  $lastRaw = trim("2026-06-14T01:57:05Z");
  $lastAt = $lastRaw !== "" ? strtotime($lastRaw) : false;
  $now = time();
  if ($lastRaw !== "" && $lastAt === false) { exit(1); }
  if ($lastAt === false) { exit(0); }
  $mode = "monthly";
  $dom = 1;
  $time = "07:00";
  preg_match("/^(\d{2}):(\d{2})$/", $time, $parts);
  $hour = (int) $parts[1];
  $minute = (int) $parts[2];
  $tz = new DateTimeZone(date_default_timezone_get());
  $cursor = new DateTime("@".$lastAt);
  $cursor->setTimezone($tz);
  $cursor->modify("+1 minute");
  $candidate = clone $cursor;
  $candidate->setDate((int) $candidate->format("Y"), (int) $candidate->format("n"), min($dom, (int) $candidate->format("t")));
  $candidate->setTime($hour, $minute, 0);
  if ($candidate <= $cursor) {
    $candidate->modify("first day of next month");
    $candidate->setDate((int) $candidate->format("Y"), (int) $candidate->format("n"), min($dom, (int) $candidate->format("t")));
    $candidate->setTime($hour, $minute, 0);
  }
  exit($now >= $candidate->getTimestamp() ? 0 : 1);
' ; echo $?)
if [[ "$php_recent_rc" -eq 1 ]]; then
  echo "OK   mensal recente -> nao vencido"
else
  echo "FAIL mensal recente: exit $php_recent_rc"
  failures=$((failures + 1))
fi

echo ""
if [[ "$failures" -gt 0 ]]; then
  echo "RESULTADO: $failures falha(s)"
  exit 1
fi
echo "RESULTADO: todos os cenarios passaram"
