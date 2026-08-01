<?php
/*
 * Privilegio customizado SystemUp para tecnicos provisionados pelo controlador.
 *
 * Acesso amplo ao webConfigurator, EXCETO User Manager / Group Manager
 * (impede alterar senha do admin ou de outros usuarios / auto-escalar via grupos).
 * A pagina User Password Manager permanece permitida (troca da propria senha).
 *
 * Carregado automaticamente pelo framework pfSense via /usr/local/pkg/priv/*.inc
 */

global $priv_list;

$priv_list['page-systemup-technician-admin'] = array();
$priv_list['page-systemup-technician-admin']['name'] = gettext(
    'SystemUp - Technician admin (no User Manager)',
);
$priv_list['page-systemup-technician-admin']['descr'] = gettext(
    'Full GUI access except System User Manager and Group Manager. ' .
    'Own password may be changed via User Password Manager.',
);
$priv_list['page-systemup-technician-admin']['match'] = array();

$blockedExact = array(
    'system_usermanager.php',
    'system_usermanager_addprivs.php',
    'system_usermanager_settings.php',
    'system_groupmanager.php',
    'system_groupmanager_addprivs.php',
);

$wwwRoot = '/usr/local/www';
if (!is_dir($wwwRoot)) {
    // Fallback minimo se o path nao existir no momento do include.
    $priv_list['page-systemup-technician-admin']['match'][] = 'index.php*';
    $priv_list['page-systemup-technician-admin']['match'][] = 'status_*.php*';
    $priv_list['page-systemup-technician-admin']['match'][] = 'firewall_*.php*';
    $priv_list['page-systemup-technician-admin']['match'][] = 'interfaces_*.php*';
    $priv_list['page-systemup-technician-admin']['match'][] = 'services_*.php*';
    $priv_list['page-systemup-technician-admin']['match'][] = 'vpn_*.php*';
    $priv_list['page-systemup-technician-admin']['match'][] = 'diag_*.php*';
    $priv_list['page-systemup-technician-admin']['match'][] = 'system_usermanager_passwordmg.php*';
    return;
}

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
