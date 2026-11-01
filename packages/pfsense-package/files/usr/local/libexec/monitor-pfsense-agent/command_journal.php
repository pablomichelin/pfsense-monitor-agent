#!/usr/local/bin/php
<?php
/** Durable command journal. CLI only; no pfSense imports or network transport. */
declare(strict_types=1);

const JOURNAL_OWNER = 0;

function private_path(string $path, bool $directory = false): void
{
    clearstatcache(true, $path);
    if (is_link($path) || ($directory ? !is_dir($path) : !is_file($path))
        || fileowner($path) !== JOURNAL_OWNER
        || (fileperms($path) & 0777) !== ($directory ? 0700 : 0600)) {
        throw new RuntimeException('unsafe journal permissions');
    }
}

function sync_directory(string $path): void
{
    $stream = fopen($path, 'r');
    if ($stream === false || !fsync($stream)) {
        throw new RuntimeException('directory sync failed');
    }
    fclose($stream);
}

function durable_write(string $path, string $bytes): void
{
    $tmp = tempnam(dirname($path), '.write-');
    if ($tmp === false) throw new RuntimeException('journal allocation failed');
    try {
        chmod($tmp, 0600);
        $stream = fopen($tmp, 'wb');
        if ($stream === false || fwrite($stream, $bytes) !== strlen($bytes)
            || !fflush($stream) || !fsync($stream)) {
            throw new RuntimeException('journal sync failed');
        }
        fclose($stream);
        if (!rename($tmp, $path)) throw new RuntimeException('journal rename failed');
        sync_directory(dirname($path));
    } finally {
        if (is_file($tmp)) unlink($tmp);
    }
}

function durable_mkdir(string $path): void
{
    if (is_dir($path)) return;
    durable_mkdir(dirname($path));
    if (!mkdir($path, 0700)) throw new RuntimeException('journal mkdir failed');
    sync_directory(dirname($path));
}

function process_identity(int $pid): string
{
    if ($pid <= 1) return '';
    // Start time avoids treating a reused PID as the original wrapper after reboot.
    return trim((string) shell_exec('ps -p ' . $pid . ' -o lstart= 2>/dev/null'));
}

final class CommandJournal
{
    private string $key;
    private $lock;
    public function __construct(public string $dir, private string $scope)
    {
        if (!function_exists('fsync') || !extension_loaded('openssl')) {
            throw new RuntimeException('durable journal prerequisites unavailable');
        }
        umask(0077);
        durable_mkdir($dir);
        private_path($dir, true);
        sync_directory(dirname($dir));
        $this->lock = $this->openLock('.state.lock');
        flock($this->lock, LOCK_EX);
        $keyPath = $dir . '/.key';
        if (!file_exists($keyPath)) {
            if (glob($dir . '/*.json')) throw new RuntimeException('journal key missing');
            durable_write($keyPath, random_bytes(32));
        }
        private_path($keyPath);
        $this->key = (string) file_get_contents($keyPath);
        if (strlen($this->key) !== 32) throw new RuntimeException('invalid journal key');
    }

    public function openLock(string $name)
    {
        $path = $this->dir . '/' . $name;
        if (file_exists($path) || is_link($path)) private_path($path);
        $handle = fopen($path, 'c+b');
        if ($handle === false) throw new RuntimeException('journal lock failed');
        private_path($path);
        return $handle;
    }

