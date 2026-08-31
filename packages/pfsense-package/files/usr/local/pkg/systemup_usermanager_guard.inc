<?php
/**
 * Impede tecnico SystemUp de criar/editar/excluir as contas admin e root
 * no User Manager da GUI. Admin (page-all / uid 0 / grupo admins) nao e afetado.
 *
 * Nao chama get_user_privileges() — este ficheiro e incluido a partir de
 * priv/systemup_technician.inc, que o pfSense carrega ao resolver privilegios.
 */

function systemup_usermanager_guard_unwrap_user($entry)
{
    if (!is_array($entry)) {
        return null;
    }
    if (isset($entry['item']) && is_array($entry['item'])) {
        return $entry['item'];
    }

    return $entry;
}

function systemup_usermanager_guard_is_reserved_name($name)
{
    return in_array(strtolower(trim((string) $name)), ['admin', 'root'], true);
}

function systemup_usermanager_guard_user_is_reserved($user)
{
    $user = systemup_usermanager_guard_unwrap_user($user);
    if (!is_array($user)) {
        return false;
    }
    if (systemup_usermanager_guard_is_reserved_name($user['name'] ?? '')) {
        return true;
    }
    if ((string) ($user['uid'] ?? '') === '0') {
        return true;
    }
    if (strcasecmp(trim((string) ($user['scope'] ?? '')), 'system') === 0) {
        return true;
    }

    return false;
}

function systemup_usermanager_guard_user_by_id($userid)
{
    if ($userid === null || $userid === '') {
        return null;
    }
    if (!function_exists('config_get_path')) {
        return null;
    }
    $users = config_get_path('system/user', []);
    if (!is_array($users) || !isset($users[$userid])) {
        return null;
    }

    return systemup_usermanager_guard_unwrap_user($users[$userid]);
}

function systemup_usermanager_guard_session_is_technician()
{
    $username = (string) ($_SESSION['Username'] ?? '');
    if ($username === '' || systemup_usermanager_guard_is_reserved_name($username)) {
        return false;
    }
    if (!function_exists('getUserEntry')) {
        return false;
    }

    $user = systemup_usermanager_guard_unwrap_user(getUserEntry($username));
    if (!is_array($user)) {
        return false;
    }
    if ((string) ($user['uid'] ?? '') === '0') {
        return false;
    }

    $privs = $user['priv'] ?? [];
    if (!is_array($privs)) {
        $privs = $privs === '' || $privs === null ? [] : [$privs];
    }
    if (in_array('page-all', $privs, true)) {
        return false;
    }

    if (function_exists('getUserGroups')) {
        $authcfg = function_exists('auth_get_authserver') && function_exists('config_get_path')
            ? auth_get_authserver(config_get_path('system/webgui/authmode'))
            : null;
        $groups = getUserGroups($user['name'] ?? $username, $authcfg, $_SESSION['user_radius_attributes'] ?? null);
        if (is_array($groups) && in_array('admins', $groups, true)) {
            return false;
        }
    }

    return in_array('page-systemup-technician-admin', $privs, true);
}

function systemup_usermanager_guard_deny()
{
    if (function_exists('log_error')) {
        $who = (string) ($_SESSION['Username'] ?? '?');
        log_error('SystemUp Monitor: tecnico ' . $who . ' bloqueado ao tentar alterar admin/root no User Manager.');
    }

    header('Location: /systemup_usermanager_denied.php');
    exit;
}

function systemup_usermanager_guard_target_is_reserved()
{
    $userid = $_REQUEST['userid'] ?? $_POST['userid'] ?? null;
    $user = systemup_usermanager_guard_user_by_id($userid);
    if (systemup_usermanager_guard_user_is_reserved($user)) {
        return true;
    }

    foreach (['username', 'oldusername'] as $field) {
        if (isset($_POST[$field]) && systemup_usermanager_guard_is_reserved_name($_POST[$field])) {
            return true;
        }
    }

    return false;
}

function systemup_usermanager_guard_enforce()
{
    static $ran = false;
    if ($ran || PHP_SAPI === 'cli') {
        return;
    }
    $ran = true;

    $script = basename((string) ($_SERVER['SCRIPT_NAME'] ?? $_SERVER['PHP_SELF'] ?? ''));
    $watched = [
        'system_usermanager.php',
        'system_usermanager_addprivs.php',
    ];
    if (!in_array($script, $watched, true)) {
        return;
    }
    if (!systemup_usermanager_guard_session_is_technician()) {
        return;
    }

    $act = strtolower(trim((string) ($_REQUEST['act'] ?? '')));
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $mutatingActs = ['edit', 'deluser', 'delcert', 'expcert', 'new'];

    if ($script === 'system_usermanager_addprivs.php' && systemup_usermanager_guard_target_is_reserved()) {
        systemup_usermanager_guard_deny();
    }

    if ($script !== 'system_usermanager.php') {
        return;
    }

    if (in_array($act, $mutatingActs, true) && systemup_usermanager_guard_target_is_reserved()) {
        systemup_usermanager_guard_deny();
    }

    if ($method === 'POST' && systemup_usermanager_guard_target_is_reserved()) {
        systemup_usermanager_guard_deny();
    }

    if ($method === 'POST' && systemup_usermanager_guard_is_reserved_name($_POST['username'] ?? '')) {
        systemup_usermanager_guard_deny();
    }
}
