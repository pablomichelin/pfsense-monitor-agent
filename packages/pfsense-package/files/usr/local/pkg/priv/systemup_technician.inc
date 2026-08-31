<?php
/*
 * Privilegio customizado SystemUp para tecnicos provisionados pelo controlador.
 *
 * Acesso amplo ao webConfigurator, incluindo User Manager (criar/editar/excluir
 * usuarios de OpenVPN e demais contas locais). Group Manager e settings de
 * autenticacao continuam bloqueados (evita auto-escalar via grupo admins).
 *
 * admin e root sao bloqueados em runtime por systemup_usermanager_guard.inc
 * (nao depende de o tecnico ter page-all).
 *
 * Carregado automaticamente pelo framework pfSense via /usr/local/pkg/priv/*.inc
 */

global $priv_list;

$priv_list['page-systemup-technician-admin'] = array();
$priv_list['page-systemup-technician-admin']['name'] = gettext(
    'SystemUp - Technician admin (User Manager except admin/root)',
);
$priv_list['page-systemup-technician-admin']['descr'] = gettext(
    'Full GUI access including User Manager to create, edit and delete users ' .
    '(OpenVPN system users). admin and root are locked. Group Manager remains blocked.',
);
$priv_list['page-systemup-technician-admin']['match'] = array();

$blockedExact = array(
    'system_usermanager_settings.php',
    'system_groupmanager.php',
    'system_groupmanager_addprivs.php',
);

$wwwRoot = '/usr/local/www';
if (!is_dir($wwwRoot)) {
    $priv_list['page-systemup-technician-admin']['match'][] = 'index.php*';
    $priv_list['page-systemup-technician-admin']['match'][] = 'status_*.php*';
    $priv_list['page-systemup-technician-admin']['match'][] = 'firewall_*.php*';
    $priv_list['page-systemup-technician-admin']['match'][] = 'interfaces_*.php*';
    $priv_list['page-systemup-technician-admin']['match'][] = 'services_*.php*';
    $priv_list['page-systemup-technician-admin']['match'][] = 'vpn_*.php*';
    $priv_list['page-systemup-technician-admin']['match'][] = 'diag_*.php*';
    $priv_list['page-systemup-technician-admin']['match'][] = 'system_usermanager.php*';
    $priv_list['page-systemup-technician-admin']['match'][] = 'system_usermanager_addprivs.php*';
    $priv_list['page-systemup-technician-admin']['match'][] = 'system_usermanager_passwordmg.php*';
} else {
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($wwwRoot, FilesystemIterator::SKIP_DOTS),
    );

    foreach ($iterator as $fileInfo) {
        if (!$fileInfo->isFile()) {
            continue;
        }
        $path = $fileInfo->getPathname();
        if (substr($path, -4) !== '.php') {
            continue;
        }

        $rel = substr($path, strlen($wwwRoot) + 1);
        if ($rel === false || $rel === '') {
            continue;
        }

        $base = basename($rel);
        if (in_array($base, $blockedExact, true)) {
            continue;
        }

        $priv_list['page-systemup-technician-admin']['match'][] = $rel . '*';
    }
}

if (PHP_SAPI !== 'cli') {
    $guard = '/usr/local/pkg/systemup_usermanager_guard.inc';
    if (is_readable($guard)) {
        require_once $guard;
        if (function_exists('systemup_usermanager_guard_enforce')) {
            systemup_usermanager_guard_enforce();
        }
    }
}