    public function unlock(): void { flock($this->lock, LOCK_UN); }
    public function lock(): void { flock($this->lock, LOCK_EX); }
    public function path(string $id): string
    {
        if ($id !== '.heartbeat' && !preg_match('/^[A-Za-z0-9_-]{1,128}$/D', $id)) throw new RuntimeException('invalid command id');
        return $this->dir . '/' . $id . '.json';
    }
    public function read(string $id): ?array
    {
        $path = $this->path($id);
        if (!file_exists($path)) return null;
        private_path($path);
        $box = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        $plain = openssl_decrypt(base64_decode($box['data'], true), 'aes-256-gcm', $this->key,
            OPENSSL_RAW_DATA, base64_decode($box['iv'], true), base64_decode($box['tag'], true), $id);
        if ($plain === false) throw new RuntimeException('journal authentication failed');
        $record = json_decode($plain, true, 512, JSON_THROW_ON_ERROR);
        if (($record['scope'] ?? '') !== $this->scope) throw new RuntimeException('journal identity changed');
        return $record;
    }
    public function write(string $id, array $record): void
    {
        $iv = random_bytes(12);
        $tag = '';
        $record['scope'] = $this->scope;
        $cipher = openssl_encrypt(json_encode($record, JSON_THROW_ON_ERROR), 'aes-256-gcm',
            $this->key, OPENSSL_RAW_DATA, $iv, $tag, $id);
        if ($cipher === false) throw new RuntimeException('journal encryption failed');
        durable_write($this->path($id), json_encode(['iv' => base64_encode($iv),
            'tag' => base64_encode($tag), 'data' => base64_encode($cipher)], JSON_THROW_ON_ERROR));
    }
    public function stage(array $response): void
    {
        foreach (($response['commands'] ?? []) as $command) {
            if (is_array($command) && !array_key_exists('payload', $command)) $command['payload'] = [];
            if (!is_array($command) || !is_string($command['id'] ?? null)
                || !preg_match('/^[A-Za-z0-9_-]{1,128}$/D', $command['id'])
                || !is_string($command['type'] ?? null)
                || !preg_match('/^[a-z_]+$/D', $command['type'])
                || !is_array($command['payload'] ?? null)
                || !is_int($command['delivery_attempt'] ?? null) || $command['delivery_attempt'] < 0) continue;
            // Never accept a running or terminal heartbeat as permission to execute.
            if (!(($command['status'] ?? '') === 'pending' && ($command['delivery_state'] ?? '') === 'awaiting_pickup')
                && !(($command['status'] ?? '') === 'picked_up' && ($command['delivery_state'] ?? '') === 'ready')) continue;
            $prior = $this->read($command['id']);
            if ($prior !== null) {
                // A monotonic fence distinguishes an authorized new read/backup
                // attempt from delayed duplicates. Writes keep their tombstone.
                $priorType = $prior['type'] ?? $prior['command']['type'] ?? '';
                if ($command['delivery_attempt'] <= ($prior['attempt'] ?? 0)
                    || $command['type'] !== $priorType
                    || !in_array($priorType, ['config_backup_now', 'table_search'], true)
                    || $command['status'] !== 'pending'
                    || !(($prior['phase'] === 'done' && ($prior['remote_status'] ?? '') === 'failed')
                        || ($prior['phase'] === 'result' && ($prior['body']['status'] ?? '') === 'failed'))) continue;
            }
            foreach (['target_version', 'artifact_url', 'sha256', 'service', 'delay_seconds'] as $field) {
                $value = $command['payload'][$field] ?? '';
                if (!is_scalar($value) || preg_match('/[\x00-\x1f\x7f]/', (string) $value)) continue 2;
            }
            $this->write($command['id'], ['phase' => 'staged', 'attempt' => $command['delivery_attempt'], 'command' => $command]);
        }
    }
    public function result(string $id, array $body): void
    {
        $record = $this->read($id);
        if ($record === null || $record['phase'] === 'result') return;
        $type = $record['type'] ?? $record['command']['type'] ?? '';
        if ($record['phase'] === 'done'
            && !(($record['remote_status'] ?? '') === 'expired'
                && in_array($type, ['pfsense_upgrade', 'config_backup_now', 'local_user_create',
                    'local_user_set_password', 'local_user_disable', 'local_user_delete'], true))) return;
        if (($body['command_id'] ?? '') !== $id || !in_array($body['status'] ?? '', ['succeeded', 'failed'], true)) {
            throw new RuntimeException('invalid journal result');
        }
        if (($body['delivery_attempt'] ?? null) !== ($record['attempt'] ?? 0)) throw new RuntimeException('stale result attempt');
        // Results replace the command: passwords are no longer needed, even encrypted.
        $this->write($id, ['phase' => 'result', 'attempt' => $record['attempt'] ?? 0, 'type' => $type, 'body' => $body]);
    }
    public function ambiguous(string $id): void
    {
        $record = $this->read($id);
        $this->result($id, ['command_id' => $id, 'delivery_attempt' => $record['attempt'] ?? 0, 'status' => 'failed', 'error_message' =>
            'indeterminate: execution permission or local action interrupted; not replayed; reconcile before issuing a new command',
            'result_json' => ['execution_recovery_status' => 'indeterminate']]);
    }
}

