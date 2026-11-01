<?php
/** Native root-only journal smoke: no Python, network, pfSense config or actions. */
declare(strict_types=1);

if (PHP_SAPI !== 'cli' || !function_exists('posix_geteuid') || posix_geteuid() !== 0) {
    fwrite(STDERR, "Run as root on the authorized laboratory only.\n"); exit(1);
}
$helper = $argv[1] ?? '/usr/local/libexec/monitor-pfsense-agent/command_journal.php';
if (!is_file($helper)) { fwrite(STDERR, "Journal helper not found.\n"); exit(1); }
$base = sys_get_temp_dir() . '/pfs-journal-native-' . bin2hex(random_bytes(8));
umask(0077);
mkdir($base, 0700);
$dir = $base . '/journal';
$scope = 'native-fixture|synthetic-node';
$env = array_merge(getenv(), ['J_PHP' => PHP_BINARY, 'J_HELPER' => $helper,
    'J_DIR' => $dir, 'J_SCOPE' => $scope, 'J_BASE' => $base]);
$worker = $base . '/worker.sh';
file_put_contents($worker, <<<'SH'
#!/bin/sh
set -eu
j() { "$J_PHP" "$J_HELPER" "$J_DIR" "$J_SCOPE" "$@"; }
MONITOR_JOURNAL_DELIVERY_ATTEMPT="$4"
export MONITOR_JOURNAL_DELIVERY_ATTEMPT
case "$1" in
  journal-execute)
    if [ "$2" = uncertain ]; then j intent "$2"; exit; fi
    j ack "$2" picked_up "$J_BASE/pickup.json"
    j intent "$2"
    j ack "$2" running "$J_BASE/running.json"
    j payload "$2" | "$J_PHP" -r '
      $p=json_decode(stream_get_contents(STDIN),true);
      if (($p["password"] ?? "") !== "native-synthetic-password") exit(1);
      file_put_contents(getenv("J_BASE")."/effects", "effect\n", FILE_APPEND);'
    printf '{"command_id":"cmd","delivery_attempt":0,"status":"succeeded","result_json":{"ok":true}}' | j result "$2"
    ;;
  journal-flush)
    [ -f "$J_BASE/online" ] || exit 1
    j delivered "$2" "$J_BASE/receipt.json"
    ;;
esac
SH
);
chmod($worker, 0700);

function check(bool $value, string $label): void
{
    if (!$value) throw new RuntimeException($label);
    echo "PASS " . $label . "\n";
}
function call_journal(array $args, string $input = '', bool $mustPass = true): array
{
    global $helper, $dir, $scope, $env;
    $p = proc_open(array_merge([PHP_BINARY, $helper, $dir, $scope], $args),
        [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, $env);
    if (!is_resource($p)) throw new RuntimeException('native subprocess');
    fwrite($pipes[0], $input); fclose($pipes[0]);
    $output = stream_get_contents($pipes[1]); fclose($pipes[1]);
    stream_get_contents($pipes[2]); fclose($pipes[2]);
    $code = proc_close($p);
    if ($mustPass && $code !== 0) throw new RuntimeException('native journal operation');
    return [$code, $output];
}
function erase_fixture(string $path): void
{
    if (is_dir($path) && !is_link($path)) {
        foreach (new FilesystemIterator($path) as $entry) erase_fixture($entry->getPathname());
        rmdir($path);
    } else { unlink($path); }
}

$exitCode = 0;
try {
    $common = ['ok' => true, 'command_id' => 'cmd', 'delivery_attempt' => 0, 'terminal' => false];
    file_put_contents($base . '/pickup.json', json_encode($common + ['status' => 'picked_up', 'execute' => false]));
    file_put_contents($base . '/running.json', json_encode($common + ['status' => 'running', 'execute' => true, 'recovery_required' => false]));
    file_put_contents($base . '/receipt.json', json_encode(['ok'=>true,'command_id'=>'cmd','delivery_attempt'=>0,'status'=>'succeeded']));
    $command = ['id'=>'cmd','type'=>'local_user_set_password','delivery_attempt'=>0,
        'status'=>'pending','delivery_state'=>'awaiting_pickup','payload'=>['password'=>'native-synthetic-password']];
    call_journal(['capture'], json_encode(['commands'=>[$command]]));
    call_journal(['drain', '@inbox', 'fake-curl', $worker]);
    check(call_journal(['phase', 'cmd'])[1] === 'result', 'synced result survives offline transport');
    check(file_get_contents($base.'/effects') === "effect\n", 'one pipe-fed synthetic action');
    foreach (new FilesystemIterator($dir) as $entry) {
        check(($entry->getPerms() & 0777) === 0600, 'private journal file');
        check(!str_contains((string) file_get_contents($entry->getPathname()), 'native-synthetic-password'), 'no plaintext password');
    }
    check((fileperms($dir) & 0777) === 0700, 'root-only journal directory');
    file_put_contents($dir.'/.write-orphan', 'incomplete ciphertext');
    call_journal(['drain', '', 'fake-curl', $worker]);
    touch($base.'/online');
    call_journal(['drain', '', 'fake-curl', $worker]);
    check(call_journal(['phase', 'cmd'])[1] === 'done', 'restart flushes result and persists tombstone');
    check(file_get_contents($base.'/effects') === "effect\n", 'restart does not repeat action');
    $command['id'] = 'uncertain';
    call_journal(['capture'], json_encode(['commands'=>[$command]]));
    call_journal(['drain', '@inbox', 'fake-curl', $worker]);
    $denied = ['ok'=>true,'command_id'=>'uncertain','delivery_attempt'=>0,'terminal'=>false,
        'status'=>'running','execute'=>false,'recovery_required'=>true];
    file_put_contents($base.'/denied.json', json_encode($denied));
    check(call_journal(['ack','uncertain','running',$base.'/denied.json'], '', false)[0] !== 0, 'ambiguous running does not grant action');
    $outbox = json_decode(call_journal(['outbox','uncertain'])[1], true);
    check(($outbox['result_json']['execution_recovery_status'] ?? '') === 'indeterminate', 'indeterminate result is durable');
    $record = $dir.'/cmd.json';
    chmod($record, 0644);
    check(call_journal(['phase','cmd'], '', false)[0] !== 0, 'unsafe permissions rejected');
    chmod($record, 0600);
    file_put_contents($record, '{"iv":"invalid","tag":"invalid","data":"invalid"}');
    check(call_journal(['phase','cmd'], '', false)[0] !== 0, 'corrupt ciphertext rejected');
    echo "Native journal smoke complete; no physical power-loss/HA claim.\n";
} catch (Throwable $error) {
    fwrite(STDERR, "FAIL " . $error->getMessage() . "\n"); $exitCode = 1;
} finally {
    erase_fixture($base);
}
exit($exitCode);
