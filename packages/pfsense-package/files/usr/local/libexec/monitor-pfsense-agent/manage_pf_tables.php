#!/usr/local/bin/php
<?php
/**
 * Consulta e remocao de entradas em tabelas pf (Diagnostics > Tables).
 * Uso: manage_pf_tables.php <search|entry_remove> <payload_file.json>
 * Payload search:      {"ip":"203.0.113.7"}
 * Payload entry_remove: {"table":"sshd", "ip":"203.0.113.7"}
 *
 * Seguranca: ip e table sao validados com regex estrita antes de qualquer
 * exec_pfctl(). A remocao e em memoria do pf (pfctl -t X -T delete) e nao
 * altera config.xml nem aliases persistentes.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only\n");
    exit(1);
}

$action = $argv[1] ?? '';
$payloadFile = $argv[2] ?? '';

if (!in_array($action, ['search', 'entry_remove'], true)) {
    fwrite(STDERR, "invalid action\n");
    exit(1);
}

if ($payloadFile === '' || !is_readable($payloadFile)) {
    fwrite(STDERR, "payload file missing\n");
    exit(1);
}

$rawPayload = file_get_contents($payloadFile);
$payload = json_decode($rawPayload !== false ? $rawPayload : '', true);
if (!is_array($payload)) {
    fwrite(STDERR, "invalid payload json\n");
    exit(1);
}

function emit_result(bool $ok, string $message, array $data = []): void
{
    echo json_encode(['ok' => $ok, 'message' => $message] + $data,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), "\n";
}

function parse_ip($raw): string
{
    $ip = strtolower(trim((string) $raw));
    $ip = preg_replace('/^\[(.+)\]$/', '$1', $ip) ?? '';
    return $ip;
}

function is_valid_ip(string $ip): bool
{
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false) {
        return true;
    }
    // IPv6 sem zona; pfctl trabalha com o endereco puro.
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false) {
        return true;
    }
    return false;
}

function is_valid_table(string $table): bool
{
    return (bool) preg_match('/^[A-Za-z0-9_.-]{1,64}$/', $table);
}

/**
 * Executa pfctl com array de argumentos (sem shell intermediario).
 * Retorna [exit_code, stdout, stderr].
 */
function run_pfctl(array $args): array
{
    $descriptorspec = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $cmd = array_merge(['/sbin/pfctl'], $args);
    $proc = proc_open($cmd, $descriptorspec, $pipes);
    if (!is_resource($proc)) {
        return [1, '', 'proc_open failed'];
    }
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]) ?? '';
    fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]) ?? '';
    fclose($pipes[2]);
    $exit = proc_close($proc);
    return [$exit, $stdout, $stderr];
}

/** Lista todas as tabelas atualmente carregadas no pf. */
function list_tables(): array
{
    [$exit, $stdout] = run_pfctl(['-sT']);
    if ($exit !== 0) {
        return [];
    }
    $tables = [];
    foreach (preg_split('/\r\n|\n/', trim($stdout)) as $line) {
        $line = trim($line);
        if ($line !== '') {
            $tables[] = $line;
        }
    }
    return $tables;
}

try {
    $ip = parse_ip($payload['ip'] ?? '');
    if ($ip === '' || !is_valid_ip($ip)) {
        emit_result(false, 'invalid ip');
        exit(1);
    }

    if ($action === 'entry_remove') {
        $table = trim((string) ($payload['table'] ?? ''));
        if ($table === '' || !is_valid_table($table)) {
            emit_result(false, 'invalid table');
            exit(1);
        }

        // Confirmar que a tabela existe antes de tentar remover.
        if (!in_array($table, list_tables(), true)) {
            emit_result(false, "table {$table} not found");
            exit(1);
        }

        // Confirmar que o IP realmente esta na tabela (idempotente).
        [$testExit, $testOut] = run_pfctl(['-t', $table, '-T', 'test', $ip]);
        if ($testExit !== 0 || trim($testOut) === '' || strpos($testOut, '0/1') !== false) {
            emit_result(false, "ip {$ip} not present in table {$table}");
            exit(1);
        }

        [$rmExit, $rmOut, $rmErr] = run_pfctl(['-t', $table, '-T', 'delete', $ip]);
        if ($rmExit !== 0) {
            emit_result(false, 'pfctl delete failed: ' . trim($rmErr));
            exit(1);
        }

        emit_result(true, "removed {$ip} from table {$table}", [
            'table' => $table,
            'ip' => $ip,
        ]);
        exit(0);
    }

    // search: percorre todas as tabelas procurando o IP.
    $matches = [];
    foreach (list_tables() as $table) {
        [$exit, $out] = run_pfctl(['-t', $table, '-T', 'test', $ip]);
        if ($exit === 0 && trim($out) !== '' && strpos($out, '0/1') === false) {
            $matches[] = $table;
        }
    }

    emit_result(true, count($matches) . ' table(s) contain ' . $ip, [
        'ip' => $ip,
        'tables' => array_values($matches),
    ]);
    exit(0);
} catch (Throwable $e) {
    emit_result(false, 'operation failed');
    exit(1);
}