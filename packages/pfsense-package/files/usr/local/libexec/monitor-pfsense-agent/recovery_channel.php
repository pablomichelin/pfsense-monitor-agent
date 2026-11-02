<?php
/** Outbound independent control channel. Never invokes the agent's journal/dispatcher. */
declare(strict_types=1);
const RECOVERY_SERVICES = ['monitor_pfsense_agent', 'unbound', 'dhcpd', 'ntpd', 'dpinger'];
function recovery_config(): array
{
    $text = (string)file_get_contents('/usr/local/etc/monitor-pfsense-agent.conf');
    $values = [];
    foreach (['CONTROLLER_URL', 'NODE_UID', 'NODE_SECRET_FILE'] as $key) {
        if (!preg_match('/^' . $key . '="([^"\r\n]+)"$/m', $text, $m)) throw new RuntimeException('recovery configuration incomplete');
        $values[$key] = $m[1];
    }
    $url = parse_url($values['CONTROLLER_URL']);
    if (($url['scheme'] ?? '') !== 'https' || empty($url['host']) || isset($url['user']) || isset($url['pass']) || isset($url['query']) || isset($url['fragment'])) throw new RuntimeException('recovery requires HTTPS controller');
    watchdog_private($values['NODE_SECRET_FILE']);
    $values['secret'] = trim((string)file_get_contents($values['NODE_SECRET_FILE']));
    if ($values['secret'] === '') throw new RuntimeException('recovery identity unavailable');
    return $values;
}
function recovery_http(array $config, string $path, array $data): array
{
    $body = json_encode($data, JSON_THROW_ON_ERROR);
    $timestamp = gmdate('Y-m-d\TH:i:s\Z');
    $sig = hash_hmac('sha256', $timestamp . "\n" . $body, $config['secret']);
    $c = curl_init(rtrim($config['CONTROLLER_URL'], '/') . $path);
    $response = '';
    curl_setopt_array($c, [CURLOPT_POST=>true, CURLOPT_POSTFIELDS=>$body, CURLOPT_CONNECTTIMEOUT=>5,
        CURLOPT_TIMEOUT=>15, CURLOPT_FOLLOWLOCATION=>false, CURLOPT_SSL_VERIFYPEER=>true, CURLOPT_SSL_VERIFYHOST=>2,
        CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS, CURLOPT_HTTPHEADER=>['Content-Type: application/json',
            'X-Node-Uid: '.$config['NODE_UID'], 'X-Timestamp: '.$timestamp, 'X-Signature: '.$sig],
        CURLOPT_WRITEFUNCTION=>function($ch, $chunk) use (&$response) {
            if (strlen($response) + strlen($chunk) > 65536) return 0;
            $response .= $chunk; return strlen($chunk);
        }]);
    $ok = curl_exec($c); $code = curl_getinfo($c, CURLINFO_HTTP_CODE); curl_close($c);
    if ($ok === false || $code < 200 || $code >= 300) throw new RuntimeException('recovery transport unavailable (HTTP '.(int)$code.')', (int)$code);
    $result = json_decode($response, true, 64, JSON_THROW_ON_ERROR);
    if (!is_array($result)) throw new RuntimeException('invalid recovery response');
    return $result;
}
function recovery_result(array $r, bool $ok, string $error = '', bool $indeterminate = false): array
{
    return ['command_id'=>$r['id'], 'delivery_attempt'=>$r['attempt'], 'status'=>$ok ? 'succeeded':'failed',
        'error_message'=>$error, 'result_json'=>['service'=>$r['service'], 'restarted'=>$ok,
            'delivery_channel'=>'supervisor_v1', 'execution_recovery_status'=>$indeterminate ? 'indeterminate':'determinate']];
}
function recovery_run(string $dir, bool $blocked, array &$state, ?callable $transport = null, ?array $identity = null, ?callable $runner = null): bool
{
    $config = $identity ?? recovery_config();
    $http = $transport ?? fn($path, $body) => recovery_http($config, $path, $body);
    $execute = $runner ?? fn($service) => watchdog_exec(['/usr/bin/timeout','--foreground','60','/usr/local/bin/php',__DIR__.'/recovery_service.php',$service]);
    $scope = hash('sha256', $config['CONTROLLER_URL'] . "\n" . $config['NODE_UID'] . "\n" . $config['secret']);
    $rd = $dir . '/requests';
    if (!is_dir($rd) && !mkdir($rd, 0700)) throw new RuntimeException('recovery journal unavailable');
    watchdog_private($rd, true);
    // Flush durable results first. Restart/ACK uncertainty is never authorization to repeat.
    foreach (glob($rd.'/*.json') ?: [] as $file) {
        watchdog_private($file);
        $r = json_decode(file_get_contents($file), true, 32, JSON_THROW_ON_ERROR);
        if (($r['scope'] ?? '') !== $scope) continue; // never disclose an old identity's outbox
        if ($r['phase'] === 'intent') {
            $r['phase'] = 'result'; $r['result'] = recovery_result($r, false, 'Restart outcome indeterminate; action not replayed', true);
            watchdog_save($file, $r);
        }
        if ($r['phase'] === 'result') {
            try { $http('/api/v1/ingest/command-result', $r['result']); }
            catch (RuntimeException $e) {
                // Terminal/stale attempt rejection must not poison the independent outbox.
                if (!in_array($e->getCode(), [404,409,410], true)) throw $e;
            }
            $r['phase'] = 'done'; watchdog_save($file, $r);
        }
        if ($r['phase'] === 'done' && time() > $r['expires'] + 86400) unlink($file);
    }
    $reply = $http('/api/v1/ingest/recovery-poll', ['version'=>'0.5.30']);
    if ($blocked) return false;
    foreach (($reply['commands'] ?? []) as $cmd) {
        $id = $cmd['id'] ?? ''; $service = $cmd['payload']['service'] ?? ''; $attempt = $cmd['delivery_attempt'] ?? null;
        $expires = strtotime($cmd['expires_at'] ?? '') ?: 0;
        if (!is_string($id) || !preg_match('/^[a-f0-9-]{36}$/D', $id) || $cmd['type'] !== 'service_restart'
            || !in_array($service, RECOVERY_SERVICES, true) || !is_int($attempt) || $attempt < 0
            || !in_array($cmd['status'] ?? '', ['pending','picked_up'], true) || $expires <= time()) continue;
        $file = $rd.'/'.$id.'-'.$attempt.'.json';
        $r = ['id'=>$id, 'attempt'=>$attempt, 'service'=>$service, 'expires'=>$expires, 'scope'=>$scope, 'phase'=>'staged'];
        if (file_exists($file)) { watchdog_private($file); $r = json_decode(file_get_contents($file), true, 32, JSON_THROW_ON_ERROR); }
        if ($r['scope'] !== $scope || $r['phase'] !== 'staged') continue;
        watchdog_save($file, $r); // payload durable before pickup
        $ackBody = ['command_id'=>$id, 'delivery_attempt'=>$attempt, 'status'=>'picked_up'];
        $pickup = $http('/api/v1/ingest/command-ack', $ackBody);
        if (($pickup['terminal'] ?? false) === true) { $r['phase'] = 'done'; watchdog_save($file, $r); continue; }
        if (($pickup['status'] ?? '') !== 'picked_up') continue;
        $now = time();
        $state['attempts'] = array_values(array_filter($state['attempts'] ?? [], fn($t)=>is_int($t) && $t > $now-3600));
        if (count($state['attempts']) >= 3 || ($state['attempts'] && $now-max($state['attempts']) < 60)) return false;
        $state['attempts'][] = $now;
        watchdog_save($dir.'/state.json', $state);
        $r['phase'] = 'intent'; watchdog_save($file, $r); // durable before running CAS
        $ackBody['status'] = 'running';
        $ack = $http('/api/v1/ingest/command-ack', $ackBody);
        if (($ack['terminal'] ?? false) === true) { $r['phase'] = 'done'; watchdog_save($file, $r); return false; }
        if (($ack['execute'] ?? false) !== true) {
            $r['result'] = recovery_result($r, false, 'Execution permission ambiguous; restart not repeated', true);
        } else {
            $rc = $execute($service);
            $r['result'] = recovery_result($r, $rc === 0, $rc === 0 ? '' : 'Service restart or post-restart status failed (exit '.$rc.')', $rc === 124 || $rc === 137);
        }
        $r['phase'] = 'result'; watchdog_save($file, $r);
        $http('/api/v1/ingest/command-result', $r['result']);
        $r['phase'] = 'done'; watchdog_save($file, $r);
        openlog('systemup-agent-watchdog', LOG_PID, LOG_DAEMON);
        syslog(LOG_NOTICE, 'remote command='.$id.' service='.$service.' status='.$r['result']['status']); closelog();
        return true;
    }
    return false;
}
