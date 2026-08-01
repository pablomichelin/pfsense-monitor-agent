#!/usr/local/bin/php
<?php
/**
 * Gestao de usuarios locais pfSense via auth.inc (create/set_password/disable/delete).
 * Uso: manage_local_user.php <create|set_password|disable|delete> <payload_file.json>
 * Payload: {"pfsense_username":"...", "password":"...", "full_name":"...", "privilege_profile":"admin_full"}
 * Nunca logar senha.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only\n");
    exit(1);
}

$action = $argv[1] ?? '';
$payloadFile = $argv[2] ?? '';

if (!in_array($action, ['create', 'set_password', 'disable', 'delete'], true)) {
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

$username = '';
if (isset($payload['pfsense_username'])) {
    $username = strtolower(trim((string) $payload['pfsense_username']));
} elseif (isset($payload['username'])) {
    $username = strtolower(trim((string) $payload['username']));
}

if ($username === '' || !preg_match('/^[a-z][a-z0-9._-]{2,31}$/', $username)) {
    emit_result(false, 'invalid pfsense_username');
    exit(1);
}

// Contas de sistema do pfSense: jamais criar/alterar/desativar/excluir via agente.
if (is_reserved_local_username($username)) {
    emit_result(false, 'reserved username');
    exit(1);
}

require_once('/etc/inc/config.inc');
require_once('/etc/inc/auth.inc');

if (
    !function_exists('getUserEntry')
    || !function_exists('local_user_set')
    || !function_exists('local_user_del')
    || !function_exists('local_user_set_password')
) {
    emit_result(false, 'auth.inc helpers unavailable');
    exit(1);
}

try {
    if ($action === 'create') {
        handle_create($payload, $username);
        exit(0);
    }

    if ($action === 'set_password') {
        handle_set_password($payload, $username);
        exit(0);
    }

    $resolved = resolve_local_user_entry($username);
    if ($resolved === null) {
        emit_result(false, 'user not found');
        exit(1);
    }

    $userIndex = $resolved['index'];
    $user = $resolved['user'];
    $canonicalName = trim((string) ($user['name'] ?? $username));

    if (is_protected_system_local_user($user, $canonicalName)) {
        emit_result(false, 'cannot modify system account');
        exit(1);
    }

    if ($action === 'disable') {
        if (!empty($user['disabled'])) {
            emit_result(true, 'already disabled', [
                'username' => $canonicalName,
                'action' => 'disable',
            ]);
            exit(0);
        }

        $user['disabled'] = true;
        if (function_exists('config_set_path')) {
            config_set_path("system/user/{$userIndex}", $user);
        } else {
            $allUsers = config_get_path('system/user');
            if (!is_array($allUsers) || !isset($allUsers[$userIndex])) {
                emit_result(false, 'user index not found');
                exit(1);
            }
            $allUsers[$userIndex]['disabled'] = true;
            config_set_path('system/user', $allUsers);
        }

        local_user_set($user);
        write_config(sprintf('systemup-monitor: disable local user %s', $canonicalName));
        emit_result(true, 'disabled', [
            'username' => $canonicalName,
            'action' => 'disable',
        ]);
        exit(0);
    }

    // delete
    $usersPath = 'system/user';
    $allUsers = config_get_path($usersPath);
    if (!is_array($allUsers) || !isset($allUsers[$userIndex])) {
        emit_result(false, 'user index not found');
        exit(1);
    }

    $targetUser = $allUsers[$userIndex];
    local_user_del($targetUser);
    unset($allUsers[$userIndex]);
    $allUsers = array_values($allUsers);
    config_set_path($usersPath, $allUsers);
    write_config(sprintf('systemup-monitor: delete local user %s', $canonicalName));
    emit_result(true, 'deleted', [
        'username' => $canonicalName,
        'action' => 'delete',
    ]);
    exit(0);
} catch (Throwable $exception) {
    emit_result(false, 'operation failed');
    exit(1);
}

/**
 * @param array<string, mixed> $payload
 */
