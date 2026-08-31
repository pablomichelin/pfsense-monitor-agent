#!/usr/local/bin/php
<?php
/**
 * Gestao de usuarios locais pfSense via auth.inc (create/set_password/disable/delete).
 * Uso: manage_local_user.php <create|set_password|disable|delete|adopt_orphans> [payload_file.json]
 * Payload: {"pfsense_username":"...", "password":"...", "full_name":"...", "privilege_profile":"admin_full"}
 * Nunca logar senha.
 *
 * Ordem segura (igual a GUI): gravar config.xml primeiro, depois sincronizar o SO.
 * Nunca reescrever system/user sem validar que a lista ainda contem admin.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only\n");
    exit(1);
}

$action = $argv[1] ?? '';
$payloadFile = $argv[2] ?? '';

if (!in_array($action, ['create', 'set_password', 'disable', 'delete', 'adopt_orphans'], true)) {
    fwrite(STDERR, "invalid action\n");
    exit(1);
}

require_once('/etc/inc/config.inc');
require_once('/etc/inc/auth.inc');

if ($action === 'adopt_orphans') {
    try {
        handle_adopt_orphans();
        exit(0);
    } catch (Throwable $exception) {
        emit_result(false, 'operation failed');
        exit(1);
    }
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
        write_user_by_name($canonicalName, $user);
        write_config(sprintf('systemup-monitor: disable local user %s', $canonicalName));
        local_user_set($user);
        emit_result(true, 'disabled', [
            'username' => $canonicalName,
            'action' => 'disable',
        ]);
        exit(0);
    }

    // delete: config primeiro (GUI), depois Unix — evita orfao "reserved by the system"
    $kept = [];
    foreach (get_normalized_local_users() as $candidate) {
        $candidateName = strtolower(trim((string) ($candidate['name'] ?? '')));
        if ($candidateName === strtolower($canonicalName)) {
            continue;
        }
        $kept[] = $candidate;
    }

    if (!user_list_has_admin($kept)) {
        emit_result(false, 'refusing to delete last admin');
        exit(1);
    }

    // Unix primeiro: se o del falhar, o usuario permanece no config (GUI).
    // Config-primeiro + del falho deixaria orfao "reserved by the system".
    local_user_del($user);
    config_set_path('system/user', $kept);
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
        handle_set_password($payload, $username);
        return;
    }

    $users = get_normalized_local_users();
    if (!user_list_has_admin($users)) {
        emit_result(false, 'refusing to rewrite users without admin');
        exit(1);
    }

    $fullName = trim((string) ($payload['full_name'] ?? $username));
    $privilegeProfile = trim((string) ($payload['privilege_profile'] ?? 'admin_full'));

    $posixUid = posix_uid_for_username($username);
    if ($posixUid === 0) {
        emit_result(false, 'cannot modify system account');
        exit(1);
    }
    if ($posixUid !== null && !posix_user_looks_like_local_account($username)) {
        emit_result(false, 'username reserved by the system');
        exit(1);
    }

    $uid = $posixUid;
    if ($uid === null) {
        $uid = allocate_next_local_uid($users);
        if ($uid === null) {
            emit_result(false, 'unable to allocate uid');
            exit(1);
        }
    }

    $user = [
        'name' => $username,
        'descr' => $fullName,
        'scope' => 'user',
        'uid' => (string) $uid,
    ];

    apply_local_user_password($user, $password);
    assert_password_hash_valid($user, $password);

    // admin_full (controlador) → privilégio SystemUp com User Manager:
    // criar/editar/excluir usuários (OpenVPN); admin/root bloqueados na GUI;
    // Group Manager continua fora (sem auto-escalar via grupo admins).
    if ($privilegeProfile === 'admin_full') {
        $user['priv'] = ['page-systemup-technician-admin'];
    }

    $users[] = $user;
    if (!user_list_has_admin($users)) {
        emit_result(false, 'refusing to rewrite users without admin');
        exit(1);
    }

    config_set_path('system/user', $users);
    if ($posixUid === null) {
        config_set_path('system/nextuid', (string) ($uid + 1));
    }

    $adopted = $posixUid !== null;
    write_config(sprintf(
        'systemup-monitor: %s local user %s',
        $adopted ? 'adopt' : 'create',
        $username,
    ));
    local_user_set($user);
    emit_result(true, $adopted ? 'adopted' : 'created', [
        'username' => $username,
        'uid' => $uid,
        'action' => $adopted ? 'adopt' : 'create',
    ]);
}

/**
 * Recoloca no config.xml contas Unix locais (uid >= 2000) que sumiram da GUI.
 * Nao altera senha Unix nem chama local_user_set (sem hash o SO ja existe).
 * Depois o admin redefine senha/privilegios na GUI se precisar.
 */
