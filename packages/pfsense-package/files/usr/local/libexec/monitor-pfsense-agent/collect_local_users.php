#!/usr/local/bin/php
<?php
/**
 * Inventario read-only de usuarios locais pfSense para guardrail no controlador.
 * Saida: JSON array em stdout — name, uid, disabled, is_admin (page-all efetivo).
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only\n");
    exit(1);
}

$configPath = getenv('PFSENSE_CONFIG_XML') ?: '/conf/config.xml';

if (!is_file($configPath) || !is_readable($configPath)) {
    fwrite(STDERR, "[collect_local_users] config.xml nao legivel: {$configPath}\n");
    exit(1);
}

$config = @simplexml_load_file($configPath);
if ($config === false) {
    fwrite(STDERR, "[collect_local_users] falha ao parsear config.xml\n");
    exit(1);
}

/** @var array<int, true> $adminMemberUids */
$adminMemberUids = [];

if (isset($config->system->group)) {
    foreach ($config->system->group as $group) {
        $hasPageAll = false;
        if (isset($group->priv)) {
            foreach ($group->priv as $priv) {
                if (trim((string) $priv) === 'page-all') {
                    $hasPageAll = true;
                    break;
                }
            }
        }
        if (!$hasPageAll) {
            continue;
        }
        if (isset($group->member)) {
            foreach ($group->member as $member) {
                $uid = (int) trim((string) $member);
                if ($uid >= 0) {
                    $adminMemberUids[$uid] = true;
                }
            }
        }
    }
}

$users = [];
if (!isset($config->system->user)) {
    echo "[]\n";
    exit(0);
}

foreach ($config->system->user as $userNode) {
    $name = trim((string) ($userNode->name ?? ''));
    if ($name === '') {
        continue;
    }

    $uidRaw = trim((string) ($userNode->uid ?? ''));
    $uid = $uidRaw !== '' && ctype_digit($uidRaw) ? (int) $uidRaw : null;
    $scope = trim((string) ($userNode->scope ?? ''));
    $disabled = isset($userNode->disabled);

    $isAdmin = false;
    if ($scope === 'system' && $uid === 0) {
        $isAdmin = true;
    }
    if ($uid !== null && isset($adminMemberUids[$uid])) {
        $isAdmin = true;
    }
    if (isset($userNode->priv)) {
        foreach ($userNode->priv as $priv) {
            if (trim((string) $priv) === 'page-all') {
                $isAdmin = true;
                break;
            }
        }
    }

    $entry = [
        'name' => $name,
        'disabled' => $disabled,
        'is_admin' => $isAdmin,
    ];
    if ($uid !== null) {
        $entry['uid'] = $uid;
    }

    $users[] = $entry;
}

echo json_encode($users, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
exit(0);