function handle_create(array $payload, string $username): void
{
    $password = isset($payload['password']) ? (string) $payload['password'] : '';
    if ($password === '') {
        emit_result(false, 'password required');
        exit(1);
    }

    if (resolve_local_user_entry($username) !== null) {
        emit_result(false, 'user already exists');
        exit(1);
    }

    $fullName = trim((string) ($payload['full_name'] ?? $username));
    $privilegeProfile = trim((string) ($payload['privilege_profile'] ?? 'admin_full'));

    // pfSense atribui uid via system_usermanager.php antes de chamar local_user_set();
    // a função em si não gera/reserva um uid novo. Sem isso o usuário fica sem
    // identidade Unix válida (falha silenciosa do lado do SO ou conflito de uid).
    $uid = allocate_next_local_uid();
    if ($uid === null) {
        emit_result(false, 'unable to allocate uid');
        exit(1);
    }

    $user = [
        'name' => $username,
        'descr' => $fullName,
        'scope' => 'user',
        'uid' => (string) $uid,
    ];

    apply_local_user_password($user, $password);

    // admin_full (controlador) → privilégio SystemUp sem User/Group Manager:
    // acesso operacional amplo, troca só a própria senha (passwordmg), sem
    // alterar senha do admin nem auto-escalar via grupos.
    if ($privilegeProfile === 'admin_full') {
        $user['priv'] = ['page-systemup-technician-admin'];
    }

    local_user_set($user);

    $existingUsers = config_get_path('system/user');
    $existingUsers = is_array($existingUsers) ? $existingUsers : [];
    $existingUsers[] = $user;
    config_set_path('system/user', $existingUsers);
    config_set_path('system/nextuid', (string) ($uid + 1));

    write_config(sprintf('systemup-monitor: create local user %s', $username));
    emit_result(true, 'created', [
        'username' => $username,
        'uid' => $uid,
        'action' => 'create',
    ]);
}

/**
 * local_user_set_password(&$user_item_config, $password) nesta versao do
 * pfSense (Plus 26.03.1) espera um wrapper no formato {'item': $user, ...}
 * (o mesmo formato retornado por getUserEntry()) e escreve o hash dentro de
 * $user_item_config['item'], nao diretamente no array passado. Chamar a
 * funcao com o array do usuario "solto" (sem o wrapper 'item') faz com que
 * o hash va parar dentro de uma chave literal 'item' aninhada, deixando o
 * usuario sem 'bcrypt-hash' no nivel esperado — local_user_set() entao
 * recusa sincronizar a conta no SO (loga erro "password is missing" e
 * retorna sem criar/atualizar o usuario Unix), e o login web tambem falha
 * por falta de hash no local certo. Validado em laboratorio real
 * (192.168.100.254) em 2026-07-31 — ver docs/155.
 *
 * @param array<string, mixed> $user
 */
function apply_local_user_password(array &$user, string $password): void
{
    $wrapper = ['item' => $user];
    local_user_set_password($wrapper, $password);
    $user = $wrapper['item'];
}

/**
 * Replica a alocacao de uid feita pela GUI (system_usermanager.php) antes de
 * local_user_set(): le system/nextuid; se ausente/invalido, deriva do maior
 * uid existente (piso 2000, convencao pfSense para contas locais).
 */
function allocate_next_local_uid(): ?int
{
    $configuredNext = config_get_path('system/nextuid');
    $nextUid = is_numeric($configuredNext) ? (int) $configuredNext : null;

    $allUsers = config_get_path('system/user');
    $allUsers = is_array($allUsers) ? $allUsers : [];

    $highestExisting = 1999;
    foreach ($allUsers as $candidate) {
        if (is_array($candidate) && isset($candidate['uid']) && is_numeric($candidate['uid'])) {
            $highestExisting = max($highestExisting, (int) $candidate['uid']);
        }
    }

    if ($nextUid === null || $nextUid <= $highestExisting) {
        $nextUid = $highestExisting + 1;
    }

    return $nextUid;
}

/**
 * @param array<string, mixed> $payload
 */