function handle_adopt_orphans(): void
{
    $users = read_local_users_for_repair();
    $adminRestored = false;
    if (!user_list_has_admin($users)) {
        $users = restore_missing_admin_account($users);
        $adminRestored = user_list_has_admin($users);
    }

    if (!user_list_has_admin($users)) {
        emit_result(false, 'refusing to rewrite users without admin');
        exit(1);
    }

    $known = [];
    foreach ($users as $candidate) {
        $known[strtolower(trim((string) ($candidate['name'] ?? '')))] = true;
    }

    $adopted = [];
    foreach (list_orphan_local_unix_users($known) as $orphan) {
        $users[] = [
            'name' => $orphan['name'],
            'descr' => $orphan['descr'],
            'scope' => 'user',
            'uid' => (string) $orphan['uid'],
        ];
        $adopted[] = [
            'name' => $orphan['name'],
            'uid' => $orphan['uid'],
        ];
    }

    if ($adopted === [] && !$adminRestored) {
        emit_result(true, 'no orphans', [
            'adopted' => [],
            'admin_restored' => false,
            'action' => 'adopt_orphans',
        ]);
        return;
    }

    if (!user_list_has_admin($users)) {
        emit_result(false, 'refusing to rewrite users without admin');
        exit(1);
    }

    config_set_path('system/user', $users);
    write_config(sprintf(
        'systemup-monitor: adopt %d orphaned local user(s)%s',
        count($adopted),
        $adminRestored ? ' and restore admin' : '',
    ));
    emit_result(true, 'orphans adopted', [
        'adopted' => $adopted,
        'admin_restored' => $adminRestored,
        'action' => 'adopt_orphans',
    ]);
}

/**
 * @param array<string, true> $knownNames
 * @return array<int, array{name:string,uid:int,descr:string}>
 */
function list_orphan_local_unix_users(array $knownNames): array
{
    $passwdPath = '/etc/passwd';
    if (!is_readable($passwdPath)) {
        return [];
    }

    $lines = file($passwdPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines)) {
        return [];
    }

    $orphans = [];
    foreach ($lines as $line) {
        $parts = explode(':', $line);
        if (count($parts) < 7) {
            continue;
        }

        $name = strtolower(trim((string) $parts[0]));
        $uid = (int) $parts[2];
        $gecos = trim((string) $parts[4]);
        $home = trim((string) $parts[5]);

        if ($uid < 2000 || $uid === 0) {
            continue;
        }
        if (!preg_match('/^[a-z][a-z0-9._-]{2,31}$/', $name)) {
            continue;
        }
        if (is_reserved_local_username($name) || is_denied_service_username($name)) {
            continue;
        }
        if (!unix_home_looks_like_local_user($name, $home)) {
            continue;
        }
        if (isset($knownNames[$name])) {
            continue;
        }

        $orphans[] = [
            'name' => $name,
            'uid' => $uid,
            'descr' => $gecos !== '' ? $gecos : $name,
        ];
    }

    return $orphans;
}

