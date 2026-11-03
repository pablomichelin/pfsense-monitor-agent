<?php
// Capture PHP's native syslog API in an isolated namespace without touching services.
$path = __DIR__.'/../files/usr/local/libexec/monitor-pfsense-agent/agent_watchdog.php';
$source = file_get_contents($path);
$fixture = preg_replace('/declare\(strict_types=1\);/', 'declare(strict_types=1); namespace WatchdogLoggingFixture;', $source, 1);
$fixture = str_replace("__DIR__.'/recovery_channel.php'", var_export(dirname($path).'/recovery_channel.php', true), $fixture);
$fixture = preg_replace('/^#![^\n]*\n<\?php\s*/', '', $fixture, 1);
eval('namespace WatchdogLoggingFixture; $events = []; function openlog($id, $options, $facility) { global $events; $events[] = ["open", $id, $options, $facility]; return true; } function syslog($priority, $message) { global $events; $events[] = ["write", $priority, $message]; return true; } function closelog() { global $events; $events[] = ["close"]; return true; }');
eval($fixture);
$n = 0;
function check($ok, $label) { global $n; if (!$ok) throw new RuntimeException($label); ++$n; echo "PASS $label\n"; }
$oldLog = ini_get('error_log');
$log = tempnam(sys_get_temp_dir(), 'watchdog-log-test-');
ini_set('error_log', $log);
try {
    foreach (['systemup-agent-recovery', 'systemup-agent-watchdog'] as $component) {
        $GLOBALS['events'] = [];
        \WatchdogLoggingFixture\watchdog_log($component, 'recovery transport unavailable (HTTP 401)');
        $events = $GLOBALS['events'];
        check($events[0] === ['open', $component, LOG_PID, LOG_DAEMON], "$component daemon facility");
        check($events[1] === ['write', LOG_WARNING, 'recovery transport unavailable (HTTP 401)'], "$component visible warning");
        check($events[2] === ['close'] && count($events) === 3, "$component logger closed");
    }
    clearstatcache(true, $log);
    check(filesize($log) === 0, 'handled failures do not write PHP crash log');
    check(!preg_match('/\berror_log\s*\(/', $source), 'supervisor has no operational PHP error_log calls');
    foreach (['systemup-agent-recovery', 'systemup-agent-watchdog'] as $component) {
        check(str_contains($source, "watchdog_log('$component', \$e->getMessage())"), "$component catch routes to syslog");
    }
} finally { ini_set('error_log', $oldLog); unlink($log); }
echo "$n cases passed\n";