function handle_set_password(array $payload, string $username): void
{
    $password = isset($payload['password']) ? (string) $payload['password'] : '';
    if ($password === '') {
        emit_result(false, 'password required');
        exit(1);
    }

    $resolved = resolve_local_user_entry($username);
    if ($resolved === null) {
        emit_result(false, 'user not found');
        exit(1);
    }

    $userIndex = $resolved['index'];
    $user = $resolved['user'];
    $canonicalName = trim((string) ($user['name'] ?? $username));

    if (is_protected_system_local_user($user, $canonicalName)) {
        emit_result(false, 'cannot modify system account');
        exit(1);
    }

    if (!empty($user['disabled'])) {
        emit_result(false, 'user is disabled');
        exit(1);
    }

    apply_local_user_password($user, $password);

    if (function_exists('config_set_path')) {
        config_set_path("system/user/{$userIndex}", $user);
    } else {
        $allUsers = config_get_path('system/user');
        if (!is_array($allUsers) || !isset($allUsers[$userIndex])) {
            emit_result(false, 'user index not found');
            exit(1);
        }
        $allUsers[$userIndex] = $user;
        config_set_path('system/user', $allUsers);
    }

    local_user_set($user);
    write_config(sprintf('systemup-monitor: reset password for %s', $canonicalName));
    emit_result(true, 'password reset', [
        'username' => $canonicalName,
        'action' => 'set_password',
    ]);
}

/**
 * @return array{index:int,user:array<string,mixed>}|null
 */
function resolve_local_user_entry(string $username): ?array
{
    $userEntry = getUserEntry($username);
    if (is_array($userEntry) && isset($userEntry['item']) && is_array($userEntry['item'])) {
        $index = isset($userEntry['idx']) ? (int) $userEntry['idx'] : null;
        if ($index === null) {
            $index = find_user_index_by_name($username, (string) ($userEntry['item']['name'] ?? ''));
        }
        if ($index === null) {
            return null;
        }

        return [
            'index' => $index,
            'user' => $userEntry['item'],
        ];
    }

    if (is_array($userEntry) && $userEntry !== []) {
        $index = find_user_index_by_name($username, (string) ($userEntry['name'] ?? ''));
        if ($index === null) {
            return null;
        }

        return [
            'index' => $index,
            'user' => $userEntry,
        ];
    }

    return find_user_entry_case_insensitive($username);
}

/**
 * @return array{index:int,user:array<string,mixed>}|null
 */
function find_user_entry_case_insensitive(string $username): ?array
{
    $allUsers = config_get_path('system/user');
    if (!is_array($allUsers)) {
        return null;
    }

    foreach ($allUsers as $index => $candidate) {
        if (!is_array($candidate)) {
            continue;
        }
        $candidateName = strtolower(trim((string) ($candidate['name'] ?? '')));
        if ($candidateName === $username) {
            return [
                'index' => (int) $index,
                'user' => $candidate,
            ];
        }
    }

    return null;
}

function find_user_index_by_name(string $username, string $canonicalName = ''): ?int
{
    $allUsers = config_get_path('system/user');
    if (!is_array($allUsers)) {
        return null;
    }

    foreach ($allUsers as $index => $candidate) {
        if (!is_array($candidate)) {
            continue;
        }
        $candidateName = strtolower(trim((string) ($candidate['name'] ?? '')));
        if ($candidateName === $username) {
            return (int) $index;
        }
        if ($canonicalName !== '' && trim((string) ($candidate['name'] ?? '')) === $canonicalName) {
            return (int) $index;
        }
    }

    return null;
}

function is_reserved_local_username(string $username): bool
{
    return in_array(strtolower(trim($username)), ['admin', 'root'], true);
}

/**
 * Conta de sistema do pfSense: nome reservado, scope system ou uid 0.
 *
 * @param array<string, mixed> $user
 */
function is_protected_system_local_user(array $user, string $canonicalName): bool
{
    if (is_reserved_local_username($canonicalName)) {
        return true;
    }

    $scope = trim((string) ($user['scope'] ?? ''));
    $uid = isset($user['uid']) ? (int) $user['uid'] : null;

    return $scope === 'system' || $uid === 0;
}

/**
 * @param array<string, mixed> $extra
 */
function emit_result(bool $ok, string $message, array $extra = []): void
{
    $output = array_merge(
        [
            'ok' => $ok,
            'message' => $message,
        ],
        $extra,
    );
    echo json_encode($output, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
}