function is_denied_service_username(string $username): bool
{
    if (isset($username[0]) && $username[0] === '_') {
        return true;
    }

    static $denied = [
        'nobody', 'daemon', 'operator', 'toor', 'sshd', 'unbound', 'dhcpd',
        'ntpd', 'www', 'squid', 'snort', 'suricata', 'haproxy', 'mysql',
        'postgres', 'zabbix', 'bind', 'named', 'proxy', 'stunnel',
        'redis', 'telegraf', 'netdata', 'grafana', 'influxdb', 'mosquitto',
        'avahi', 'nut', 'minio', 'git', 'elasticsearch', 'mongodb', 'nginx',
        'apache', 'ftp', 'postfix', 'dovecot', 'clamav', 'memcached',
        'prometheus', 'node_exporter', 'hass',
    ];

    return in_array($username, $denied, true);
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
 * Preserva campos originais (name/uid/priv/grupos): a funcao nativa pode
 * devolver um item parcial; gravar isso no config.xml some com o usuario
 * da GUI e deixa o Unix orfao ("reserved by the system").
 *
 * @param array<string, mixed> $user
 */
function apply_local_user_password(array &$user, string $password): void
{
    $preserved = $user;

    // 1) pfSense 2.8+ / Plus: local_user_set_password espera wrapper {'item': $user}.
    $wrapper = ['item' => $user];
    local_user_set_password($wrapper, $password);
    $preserved = copy_password_hashes_from($wrapper['item'] ?? null, $preserved);
    $preserved = copy_password_hashes_from($wrapper, $preserved);
    if (password_hashes_usable($preserved, $password)) {
        $user = $preserved;
        return;
    }

    // 2) pfSense CE 2.7.x: a função opera no array do usuário, sem wrapper.
    $direct = $user;
    local_user_set_password($direct, $password);
    $preserved = copy_password_hashes_from($direct, $preserved);
    $preserved = copy_password_hashes_from($direct['item'] ?? null, $preserved);
    if (password_hashes_usable($preserved, $password)) {
        $user = $preserved;
        return;
    }

    // 3) Fallback: bcrypt local (mesmo algoritmo da GUI moderna).
    $generated = password_hash($password, PASSWORD_BCRYPT);
    if (is_string($generated) && $generated !== '') {
        $preserved['bcrypt-hash'] = $generated;
    }

    $user = $preserved;
}

/**
 * @param mixed $from
 * @param array<string, mixed> $into
 * @return array<string, mixed>
 */
function copy_password_hashes_from($from, array $into): array
{
    if (!is_array($from)) {
        return $into;
    }

    foreach (['bcrypt-hash', 'sha512-hash', 'md5-hash', 'password'] as $key) {
        if (isset($from[$key]) && (string) $from[$key] !== '') {
            $into[$key] = $from[$key];
        }
    }

    return $into;
}

/**
 * @param array<string, mixed> $user
 */
function password_hashes_usable(array $user, string $password): bool
{
    $bcryptHash = isset($user['bcrypt-hash']) ? (string) $user['bcrypt-hash'] : '';
    $sha512Hash = isset($user['sha512-hash']) ? (string) $user['sha512-hash'] : '';

    if ($bcryptHash === '' && $sha512Hash === '') {
        return false;
    }

    if ($bcryptHash !== '' && !password_verify($password, $bcryptHash)) {
        return false;
    }

    return true;
}

/**
 * Falha cedo se o hash nao ficou no nivel correto do usuario (bug historico
 * do wrapper em local_user_set_password — ver docs/155).
 *
 * @param array<string, mixed> $user
 */
function assert_password_hash_valid(array $user, string $password): void
{
    if (isset($user['item']) && is_array($user['item'])) {
        emit_result(false, 'invalid user structure (nested item key)');
        exit(1);
    }

    $bcryptHash = isset($user['bcrypt-hash']) ? (string) $user['bcrypt-hash'] : '';
    $sha512Hash = isset($user['sha512-hash']) ? (string) $user['sha512-hash'] : '';

    if ($bcryptHash === '' && $sha512Hash === '') {
        emit_result(false, 'password hash missing after apply');
        exit(1);
    }

    if ($bcryptHash !== '' && !password_verify($password, $bcryptHash)) {
        emit_result(false, 'password hash verification failed');
        exit(1);
    }
}

/**
 * Replica a alocacao de uid feita pela GUI (system_usermanager.php) antes de
 * local_user_set(): le system/nextuid; se ausente/invalido, deriva do maior
 * uid existente (piso 2000, convencao pfSense para contas locais).
 *
 * @param array<int, array<string, mixed>>|null $users
 */
function allocate_next_local_uid(?array $users = null): ?int
{
    $configuredNext = config_get_path('system/nextuid');
    $nextUid = is_numeric($configuredNext) ? (int) $configuredNext : null;

    $allUsers = $users ?? get_normalized_local_users();

    $highestExisting = max(1999, highest_posix_local_uid());
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
    assert_password_hash_valid($user, $password);

    write_user_by_name($canonicalName, $user);
    write_config(sprintf('systemup-monitor: reset password for %s', $canonicalName));
    local_user_set($user);
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
        if ($index !== null) {
            return [
                'index' => $index,
                'user' => $userEntry['item'],
            ];
        }
    } elseif (is_array($userEntry) && $userEntry !== []) {
        $index = find_user_index_by_name($username, (string) ($userEntry['name'] ?? ''));
        if ($index !== null) {
            return [
                'index' => $index,
                'user' => $userEntry,
            ];
        }
    }

    return find_user_entry_case_insensitive($username);
}

