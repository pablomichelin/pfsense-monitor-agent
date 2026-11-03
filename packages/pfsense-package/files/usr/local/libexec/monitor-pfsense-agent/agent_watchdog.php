#!/usr/local/bin/php
<?php
/** Local recovery supervisor: no network, command payloads or controller credentials. */
declare(strict_types=1);
require_once __DIR__.'/recovery_channel.php';

/** Handled operational failures belong in system logs, not PHP's crash report. */
function watchdog_log(string $component, string $message): void
{
    openlog($component, LOG_PID, LOG_DAEMON);
    try { syslog(LOG_WARNING, $message); }
    finally { closelog(); }
}

function watchdog_decide(array $s, array $o, int $now): array
{
    $s += ['fault' => '', 'since' => $now, 'attempts' => []];
    $s['attempts'] = array_values(array_filter($s['attempts'], fn($t) => is_int($t) && $t > $now - 3600));
    $reason = !$o['enabled'] ? 'disabled' : (!$o['identity_ok'] ? 'identity_mismatch' : ($o['busy'] ? 'operation_active' : ''));
    if ($reason !== '') { $s['fault'] = ''; $s['since'] = $now; return [$s, $reason, false]; }
    $fault = !$o['alive'] ? 'daemon_missing' : ($o['cycle_stale'] ? 'cycle_stalled' : ($o['journal_busy'] ? 'journal_stalled' : ''));
    if ($s['fault'] !== $fault) { $s['fault'] = $fault; $s['since'] = $now; }
    if ($fault === '') return [$s, 'healthy', false];
    if ($now < $s['since'] || $now - $s['since'] < ($fault === 'daemon_missing' ? 120 : 900)) return [$s, 'observing_' . $fault, false];
    if (count($s['attempts']) >= 3) return [$s, 'hourly_limit', false];
    if ($s['attempts'] && $now - max($s['attempts']) < 900) return [$s, 'cooldown', false];
    // Persist this reservation BEFORE acting, including failed/ambiguous restarts.
    $s['attempts'][] = $now;
    $s['fault'] = ''; $s['since'] = $now;
    return [$s, $fault, true];
}