try {
    if (PHP_SAPI !== 'cli') throw new RuntimeException('CLI only');
    [$script, $dir, $scope, $op] = array_pad($argv, 4, '');
    $j = new CommandJournal($dir, $scope);
    $id = $argv[4] ?? '';
    $expectedAttempt = getenv('MONITOR_JOURNAL_DELIVERY_ATTEMPT');
    if (!in_array($op, ['drain', 'capture', 'receipt'], true) && $expectedAttempt !== false) {
        if (!preg_match('/^(0|[1-9][0-9]*)$/D', $expectedAttempt)) exit(1);
        $current = $j->read($id);
        if ($current !== null && ($current['attempt'] ?? 0) !== (int) $expectedAttempt) exit(1);
    }
    if ($op === 'drain') {
        $j->unlock();
        $drainLock = $j->openLock('.drain.lock');
        if (!flock($drainLock, LOCK_EX | LOCK_NB)) exit(0);
        $j->lock();
        if ($id === '@inbox') {
            $inbox = $j->read('.heartbeat');
            if ($inbox !== null) {
                $j->stage($inbox['response']);
                $inbox['response']['commands'] = [];
                $j->write('.heartbeat', $inbox);
            }
        } elseif ($id !== '') {
            $j->stage(json_decode((string) file_get_contents($id), true, 512, JSON_THROW_ON_ERROR));
        }
        $ids = array_map(fn($p) => basename($p, '.json'), glob($dir . '/*.json') ?: []);
        $j->unlock();
        foreach ($ids as $commandId) {
            $j->lock();
            $record = $j->read($commandId);
            if (in_array($record['phase'], ['executing', 'delegated'], true)
                && ($record['identity'] ?? '') !== ''
                && process_identity($record['pid']) === $record['identity']) {
                $j->unlock();
                continue;
            }
            if (in_array($record['phase'], ['executing', 'delegated'], true)) {
                // Preserve the existing OS/manual/reboot finalizer. It alone
                // inspects the resulting version; this journal never reruns it.
                if (($record['command']['type'] ?? '') === 'pfsense_upgrade'
                    && isset($record['reconcile_file'])) {
                    $pending = json_decode((string) @file_get_contents($record['reconcile_file']), true);
                    if (($pending['command_id'] ?? '') === $commandId
                        && in_array($pending['status'] ?? '', ['prepared_manual_confirm', 'executing', 'rebooting'], true)) {
                        $j->unlock();
                        continue;
                    }
                }
                $j->ambiguous($commandId);
                $record = $j->read($commandId);
            }
            $j->unlock();
            if (in_array($record['phase'], ['staged', 'picked_up', 'running_intent'], true)) {
                // Plaintext crosses an anonymous pipe only, never argv/environment/disk.
                $process = proc_open([$argv[6], 'journal-execute', $commandId, $argv[5], (string) ($record['attempt'] ?? 0)],
                    [0 => ['pipe', 'r'], 1 => STDOUT, 2 => STDERR], $pipes);
                if (!is_resource($process)) throw new RuntimeException('journal worker unavailable');
                fwrite($pipes[0], json_encode(['commands' => [$record['command']]], JSON_THROW_ON_ERROR));
                fclose($pipes[0]);
                proc_close($process);
            }
            // Re-read after the worker: results may have been durably posted by it.
            $j->lock();
            $record = $j->read($commandId);
            $j->unlock();
            if ($record['phase'] === 'result') {
                $process = proc_open([$argv[6], 'journal-flush', $commandId, $argv[5], (string) ($record['attempt'] ?? 0)],
                    [0 => ['file', '/dev/null', 'r'], 1 => STDOUT, 2 => STDERR], $pipes);
                if (is_resource($process)) proc_close($process);
            }
        }
    } elseif ($op === 'capture') {
        $j->unlock();
        $response = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($response)) exit(1);
        $j->lock();
        $j->write('.heartbeat', ['phase' => 'inbox', 'response' => $response]);
    } elseif ($op === 'receipt') {
        $record = $j->read('.heartbeat');
        $response = $record['response'] ?? [];
        $response['commands'] = [];
        echo json_encode($response, JSON_THROW_ON_ERROR);
    } elseif ($op === 'payload') {
        $record = $j->read($id);
        if (!in_array($record['phase'] ?? '', ['executing', 'delegated'], true)) exit(1);
        echo json_encode($record['command']['payload'], JSON_THROW_ON_ERROR);
    } elseif ($op === 'phase') {
        echo $j->read($id)['phase'] ?? '';
    } elseif ($op === 'intent') {
        $record = $j->read($id);
        if (!in_array($record['phase'] ?? '', ['staged', 'picked_up', 'running_intent'], true)) exit(1);
        $record['phase'] = 'running_intent';
        $j->write($id, $record);
    } elseif ($op === 'ack') {
        $record = $j->read($id);
        $ack = json_decode((string) file_get_contents($argv[6]), true);
        if (!is_array($ack) || ($ack['ok'] ?? false) !== true || ($ack['command_id'] ?? '') !== $id
            || ($ack['delivery_attempt'] ?? null) !== ($record['attempt'] ?? 0)
            || !is_bool($ack['execute'] ?? null) || !is_bool($ack['terminal'] ?? null)) exit(1);
        if ($ack['terminal'] === true && in_array($ack['status'] ?? '', ['succeeded', 'failed', 'expired', 'cancelled', 'canceled'], true)) {
            if (($record['phase'] ?? '') === 'running_intent') {
                // Even maxRetries=0/expiry must receive an explicit recovery
                // marker. Reporting it never grants permission to run locally;
                // the existing API terminal/late-result rules remain authority.
                $j->ambiguous($id);
                exit(1);
            }
            $j->write($id, ['phase' => 'done', 'remote_status' => $ack['status'],
                'attempt' => $record['attempt'] ?? 0, 'type' => $record['type'] ?? $record['command']['type'] ?? '']);
            exit(1);
        }
        if ($argv[5] === 'picked_up') {
            if (($ack['status'] ?? '') === 'running' && $ack['execute'] === false
                && ($ack['recovery_required'] ?? false) === true) {
                $j->ambiguous($id);
                exit(1);
            }
            if (($ack['status'] ?? '') !== 'picked_up' || $ack['execute'] !== false || $ack['terminal']) exit(1);
            $record['phase'] = 'picked_up';
        } else {
            if (($record['phase'] ?? '') !== 'running_intent' || ($ack['status'] ?? '') !== 'running' || $ack['terminal']) exit(1);
            if ($ack['execute'] !== true || ($ack['recovery_required'] ?? null) !== false) {
                $j->ambiguous($id);
                exit(1);
            }
            $record['phase'] = 'executing';
            $record['pid'] = (int) getenv('MONITOR_JOURNAL_EXECUTOR_PID');
            $record['identity'] = process_identity($record['pid']);
        }
        $j->write($id, $record);
    } elseif ($op === 'delegate') {
        $record = $j->read($id);
        if (($record['phase'] ?? '') !== 'executing') exit(1);
        $record['phase'] = 'delegated';
        $record['pid'] = (int) $argv[5];
        $record['identity'] = process_identity($record['pid']);
        if (($record['command']['type'] ?? '') === 'pfsense_upgrade' && isset($argv[6])) {
            $record['reconcile_file'] = $argv[6];
        }
        $j->write($id, $record);
    } elseif ($op === 'result') {
        $j->result($id, json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR));
    } elseif ($op === 'outbox') {
        $record = $j->read($id);
        if (($record['phase'] ?? '') !== 'result') exit(1);
        echo json_encode($record['body'], JSON_THROW_ON_ERROR);
    } elseif ($op === 'delivered') {
        $record = $j->read($id);
        $ack = json_decode((string) file_get_contents($argv[5]), true);
        if (($record['phase'] ?? '') !== 'result' || ($ack['ok'] ?? false) !== true
            || ($ack['command_id'] ?? '') !== $id
            || ($ack['delivery_attempt'] ?? null) !== ($record['attempt'] ?? 0)
            || !in_array($ack['status'] ?? '', ['succeeded', 'failed', 'expired', 'cancelled', 'canceled'], true)) exit(1);
        $j->write($id, ['phase' => 'done', 'attempt' => $record['attempt'] ?? 0,
            'remote_status' => $ack['status'], 'type' => $record['type'] ?? '']);
    } else {
        throw new RuntimeException('unknown journal operation');
    }
} catch (Throwable $error) {
    // Never print exception data: malformed input can contain credentials.
    fwrite(STDERR, "command journal: operation failed safely\n");
    exit(1);
}