/**
 * @return array{index:int,user:array<string,mixed>}|null
 */
function find_user_entry_case_insensitive(string $username): ?array
{
    $users = read_normalized_local_users();
    if ($users === null) {
        return null;
    }

    foreach ($users as $index => $candidate) {
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
    $users = read_normalized_local_users();
    if ($users === null) {
        return null;
    }

    foreach ($users as $index => $candidate) {
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

/**
 * Lista canonica de usuarios locais. Recusa reescrita se a leitura falhar
 * ou se admin/uid 0 desaparecer — evita apagar contas da GUI e deixar
 * orfaos Unix ("The username is reserved by the system").
 *
 * @return array<int, array<string, mixed>>
 */
/**
 * @return array<int, array<string, mixed>>|null
 */
function read_normalized_local_users(): ?array
{
    if (function_exists('init_config_arr')) {
        init_config_arr(['system', 'user']);
    }

    $users = config_get_path('system/user');
    if (!is_array($users) || $users === []) {
        return null;
    }

    if (isset($users['name']) && is_string($users['name'])) {
        $users = [$users];
    }

    $normalized = [];
    foreach ($users as $candidate) {
        if (!is_array($candidate)) {
            continue;
        }
        $name = trim((string) ($candidate['name'] ?? ''));
        if ($name === '') {
            continue;
        }
        $normalized[] = $candidate;
    }

    if ($normalized === [] || !user_list_has_admin($normalized)) {
        return null;
    }

    return $normalized;
}

/**
 * Leitura permissiva para reparo: nao exige admin (pode ter sido apagado
 * do config.xml pelo create quebrado). Nao usar em create/delete/set_password.
 *
 * @return array<int, array<string, mixed>>
 */
function read_local_users_for_repair(): array
{
    if (function_exists('init_config_arr')) {
        init_config_arr(['system', 'user']);
    }

    $users = config_get_path('system/user');
    if (!is_array($users) || $users === []) {
        $users = [];
    }

    if (isset($users['name']) && is_string($users['name'])) {
        $users = [$users];
    }

    $normalized = [];
    foreach ($users as $candidate) {
        if (!is_array($candidate)) {
            continue;
        }
        $name = trim((string) ($candidate['name'] ?? ''));
        if ($name === '') {
            continue;
        }
        $normalized[] = $candidate;
    }

    return $normalized;
}

/**
 * Recoloca o admin (uid 0) no config se o Unix ainda tiver a conta e a GUI nao.
 * Nao altera senha Unix. Login web pode exigir redefinir senha na consola.
 *
 * @param array<int, array<string, mixed>> $users
 * @return array<int, array<string, mixed>>
 */
function restore_missing_admin_account(array $users): array
{
    if (user_list_has_admin($users)) {
        return $users;
    }

    if (!function_exists('posix_getpwnam')) {
        return $users;
    }

    $pw = @posix_getpwnam('admin');
    if (!is_array($pw) || !isset($pw['uid']) || (int) $pw['uid'] !== 0) {
        return $users;
    }

    $gecos = trim((string) ($pw['gecos'] ?? ''));
    $users[] = [
        'name' => 'admin',
        'descr' => $gecos !== '' ? $gecos : 'System Administrator',
        'scope' => 'system',
        'uid' => '0',
        'priv' => ['page-all'],
    ];

    return $users;
}

function unix_home_looks_like_local_user(string $name, string $home): bool
{
    $home = rtrim($home, '/');
    return $home === '/home/' . $name || $home === '/home';
}

function posix_user_looks_like_local_account(string $username): bool
{
    if (is_denied_service_username($username) || is_reserved_local_username($username)) {
        return false;
    }

    if (!function_exists('posix_getpwnam')) {
        return true;
    }

    $pw = @posix_getpwnam($username);
    if (!is_array($pw)) {
        return false;
    }

    $home = trim((string) ($pw['dir'] ?? ''));
    return unix_home_looks_like_local_user($username, $home);
}

function highest_posix_local_uid(): int
{
    $highest = 1999;
    $passwdPath = '/etc/passwd';
    if (!is_readable($passwdPath)) {
        return $highest;
    }

    $lines = file($passwdPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines)) {
        return $highest;
    }

    foreach ($lines as $line) {
        $parts = explode(':', $line);
        if (count($parts) < 3) {
            continue;
        }
        $uid = (int) $parts[2];
        if ($uid >= 2000) {
            $highest = max($highest, $uid);
        }
    }

    return $highest;
}

/**
 * @return array<int, array<string, mixed>>
 */
function get_normalized_local_users(): array
{
    $users = read_normalized_local_users();
    if ($users === null) {
        emit_result(false, 'refusing to rewrite users without admin');
        exit(1);
    }

    return $users;
}

/**
 * @param array<int, array<string, mixed>> $users
 */
function user_list_has_admin(array $users): bool
{
    foreach ($users as $candidate) {
        if (!is_array($candidate)) {
            continue;
        }
        $name = strtolower(trim((string) ($candidate['name'] ?? '')));
        $uid = isset($candidate['uid']) && is_numeric($candidate['uid'])
            ? (int) $candidate['uid']
            : null;
        if ($name === 'admin' || $uid === 0) {
            return true;
        }
    }

    return false;
}

/**
 * @param array<string, mixed> $user
 */
function write_user_by_name(string $username, array $user): void
{
    $users = get_normalized_local_users();
    $found = false;
    $needle = strtolower(trim($username));

    foreach ($users as $index => $candidate) {
        $candidateName = strtolower(trim((string) ($candidate['name'] ?? '')));
        if ($candidateName === $needle) {
            $users[$index] = $user;
            $found = true;
            break;
        }
    }

    if (!$found) {
        emit_result(false, 'user index not found');
        exit(1);
    }

    if (!user_list_has_admin($users)) {
        emit_result(false, 'refusing to rewrite users without admin');
        exit(1);
    }

    config_set_path('system/user', array_values($users));
}

function posix_uid_for_username(string $username): ?int
{
    if (!function_exists('posix_getpwnam')) {
        return null;
    }

    $pw = @posix_getpwnam($username);
    if (!is_array($pw) || !isset($pw['uid']) || !is_numeric($pw['uid'])) {
        return null;
    }

    return (int) $pw['uid'];
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