function watchdog_private(string $path, bool $dir = false): void
{
    clearstatcache(true, $path);
    if (is_link($path) || ($dir ? !is_dir($path) : !is_file($path)) || fileowner($path) !== 0
        || (fileperms($path) & 0077) !== 0) throw new RuntimeException('unsafe watchdog state');
}
function watchdog_save(string $path, array $state): void
{
    $tmp = tempnam(dirname($path), '.watchdog-');
    if ($tmp === false) throw new RuntimeException('state allocation failed');
    try {
        chmod($tmp, 0600);
        $f = fopen($tmp, 'wb');
        $json = json_encode($state, JSON_THROW_ON_ERROR);
        if (!$f || fwrite($f, $json) !== strlen($json) || !fflush($f) || !fsync($f)) throw new RuntimeException('state persistence failed');
        fclose($f);
        if (!rename($tmp, $path)) throw new RuntimeException('state replacement failed');
        $d = fopen(dirname($path), 'r');
        if (!$d || !fsync($d)) throw new RuntimeException('directory sync failed');
        fclose($d);
    } finally { if (is_file($tmp)) unlink($tmp); }
}
function watchdog_cmd(array $args): array
{
    $p = proc_open($args, [0 => ['file', '/dev/null', 'r'], 1 => ['pipe', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
    if (!is_resource($p)) throw new RuntimeException('process unavailable');
    $out = stream_get_contents($pipes[1]); fclose($pipes[1]);
    return [proc_close($p), trim($out)];
}
/** Services spawn daemons. A captured stdout pipe can stay open in descendants. */
function watchdog_exec(array $args): int
{
    $p = proc_open($args, [0=>['file','/dev/null','r'], 1=>['file','/dev/null','w'], 2=>['file','/dev/null','w']], $pipes);
    if (!is_resource($p)) throw new RuntimeException('service process unavailable');
    return proc_close($p);
}
function watchdog_lock_busy(string $path): bool
{
    if (!file_exists($path) && !is_link($path)) return false;
    watchdog_private($path);
    $f = fopen($path, 'r+e');
    if (!$f) throw new RuntimeException('lock probe failed');
    $busy = !flock($f, LOCK_EX | LOCK_NB);
    fclose($f); // never unlink a kernel lock
    return $busy;
}
function watchdog_tick(): array
{
    umask(0077);
    $dir = '/conf/monitor-pfsense-agent/watchdog';
    if (!is_dir($dir) && !mkdir($dir, 0700, true)) throw new RuntimeException('state directory failed');
    watchdog_private($dir, true);
    $lockPath = $dir . '/.lock';
    if (file_exists($lockPath) || is_link($lockPath)) watchdog_private($lockPath);
    $lock = fopen($lockPath, 'c+e');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) return ['reason' => 'supervisor_busy'];
    $path = $dir . '/state.json';
    $state = [];
    if (file_exists($path) || is_link($path)) {
        watchdog_private($path);
        $state = json_decode(file_get_contents($path), true, 32, JSON_THROW_ON_ERROR);
        if (!is_array($state)) throw new RuntimeException('invalid state');
    }
    [$rc, $enabled] = watchdog_cmd(['/usr/sbin/sysrc', '-n', 'monitor_pfsense_agent_enable']);
    $enabled = $rc === 0 && strtoupper($enabled) === 'YES' && is_file('/usr/local/etc/monitor-pfsense-agent.conf');
    $pidFile = '/var/run/monitor_pfsense_agent.pid';
    $pid = is_file($pidFile) ? trim(file_get_contents($pidFile)) : '';
    $alive = false; $identity = true;
    if ($pid !== '') {
        if (!ctype_digit($pid) || (int)$pid < 2) $identity = false;
        else {
            [$rc, $args] = watchdog_cmd(['/bin/ps', '-p', $pid, '-o', 'comm=', '-o', 'args=']);
            $alive = $rc === 0 && $args !== '';
            $identity = !$alive || (preg_match('/^daemon\s+/', $args) === 1
                && str_contains($args, '/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent-loop.sh'));
        }
    }
    // Hold the SAME lease as installers through restart. CLOEXEC prevents inheritance.
    $updatePath = '/var/run/monitor-pfsense-update-operation.lock';
    if (file_exists($updatePath) || is_link($updatePath)) watchdog_private($updatePath);
    $update = fopen($updatePath, 'c+e');
    if (!$update) throw new RuntimeException('update lease unavailable');
    $busy = !flock($update, LOCK_EX | LOCK_NB);
    foreach (['/var/run/monitor-pfsense-package-upgrade.lock', '/var/run/monitor-pfsense-agent-upgrade.lock', '/var/run/monitor-pfsense-agent-operational.lock'] as $marker) {
        if (!is_file($marker)) continue;
        $raw = (string)file_get_contents($marker);
        if (!preg_match('/^pid=(\d+)$/m', $raw, $m)) { $busy = true; continue; }
        [$prc] = watchdog_cmd(['/bin/kill', '-0', $m[1]]);
        if ($prc === 0) $busy = true;
    }
    // Also protects the window before a worker obtains its operation lease.
    [$prc, $processes] = watchdog_cmd(['/bin/ps', '-ax', '-o', 'args=']);
    if ($prc !== 0) throw new RuntimeException('process inspection failed');
    foreach (explode("\n", $processes) as $line) {
        if (preg_match('~(?:/|\s)(?:run_package_upgrade|run_pfsense_upgrade|run_node_reboot|install-from-release)\.sh(?:\s|$)|monitor-pfsense-agent\.sh\s+(?:journal-execute|backup-now|backup-scheduled)(?:\s|$)~', $line)) $busy = true;
    }
    $cycle = '/var/run/monitor-pfsense-agent-cycle';
    $cycleTime = is_file($cycle) && !is_link($cycle) ? (int)filemtime($cycle) : 0;
    $now = time();
    $journal = '/conf/monitor-pfsense-agent/command-journal';
    $journalBusy = watchdog_lock_busy($journal . '/.state.lock') || watchdog_lock_busy($journal . '/.drain.lock');
    [$state, $reason, $restart] = watchdog_decide($state, ['enabled'=>$enabled, 'identity_ok'=>$identity, 'busy'=>$busy,
        'alive'=>$alive, 'cycle_stale'=>$cycleTime === 0 || $now - $cycleTime > 120, 'journal_busy'=>$journalBusy], $now);
    $state['checked_at'] = $now; $state['reason'] = $reason;
    watchdog_save($path, $state);
    // A transport failure never triggers automatic restart or disables local supervision.
    if ($enabled) {
        try {
            if (recovery_run($dir, $busy || !$identity || $restart, $state)) {
                $state['fault'] = ''; $state['since'] = time();
                watchdog_save($path, $state);
            }
        } catch (Throwable $e) { watchdog_log('systemup-agent-recovery', $e->getMessage()); }
    }
    if ($restart) {
        // Recheck enable immediately before the only permitted action.
        [$erc, $flag] = watchdog_cmd(['/usr/sbin/sysrc', '-n', 'monitor_pfsense_agent_enable']);
        if ($erc !== 0 || strtoupper($flag) !== 'YES') return ['reason'=>'disabled_before_restart'];
        $code = watchdog_exec(['/usr/bin/timeout', '--foreground', '60', '/usr/sbin/service', 'monitor_pfsense_agent', 'restart']);
        $state['last_restart_at'] = $now; $state['last_restart_exit'] = $code;
        watchdog_save($path, $state);
        openlog('systemup-agent-watchdog', LOG_PID, LOG_DAEMON);
        syslog(LOG_WARNING, 'reason=' . $reason . ' service=monitor_pfsense_agent exit=' . $code);
        closelog();
    }
    fclose($update); fclose($lock);
    return ['reason'=>$reason, 'restart_attempted'=>$restart];
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    if (PHP_SAPI !== 'cli' || posix_geteuid() !== 0) exit(77);
    $loop = ($argv[1] ?? '') === '--loop';
    do {
        try { $result = watchdog_tick(); if (!$loop) echo json_encode($result) . "\n"; }
        catch (Throwable $e) { watchdog_log('systemup-agent-watchdog', $e->getMessage()); if (!$loop) exit(1); }
        if ($loop) sleep(60);
    } while ($loop);
}
