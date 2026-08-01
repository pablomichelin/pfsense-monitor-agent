<?php

require_once("config.inc");
require_once("globals.inc");

if (!defined("SYSTEMUP_MONITOR_DEFAULT_CONTROLLER_URL")) {
    define("SYSTEMUP_MONITOR_DEFAULT_CONTROLLER_URL", "https://pfs-monitor.systemup.inf.br");
}
if (!defined("SYSTEMUP_MONITOR_DEFAULT_INTERVAL")) {
    define("SYSTEMUP_MONITOR_DEFAULT_INTERVAL", "30");
}
if (!defined("SYSTEMUP_MONITOR_DEFAULT_SERVICES")) {
    define("SYSTEMUP_MONITOR_DEFAULT_SERVICES", "unbound,dhcpd,openvpn,ipsec,wireguard,ntpd,dpinger");
}
if (!defined("SYSTEMUP_MONITOR_DEFAULT_HEARTBEAT_MODE")) {
    define("SYSTEMUP_MONITOR_DEFAULT_HEARTBEAT_MODE", "normal");
}
/** Versão do agente (enviada no heartbeat). Manter igual ao PORTVERSION do Makefile em cada release. */
if (!defined("SYSTEMUP_MONITOR_AGENT_VERSION")) {
    define("SYSTEMUP_MONITOR_AGENT_VERSION", "0.5.8");
}
if (!defined("SYSTEMUP_MONITOR_PFSENSE_UPDATE_CHECK_INTERVAL_HOURS")) {
    define("SYSTEMUP_MONITOR_PFSENSE_UPDATE_CHECK_INTERVAL_HOURS", 6);
}
if (!defined("SYSTEMUP_MONITOR_UI_REFRESH_SECONDS")) {
    define("SYSTEMUP_MONITOR_UI_REFRESH_SECONDS", 10);
}
if (!defined("SYSTEMUP_MONITOR_RELEASE_CACHE_FILE")) {
    define("SYSTEMUP_MONITOR_RELEASE_CACHE_FILE", "/tmp/monitor-package-release-cache.json");
}
if (!defined("SYSTEMUP_MONITOR_RELEASE_CACHE_TTL")) {
    define("SYSTEMUP_MONITOR_RELEASE_CACHE_TTL", 300);
}
if (!defined("SYSTEMUP_MONITOR_UPDATE_LOG_FILE")) {
    define("SYSTEMUP_MONITOR_UPDATE_LOG_FILE", "/tmp/monitor-update.log");
}
if (!defined("SYSTEMUP_MONITOR_UPDATE_LOCK_FILE")) {
    define("SYSTEMUP_MONITOR_UPDATE_LOCK_FILE", "/var/run/monitor-package-update.lock");
}
if (!defined("SYSTEMUP_MONITOR_UPDATE_SECRET_FILE")) {
    define("SYSTEMUP_MONITOR_UPDATE_SECRET_FILE", "/var/db/monitor-pfsense-agent/.update-node-secret");
}
if (!defined("SYSTEMUP_MONITOR_UPDATE_RATE_FILE")) {
    define("SYSTEMUP_MONITOR_UPDATE_RATE_FILE", "/var/db/monitor-pfsense-agent/last-package-update.json");
}
if (!defined("SYSTEMUP_MONITOR_UPDATE_RATE_LIMIT_SECONDS")) {
    define("SYSTEMUP_MONITOR_UPDATE_RATE_LIMIT_SECONDS", 86400);
}
if (!defined("SYSTEMUP_MONITOR_UPDATE_LOCK_STALE_SECONDS")) {
    define("SYSTEMUP_MONITOR_UPDATE_LOCK_STALE_SECONDS", 7200);
}
if (!defined("SYSTEMUP_MONITOR_NODE_SECRET_FILE")) {
    define("SYSTEMUP_MONITOR_NODE_SECRET_FILE", "/var/db/monitor-pfsense-agent/node_secret");
}
/** Allowlist fixa de org/repo do GitHub para download de release (B4 — harden auto-update). */
if (!defined("SYSTEMUP_MONITOR_RELEASE_GITHUB_REPO_PATH")) {
    define("SYSTEMUP_MONITOR_RELEASE_GITHUB_REPO_PATH", "/pablomichelin/pfsense-monitor-agent/");
}

/**
 * Prepara $tab_array e $pgtitle para as paginas do package (config e diagnostico).
 * Assim as abas Configuracao | Diagnostico aparecem e o submenu nao some.
 * @param string $active 'config', 'diagnostico' ou 'backup'
 */
function systemup_monitor_setup_package_tabs($active)
{
    global $tab_array, $pgtitle, $pglinks, $shortcut_section;
    systemup_monitor_apply_flash_message();
    $tab_array = array();
    $tab_array[1][] = array('Configuracao', $active === 'config', '/config_systemup_monitor.php');
    $tab_array[1][] = array('Diagnostico', $active === 'diagnostico', '/status_systemup_monitor.php');
    $tab_array[1][] = array('Backup', $active === 'backup', '/backup_systemup_monitor.php');
    $titles = array(
        'config' => 'Configuracao',
        'diagnostico' => 'Diagnostico',
        'backup' => 'Backup',
    );
    $urls = array(
        'config' => '/config_systemup_monitor.php',
        'diagnostico' => '/status_systemup_monitor.php',
        'backup' => '/backup_systemup_monitor.php',
    );
    $pgtitle = array('Package', 'Services: SystemUp Monitor', $titles[$active] ?? 'Configuracao');
    $pglinks = array('', '', $urls[$active] ?? '/config_systemup_monitor.php');
    $shortcut_section = 'systemup_monitor';
}

function systemup_monitor_render_config_section_header()
{
    echo '<div class="panel panel-default" style="margin-bottom: 1rem;">';
    echo '  <div class="panel-body" style="padding: 0.75rem 1rem;">';
    echo '    <p class="text-muted" style="margin: 0 0 0.35rem 0; font-size: 1rem; font-weight: 600;">Configuração do agente</p>';
    echo '    <p class="text-muted" style="margin: 0; font-size: 0.95rem; line-height: 1.45;">Campos do controlador, identidade do node e serviços monitorados. Use o botão abaixo para alterar URL, node UID, cliente, intervalo e serviços; salve no formulário para aplicar.</p>';
    echo '  </div>';
    echo '</div>';
}

function systemup_monitor_supported_services()
{
    return array(
        'unbound' => array(
            'label' => 'DNS Resolver (unbound)',
            'description' => 'Servico de resolucao DNS local do pfSense.',
        ),
        'dhcpd' => array(
            'label' => 'DHCP Server (dhcpd)',
            'description' => 'Servico DHCP local do pfSense.',
        ),
        'dpinger' => array(
            'label' => 'Gateway Monitoring (dpinger)',
            'description' => 'Daemon de monitoramento de gateways.',
        ),
        'openvpn' => array(
            'label' => 'OpenVPN',
            'description' => 'Instancias OpenVPN do firewall.',
        ),
        'ipsec' => array(
            'label' => 'IPsec',
            'description' => 'Servico de tuneis IPsec.',
        ),
        'wireguard' => array(
            'label' => 'WireGuard',
            'description' => 'Instancias WireGuard configuradas no firewall.',
        ),
        'ntpd' => array(
            'label' => 'NTP clock sync (ntpd)',
            'description' => 'Sincronizacao de horario do firewall.',
        ),
    );
}

function systemup_monitor_service_checkbox_field($service_name)
{
    return 'service_' . preg_replace('/[^a-z0-9_]/', '_', strtolower((string) $service_name));
}

function systemup_monitor_normalize_services_csv($value)
{
    $supported = array_keys(systemup_monitor_supported_services());
    $entries = preg_split('/\s*,\s*/', strtolower(trim((string) $value)));
    $selected = array();

    foreach ($entries as $entry) {
        if ($entry === '' || !in_array($entry, $supported, true)) {
            continue;
        }

        if (!in_array($entry, $selected, true)) {
            $selected[] = $entry;
        }
    }

    return implode(',', $selected);
}

function systemup_monitor_any_service_checkbox_present($pkg)
{
    foreach (array_keys(systemup_monitor_supported_services()) as $service_name) {
        $field = systemup_monitor_service_checkbox_field($service_name);
        if (array_key_exists($field, $pkg)) {
            return true;
        }
    }

    return false;
}

function systemup_monitor_normalize_heartbeat_mode($value)
{
    $normalized = strtolower(trim((string) $value));
    return $normalized === 'light' ? 'light' : 'normal';
}

function systemup_monitor_selected_services($pkg)
{
    $selected = array();

    if (systemup_monitor_any_service_checkbox_present($pkg)) {
        foreach (array_keys(systemup_monitor_supported_services()) as $service_name) {
            $field = systemup_monitor_service_checkbox_field($service_name);
            if (($pkg[$field] ?? '') === 'on') {
                $selected[] = $service_name;
            }
        }

        return $selected;
    }

    $normalizedCsv = systemup_monitor_normalize_services_csv($pkg['services_csv'] ?? SYSTEMUP_MONITOR_DEFAULT_SERVICES);
    return $normalizedCsv === '' ? array() : explode(',', $normalizedCsv);
}

function systemup_monitor_sync_service_fields(&$pkg)
{
    $selectedServices = systemup_monitor_selected_services($pkg);
    $pkg['services_csv'] = implode(',', $selectedServices);

    foreach (array_keys(systemup_monitor_supported_services()) as $service_name) {
        $field = systemup_monitor_service_checkbox_field($service_name);
        $pkg[$field] = in_array($service_name, $selectedServices, true) ? 'on' : '';
    }
}

function systemup_monitor_selected_service_labels($pkg)
{
    $labels = array();
    $supported = systemup_monitor_supported_services();

    foreach (systemup_monitor_selected_services($pkg) as $service_name) {
        $labels[] = $supported[$service_name]['label'] ?? $service_name;
    }

    return $labels;
}

function &systemup_monitor_config_ref()
{
    global $config;

    if (!is_array($config['installedpackages'])) {
        $config['installedpackages'] = array();
    }

    if (!is_array($config['installedpackages']['systemupmonitor'])) {
        $config['installedpackages']['systemupmonitor'] = array();
    }

    if (!is_array($config['installedpackages']['systemupmonitor']['config'])) {
        $config['installedpackages']['systemupmonitor']['config'] = array(array());
    }

    return $config['installedpackages']['systemupmonitor']['config'][0];
}

function systemup_monitor_defaults()
{
    return array(
        'description' => 'Agente Principal',
        'enabled' => '',
        'controller_url' => SYSTEMUP_MONITOR_DEFAULT_CONTROLLER_URL,
        'interval_seconds' => SYSTEMUP_MONITOR_DEFAULT_INTERVAL,
        'services_csv' => SYSTEMUP_MONITOR_DEFAULT_SERVICES,
        'heartbeat_mode' => SYSTEMUP_MONITOR_DEFAULT_HEARTBEAT_MODE,
        'monitored_packages_csv' => '',
        // Diretriz 2026-08-01: backup (agendado + remoto) habilitado por padrão.
        'config_backup_enabled' => 'on',
        'config_backup_schedule_mode' => 'hours',
        'config_backup_interval_hours' => '24',
        'config_backup_schedule_time' => '03:00',
        'config_backup_schedule_dow' => '1',
        'config_backup_schedule_dom' => '1',
        'config_backup_on_change' => 'on',
        'config_backup_compress' => 'on',
        'config_backup_accept_remote_requests' => 'on',
        // Diretriz 2026-08-01: gestão de técnicos habilitada por padrão no agente.
        'technician_accounts_enabled' => 'on',
    );
}

function systemup_monitor_normalize_yes_no($value, $default = '')
{
    $normalized = strtolower(trim((string) $value));
    if ($normalized === 'on' || $normalized === 'yes' || $normalized === '1' || $normalized === 'true') {
        return 'on';
    }
    if ($normalized === 'off' || $normalized === 'no' || $normalized === '0' || $normalized === 'false') {
        return '';
    }

    return $default;
}

function systemup_monitor_normalize_interval_seconds($value)
{
    $default = (int) SYSTEMUP_MONITOR_DEFAULT_INTERVAL;
    $normalized = trim((string) $value);
    if ($normalized === '' || !ctype_digit($normalized)) {
        return (string) $default;
    }

    $seconds = (int) $normalized;
    if ($seconds < 10) {
        $seconds = 10;
    } elseif ($seconds > 3600) {
        $seconds = 3600;
    }

    return (string) $seconds;
}

function systemup_monitor_apply_defaults()
{
    $pkg =& systemup_monitor_config_ref();
    $defaults = systemup_monitor_defaults();

    foreach ($defaults as $key => $value) {
        if (!isset($pkg[$key]) || $pkg[$key] === '') {
            $pkg[$key] = $value;
        }
    }

    $pkg['interval_seconds'] = systemup_monitor_normalize_interval_seconds($pkg['interval_seconds'] ?? SYSTEMUP_MONITOR_DEFAULT_INTERVAL);
    $pkg['services_csv'] = systemup_monitor_normalize_services_csv($pkg['services_csv'] ?? SYSTEMUP_MONITOR_DEFAULT_SERVICES);
    $pkg['heartbeat_mode'] = systemup_monitor_normalize_heartbeat_mode($pkg['heartbeat_mode'] ?? SYSTEMUP_MONITOR_DEFAULT_HEARTBEAT_MODE);
    systemup_monitor_sync_service_fields($pkg);
}

function systemup_monitor_validate_package_input(&$input_errors)
{
    if (!is_array($input_errors)) {
        $input_errors = array();
    }

    $controllerUrl = trim((string) ($_POST['controller_url'] ?? ''));
    if ($controllerUrl !== '') {
        $parsed = parse_url($controllerUrl);
        $scheme = strtolower((string) ($parsed['scheme'] ?? ''));
        if (!is_array($parsed) || $scheme === '' || !in_array($scheme, array('http', 'https'), true) || empty($parsed['host'])) {
            $input_errors[] = gettext('Controller URL must be a valid http or https URL.');
        }
    }

    foreach (array('node_uid' => 'Node UID', 'customer_code' => 'Customer code') as $field => $label) {
        $value = trim((string) ($_POST[$field] ?? ''));
        if ($value !== '' && !preg_match('/^[A-Za-z0-9._-]+$/', $value)) {
            $input_errors[] = sprintf(gettext('%s must contain only letters, numbers, dot, underscore or hyphen.'), $label);
        }
    }

    $interval = trim((string) ($_POST['interval_seconds'] ?? ''));
    if ($interval !== '' && !ctype_digit($interval)) {
        $input_errors[] = gettext('Heartbeat interval must be a numeric value in seconds.');
    }
}

function systemup_monitor_read_config()
{
    systemup_monitor_apply_defaults();
    $pkg =& systemup_monitor_config_ref();
    return $pkg;
}

function systemup_monitor_runtime_paths()
{
    return array(
        'config_file' => '/usr/local/etc/monitor-pfsense-agent.conf',
        'log_file' => '/var/log/monitor-pfsense-agent.log',
        'agent_bin' => '/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh',
        'loop_bin' => '/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent-loop.sh',
        'rc_script' => '/usr/local/etc/rc.d/monitor_pfsense_agent',
    );
}

function systemup_monitor_service_definition()
{
    return array(
        'name' => 'monitor_pfsense_agent',
        'description' => 'SystemUp Monitor Agent',
        'rcfile' => 'monitor_pfsense_agent',
        'custom_php_service_status_command' => '$rc = (mwexec("/usr/sbin/service monitor_pfsense_agent onestatus >/dev/null 2>&1") == 0);',
    );
}

function systemup_monitor_service_entry_matches($service)
{
    if (!is_array($service)) {
        return false;
    }

    $definition = systemup_monitor_service_definition();

    return ($service['name'] ?? '') === $definition['name']
        && ($service['rcfile'] ?? '') === $definition['rcfile']
        && ($service['description'] ?? '') === $definition['description'];
}

/**
 * Entradas de menu espelhadas de systemup_monitor.xml (Services + Status).
 *
 * @return array<int, array<string, string>>
 */
function systemup_monitor_menu_definitions()
{
    return array(
        array(
            'name' => 'SystemUp Monitor',
            'section' => 'Services',
            'configfile' => 'systemup_monitor.xml',
            'tooltiptext' => 'Configure o agente leve do Monitor-Pfsense.',
            'url' => '/config_systemup_monitor.php',
        ),
        array(
            'name' => 'SystemUp Monitor',
            'section' => 'Status',
            'configfile' => 'systemup_monitor.xml',
            'tooltiptext' => 'Diagnostico e status do agente Monitor-Pfsense.',
            'url' => '/status_systemup_monitor.php',
        ),
    );
}

function systemup_monitor_count_menu_entries()
{
    global $config;

    $menus = $config['installedpackages']['menu'] ?? array();
    if (!is_array($menus)) {
        return 0;
    }

    $total = 0;
    foreach (systemup_monitor_menu_definitions() as $expected) {
        foreach ($menus as $menu) {
            if (!is_array($menu)) {
                continue;
            }
            if (trim((string) ($menu['name'] ?? '')) === trim($expected['name'])
                && (string) ($menu['section'] ?? '') === (string) $expected['section']) {
                $total++;
                break;
            }
        }
    }

    return $total;
}

function systemup_monitor_is_menu_registered()
{
    return systemup_monitor_count_menu_entries() >= count(systemup_monitor_menu_definitions());
}

/**
 * Injeta entradas de menu ausentes (mesma logica de install_package_xml).
 *
 * @return bool true se alterou installedpackages.menu
 */
function systemup_monitor_register_menu()
{
    global $config;

    if (!is_array($config['installedpackages']['menu'] ?? null)) {
        $config['installedpackages']['menu'] = array();
    }

    $changed = false;

    foreach (systemup_monitor_menu_definitions() as $menu) {
        foreach ($config['installedpackages']['menu'] as $existing) {
            if (!is_array($existing)) {
                continue;
            }
            if (trim((string) ($existing['name'] ?? '')) === trim($menu['name'])
                && (string) ($existing['section'] ?? '') === (string) $menu['section']) {
                continue 2;
            }
        }

        $config['installedpackages']['menu'][] = $menu;
        $changed = true;
    }

    return $changed;
}

/**
 * Reparo idempotente: install_package_xml + menu manual + servico + write_config.
 */
function systemup_monitor_ensure_gui_registration($reason = 'SystemUp Monitor GUI registration')
{
    if (!function_exists('install_package_xml')) {
        require_once('/etc/inc/pkg-utils.inc');
    }

    install_package_xml('systemup-monitor');
    systemup_monitor_register_menu();
    systemup_monitor_register_service();
    systemup_monitor_persist_package_config($reason);

    return systemup_monitor_is_menu_registered();
}

function systemup_monitor_is_service_registered()
{
    global $config;

    if (!is_array($config['installedpackages']['service'] ?? null)) {
        return false;
    }

    $service_name = systemup_monitor_service_definition()['name'];

    foreach ($config['installedpackages']['service'] as $service) {
        if (is_array($service) && ($service['name'] ?? '') === $service_name) {
            return true;
        }
    }

    return false;
}

/**
 * Registra o servico rc.d do agente em $config (somente secao installedpackages.service).
 *
 * @return bool true se alterou a entrada do servico
 */
function systemup_monitor_register_service()
{
    global $config;

    if (!is_array($config['installedpackages']['service'])) {
        $config['installedpackages']['service'] = array();
    }

    $service_name = systemup_monitor_service_definition()['name'];
    $definition = systemup_monitor_service_definition();

    foreach ($config['installedpackages']['service'] as $index => $service) {
        if (!is_array($service) || ($service['name'] ?? '') !== $service_name) {
            continue;
        }

        if (systemup_monitor_service_entry_matches($service)) {
            return false;
        }

        $config['installedpackages']['service'][$index] = $definition;

        return true;
    }

    $config['installedpackages']['service'][] = $definition;

    return true;
}

/**
 * Localiza apenas a entrada rc.d deste package em installedpackages.service.
 *
 * @return array|null
 */
function systemup_monitor_find_monitor_service_entry()
{
    global $config;

    if (!is_array($config['installedpackages']['service'] ?? null)) {
        return null;
    }

    $service_name = systemup_monitor_service_definition()['name'];

    foreach ($config['installedpackages']['service'] as $service) {
        if (is_array($service) && ($service['name'] ?? '') === $service_name) {
            return $service;
        }
    }

    return null;
}

/**
 * Mescla somente a entrada monitor_pfsense_agent (nunca substitui o array inteiro).
 */
function systemup_monitor_import_monitor_service_from_snapshot(array $snapshot)
{
    if (!empty($snapshot['remove_monitor_service'])) {
        systemup_monitor_unregister_service();

        return;
    }

    // Compatibilidade: snapshots 0.3.5 exportavam service_entries completo — extrair so nossa entrada.
    if (isset($snapshot['service_entries']) && !array_key_exists('monitor_service_entry', $snapshot)) {
        $service_name = systemup_monitor_service_definition()['name'];
        $has_monitor_entry = false;

        if (is_array($snapshot['service_entries'])) {
            foreach ($snapshot['service_entries'] as $service) {
                if (is_array($service) && ($service['name'] ?? '') === $service_name) {
                    $has_monitor_entry = true;
                    break;
                }
            }
        }

        if ($has_monitor_entry) {
            systemup_monitor_register_service();
        }

        return;
    }

    if (!array_key_exists('monitor_service_entry', $snapshot)) {
        return;
    }

    if ($snapshot['monitor_service_entry'] !== null) {
        systemup_monitor_register_service();
    } else {
        systemup_monitor_unregister_service();
    }
}

/**
 * Snapshot apenas das secoes do package no config.xml (nunca do config inteiro).
 */
function systemup_monitor_export_package_snapshot()
{
    global $config;

    $snapshot = array(
        'remove_systemupmonitor' => false,
        'systemupmonitor' => null,
        'monitor_service_entry' => null,
        'remove_monitor_service' => false,
    );

    if (isset($config['installedpackages']['systemupmonitor'])) {
        $snapshot['systemupmonitor'] = $config['installedpackages']['systemupmonitor'];
    } else {
        $snapshot['remove_systemupmonitor'] = true;
    }

    $entry = systemup_monitor_find_monitor_service_entry();
    if ($entry !== null) {
        $snapshot['monitor_service_entry'] = $entry;
    } else {
        $snapshot['remove_monitor_service'] = true;
    }

    return $snapshot;
}

/**
 * Aplica snapshot do package sobre $config ja recarregado do disco.
 */
function systemup_monitor_import_package_snapshot(array $snapshot)
{
    global $config;

    if (!is_array($config['installedpackages'])) {
        $config['installedpackages'] = array();
    }

    if (!empty($snapshot['remove_systemupmonitor'])) {
        unset($config['installedpackages']['systemupmonitor']);
    } elseif (($snapshot['systemupmonitor'] ?? null) !== null) {
        $config['installedpackages']['systemupmonitor'] = $snapshot['systemupmonitor'];
    }

    systemup_monitor_import_monitor_service_from_snapshot($snapshot);
}

/**
 * Persiste somente secoes do SystemUp Monitor no config.xml.
 *
 * Recarrega o config do disco (config_read_file) antes de gravar, reaplicando apenas
 * o snapshot do package. Evita sobrescrever VPN/NAT/regras com $config stale.
 *
 * @param string $reason Mensagem do Configuration History
 * @param array|null $snapshot Snapshot pre-montado (ex.: remove); null = montar agora
 */
function systemup_monitor_persist_package_config($reason, $snapshot = null)
{
    if ($snapshot === null) {
        systemup_monitor_apply_defaults();
        systemup_monitor_register_menu();
        systemup_monitor_register_service();
        $snapshot = systemup_monitor_export_package_snapshot();
    }

    if (function_exists('config_read_file')) {
        config_read_file();
    } elseif (function_exists('parse_config')) {
        $config = parse_config(true);
    }

    systemup_monitor_import_package_snapshot($snapshot);

    if (empty($snapshot['remove_systemupmonitor'])) {
        systemup_monitor_apply_defaults();
        // config_read_file() acima descarta entradas de menu adicionadas em
        // memoria por systemup_monitor_register_menu(); re-injeta as ausentes
        // antes do write_config para o reparo de GUI nao ser perdido (doc 140).
        systemup_monitor_register_menu();
    }

    write_config($reason);
}

function systemup_monitor_unregister_service()
{
    global $config;

    if (!is_array($config['installedpackages']['service'])) {
        return;
    }

    $service_name = systemup_monitor_service_definition()['name'];

    foreach ($config['installedpackages']['service'] as $index => $service) {
        if (is_array($service) && ($service['name'] ?? '') === $service_name) {
            unset($config['installedpackages']['service'][$index]);
        }
    }

    $config['installedpackages']['service'] = array_values($config['installedpackages']['service']);
}

function systemup_monitor_is_enabled($pkg)
{
    return isset($pkg['enabled']) && $pkg['enabled'] === 'on';
}

function systemup_monitor_node_secret_file_path()
{
    return SYSTEMUP_MONITOR_NODE_SECRET_FILE;
}

function systemup_monitor_read_node_secret_file()
{
    $path = systemup_monitor_node_secret_file_path();
    if (!is_readable($path)) {
        return '';
    }

    return trim((string) file_get_contents($path));
}

function systemup_monitor_write_node_secret_file($secret)
{
    $secret = trim((string) $secret);
    if ($secret === '') {
        return false;
    }

    $path = systemup_monitor_node_secret_file_path();
    systemup_monitor_ensure_directory(dirname($path));
    if (file_put_contents($path, $secret . "\n") === false) {
        return false;
    }
    @chmod($path, 0600);

    return true;
}

function systemup_monitor_remove_node_secret_file()
{
    $path = systemup_monitor_node_secret_file_path();
    if (is_file($path)) {
        @unlink($path);
    }
}

/**
 * Resolve node secret: arquivo runtime (canonico) ou legado no XML (migracao copy-on-read).
 */
function systemup_monitor_resolve_node_secret(array $pkg)
{
    $fromFile = systemup_monitor_read_node_secret_file();
    if ($fromFile !== '') {
        return $fromFile;
    }

    return trim((string) ($pkg['node_secret'] ?? ''));
}

function systemup_monitor_node_secret_is_stored(array $pkg)
{
    if (systemup_monitor_read_node_secret_file() !== '') {
        return true;
    }

    return systemup_monitor_normalize_yes_no($pkg['secret_stored'] ?? '', '') === 'on';
}

/**
 * Migra secret legado do XML para arquivo; limpa XML apos sucesso.
 *
 * @return bool true se migrou nesta chamada
 */
function systemup_monitor_migrate_node_secret_from_xml(&$pkg, $persist = true)
{
    if (systemup_monitor_read_node_secret_file() !== '') {
        if (trim((string) ($pkg['node_secret'] ?? '')) !== '' || systemup_monitor_normalize_yes_no($pkg['secret_stored'] ?? '', '') !== 'on') {
            $pkg['node_secret'] = '';
            $pkg['secret_stored'] = 'on';
            if ($persist) {
                systemup_monitor_persist_package_config('SystemUp Monitor node secret migrated to runtime file');
            }

            return false;
        }

        return false;
    }

    $legacy = trim((string) ($pkg['node_secret'] ?? ''));
    if ($legacy === '') {
        return false;
    }

    if (!systemup_monitor_write_node_secret_file($legacy)) {
        return false;
    }

    $pkg['node_secret'] = '';
    $pkg['secret_stored'] = 'on';

    if ($persist) {
        systemup_monitor_persist_package_config('SystemUp Monitor node secret migrated to runtime file');
    }

    return true;
}

function systemup_monitor_store_node_secret(&$pkg, $secret, $persist = true)
{
    $secret = trim((string) $secret);
    if ($secret === '') {
        return false;
    }

    if (!systemup_monitor_write_node_secret_file($secret)) {
        return false;
    }

    $pkg['node_secret'] = '';
    $pkg['secret_stored'] = 'on';

    if ($persist) {
        systemup_monitor_persist_package_config('SystemUp Monitor node secret stored in runtime file');
    }

    return true;
}

function systemup_monitor_has_required_runtime_config($pkg, &$missing_fields = array())
{
    $missing_fields = array();

    foreach (array('controller_url', 'node_uid', 'customer_code') as $field) {
        if (!isset($pkg[$field]) || trim((string) $pkg[$field]) === '') {
            $missing_fields[] = $field;
        }
    }

    if (systemup_monitor_resolve_node_secret($pkg) === '') {
        $missing_fields[] = 'node_secret';
    }

    return empty($missing_fields);
}

function systemup_monitor_escape_shell_value($value)
{
    return str_replace(array("\\", "\"", "\n", "\r"), array("\\\\", "\\\"", "", ""), (string) $value);
}

function systemup_monitor_ensure_directory($directory)
{
    if (!is_dir($directory)) {
        @mkdir($directory, 0755, true);
    }
}

function systemup_monitor_touch_log_file($path)
{
    $directory = dirname($path);
    systemup_monitor_ensure_directory($directory);

    if (!file_exists($path)) {
        @touch($path);
    }
}

function systemup_monitor_render_agent_config($pkg)
{
    systemup_monitor_migrate_node_secret_from_xml($pkg, false);
    $nodeSecret = systemup_monitor_resolve_node_secret($pkg);
    $selectedServices = implode(',', systemup_monitor_selected_services($pkg));
    $heartbeatMode = systemup_monitor_normalize_heartbeat_mode($pkg['heartbeat_mode'] ?? SYSTEMUP_MONITOR_DEFAULT_HEARTBEAT_MODE);
    $lightHeartbeat = $heartbeatMode === 'light' ? '1' : '0';
    $monitoredPackages = isset($pkg['monitored_packages_csv'])
        ? trim((string) $pkg['monitored_packages_csv'])
        : '';

    $lines = array(
        'CONTROLLER_URL="' . systemup_monitor_escape_shell_value($pkg['controller_url']) . '"',
        'NODE_UID="' . systemup_monitor_escape_shell_value($pkg['node_uid']) . '"',
        // B1: o .conf aponta para o arquivo 0600 do segredo; nao grava o segredo em texto.
        'NODE_SECRET_FILE="' . systemup_monitor_escape_shell_value(systemup_monitor_node_secret_file_path()) . '"',
        'CUSTOMER_CODE="' . systemup_monitor_escape_shell_value($pkg['customer_code']) . '"',
        'AGENT_VERSION="' . (defined("SYSTEMUP_MONITOR_AGENT_VERSION") ? SYSTEMUP_MONITOR_AGENT_VERSION : "0.2.0") . '"',
        'SCHEMA_VERSION="2026-01"',
        'MONITOR_AGENT_INTERVAL_SECONDS="' . systemup_monitor_escape_shell_value(systemup_monitor_normalize_interval_seconds($pkg['interval_seconds'] ?? SYSTEMUP_MONITOR_DEFAULT_INTERVAL)) . '"',
        'MONITOR_AGENT_LOG_FILE="/var/log/monitor-pfsense-agent.log"',
        'MONITOR_AGENT_SERVICES="' . systemup_monitor_escape_shell_value($selectedServices) . '"',
        'MONITOR_AGENT_LIGHT_HEARTBEAT="' . $lightHeartbeat . '"',
    );
    // Fallback de seguranca: se o arquivo de segredo ainda nao existe, manter o
    // valor no .conf para nao interromper a autenticacao ate a proxima migracao.
    if (systemup_monitor_read_node_secret_file() === '' && $nodeSecret !== '') {
        $lines[] = 'NODE_SECRET="' . systemup_monitor_escape_shell_value($nodeSecret) . '"';
    }
    if ($monitoredPackages !== '') {
        $lines[] = 'MONITOR_AGENT_PACKAGES="' . systemup_monitor_escape_shell_value($monitoredPackages) . '"';
    }

    $backupEnabled = systemup_monitor_normalize_yes_no($pkg['config_backup_enabled'] ?? 'on', 'on');
    $lines[] = 'MONITOR_AGENT_CONFIG_BACKUP_ENABLED="' . ($backupEnabled === 'on' ? '1' : '0') . '"';
    $schedule = systemup_monitor_normalize_backup_schedule($pkg);
    $lines[] = 'MONITOR_AGENT_CONFIG_BACKUP_SCHEDULE_MODE="' . systemup_monitor_escape_shell_value($schedule['mode']) . '"';
    $lines[] = 'MONITOR_AGENT_CONFIG_BACKUP_INTERVAL_HOURS="' . systemup_monitor_escape_shell_value($schedule['interval_hours']) . '"';
    $lines[] = 'MONITOR_AGENT_CONFIG_BACKUP_SCHEDULE_TIME="' . systemup_monitor_escape_shell_value($schedule['time']) . '"';
    $lines[] = 'MONITOR_AGENT_CONFIG_BACKUP_SCHEDULE_DOW="' . systemup_monitor_escape_shell_value($schedule['dow']) . '"';
    $lines[] = 'MONITOR_AGENT_CONFIG_BACKUP_SCHEDULE_DOM="' . systemup_monitor_escape_shell_value($schedule['dom']) . '"';
    $lines[] = 'MONITOR_AGENT_CONFIG_BACKUP_ON_CHANGE="' . (systemup_monitor_normalize_yes_no($pkg['config_backup_on_change'] ?? 'on', 'on') === 'on' ? '1' : '0') . '"';
    $lines[] = 'MONITOR_AGENT_CONFIG_BACKUP_COMPRESS="' . (systemup_monitor_normalize_yes_no($pkg['config_backup_compress'] ?? 'on', 'on') === 'on' ? '1' : '0') . '"';
    $lines[] = 'MONITOR_AGENT_CONFIG_BACKUP_ACCEPT_REMOTE_REQUESTS="' . (systemup_monitor_normalize_yes_no($pkg['config_backup_accept_remote_requests'] ?? 'on', 'on') === 'on' ? '1' : '0') . '"';
    $lines[] = 'MONITOR_AGENT_CONFIG_BACKUP_STATE_DIR="/var/db/monitor-pfsense-agent"';
    $lines[] = 'MONITOR_AGENT_PFSENSE_CONFIG_XML="/conf/config.xml"';
    $lines[] = 'MONITOR_AGENT_PFSENSE_UPDATE_CHECK_INTERVAL_HOURS="' . systemup_monitor_escape_shell_value((string) SYSTEMUP_MONITOR_PFSENSE_UPDATE_CHECK_INTERVAL_HOURS) . '"';
    $lines[] = 'MONITOR_AGENT_CONFIG_SNAPSHOT_TTL_SECONDS="86400"';
    $lines[] = 'MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED="' . systemup_monitor_escape_shell_value((string) ($pkg['pfsense_upgrade_exec_enabled'] ?? '1')) . '"';
    $lines[] = 'MONITOR_AGENT_OPERATIONAL_ACTIONS_ENABLED="' . systemup_monitor_escape_shell_value((string) ($pkg['operational_actions_enabled'] ?? '0')) . '"';
    $lines[] = 'MONITOR_AGENT_SERVICE_RESTART_ENABLED="' . systemup_monitor_escape_shell_value((string) ($pkg['service_restart_enabled'] ?? '0')) . '"';
    $lines[] = 'MONITOR_AGENT_NODE_REBOOT_ENABLED="' . systemup_monitor_escape_shell_value((string) ($pkg['node_reboot_enabled'] ?? '0')) . '"';
    $technicianAccountsEnabled = systemup_monitor_normalize_yes_no(
        $pkg['technician_accounts_enabled'] ?? 'on',
        'on',
    );
    $lines[] = 'MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED="' . ($technicianAccountsEnabled === 'on' ? '1' : '0') . '"';

    return implode("\n", $lines) . "\n";
}

function systemup_monitor_write_runtime_config($pkg)
{
    systemup_monitor_migrate_node_secret_from_xml($pkg, true);
    $paths = systemup_monitor_runtime_paths();
    $directory = dirname($paths['config_file']);

    systemup_monitor_ensure_directory($directory);
    file_put_contents($paths['config_file'], systemup_monitor_render_agent_config($pkg));
    @chmod($paths['config_file'], 0600);

    systemup_monitor_touch_log_file($paths['log_file']);
}

function systemup_monitor_remove_runtime_config()
{
    $paths = systemup_monitor_runtime_paths();

    if (file_exists($paths['config_file'])) {
        @unlink($paths['config_file']);
    }
}

function systemup_monitor_truncate_log_url($url, $max = 120)
{
    $url = trim((string) $url);
    if (strlen($url) <= $max) {
        return $url;
    }

    return substr($url, 0, $max) . '...';
}

function systemup_monitor_url_allowed_for_controller($url, $controllerUrl)
{
    $url = trim((string) $url);
    $controllerUrl = rtrim(trim((string) $controllerUrl), '/');
    if ($url === '' || $controllerUrl === '') {
        return false;
    }

    $parsedUrl = parse_url($url);
    if (!is_array($parsedUrl) || empty($parsedUrl['host'])) {
        return false;
    }

    if (strpos($url, $controllerUrl . '/') === 0) {
        return true;
    }

    $parsedController = parse_url($controllerUrl);
    $controllerHost = trim((string) ($parsedController['host'] ?? ''));
    if ($controllerHost !== '' && strcasecmp($parsedUrl['host'], $controllerHost) === 0) {
        return true;
    }

    // B4: hosts do GitHub so sao aceitos quando o path pertence ao org/repo oficial.
    // Integridade adicional garantida pelo pin de SHA256 em validate_release_urls().
    $repoScopedHosts = array(
        'raw.githubusercontent.com',
        'github.com',
    );
    $path = (string) ($parsedUrl['path'] ?? '');
    foreach ($repoScopedHosts as $host) {
        if (strcasecmp($parsedUrl['host'], $host) === 0
            && stripos($path, SYSTEMUP_MONITOR_RELEASE_GITHUB_REPO_PATH) === 0) {
            return true;
        }
    }

    return false;
}

function systemup_monitor_validate_release_urls($controllerUrl, array $release)
{
    foreach (array('artifact_url', 'installer_url') as $field) {
        $url = trim((string) ($release[$field] ?? ''));
        if ($url === '') {
            return 'Release sem URL: ' . $field;
        }
        if (!systemup_monitor_url_allowed_for_controller($url, $controllerUrl)) {
            return 'URL de release nao permitida (' . $field . '): '
                . systemup_monitor_truncate_log_url($url);
        }
    }

    $sha256 = trim((string) ($release['sha256'] ?? ''));
    if ($sha256 === '' || !preg_match('/^[a-f0-9]{64}$/i', $sha256)) {
        return 'Release sem SHA256 valido.';
    }

    return '';
}

function systemup_monitor_write_update_secret_file($secret)
{
    $path = SYSTEMUP_MONITOR_UPDATE_SECRET_FILE;
    systemup_monitor_ensure_directory(dirname($path));
    file_put_contents($path, (string) $secret);
    @chmod($path, 0600);

    return $path;
}

function systemup_monitor_remove_update_secret_file()
{
    if (is_file(SYSTEMUP_MONITOR_UPDATE_SECRET_FILE)) {
        @unlink(SYSTEMUP_MONITOR_UPDATE_SECRET_FILE);
    }
}

/**
 * P3/P4: checagem + aquisicao atomica do lock de update (create exclusivo).
 * Stale so libera quando idade > TTL, nenhum installer ativo e log sem atividade recente.
 */
function systemup_monitor_try_acquire_update_lock()
{
    $lockFile = SYSTEMUP_MONITOR_UPDATE_LOCK_FILE;
    systemup_monitor_ensure_directory(dirname($lockFile));

    if (is_file($lockFile)) {
        $raw = @file_get_contents($lockFile);
        $data = is_string($raw) ? json_decode($raw, true) : null;
        $startedAt = is_array($data) ? (int) ($data['started_at'] ?? 0) : 0;
        $age = $startedAt > 0 ? (time() - $startedAt) : PHP_INT_MAX;

        if ($age < SYSTEMUP_MONITOR_UPDATE_LOCK_STALE_SECONDS) {
            if (systemup_monitor_is_update_running()) {
                return false;
            }
        } else {
            if (systemup_monitor_is_update_running()) {
                return false;
            }

            $logFile = SYSTEMUP_MONITOR_UPDATE_LOG_FILE;
            $logRecent = is_file($logFile) && (time() - (int) @filemtime($logFile)) < 300;
            if ($logRecent) {
                return false;
            }
        }

        @unlink($lockFile);
    }

    $payload = json_encode(array(
        'pid' => getmypid(),
        'started_at' => time(),
    ));

    $handle = @fopen($lockFile, 'x');
    if ($handle === false) {
        return false;
    }

    fwrite($handle, $payload);
    fclose($handle);

    return true;
}

/** @deprecated Use systemup_monitor_try_acquire_update_lock() */
function systemup_monitor_acquire_update_lock()
{
    return systemup_monitor_try_acquire_update_lock();
}

function systemup_monitor_release_update_lock()
{
    if (is_file(SYSTEMUP_MONITOR_UPDATE_LOCK_FILE)) {
        @unlink(SYSTEMUP_MONITOR_UPDATE_LOCK_FILE);
    }
}

function systemup_monitor_update_rate_limit_blocks($force = false)
{
    if ($force) {
        return false;
    }

    $path = SYSTEMUP_MONITOR_UPDATE_RATE_FILE;
    if (!is_readable($path)) {
        return false;
    }

    $data = json_decode((string) file_get_contents($path), true);
    if (!is_array($data)) {
        return false;
    }

    $lastAt = (int) ($data['started_at'] ?? 0);
    if ($lastAt <= 0) {
        return false;
    }

    return (time() - $lastAt) < SYSTEMUP_MONITOR_UPDATE_RATE_LIMIT_SECONDS;
}

function systemup_monitor_record_update_started()
{
    $path = SYSTEMUP_MONITOR_UPDATE_RATE_FILE;
    systemup_monitor_ensure_directory(dirname($path));
    file_put_contents($path, json_encode(array(
        'started_at' => time(),
    )));
}

function systemup_monitor_package_uninstall()
{
    systemup_monitor_sync_service(false, false, false);
    systemup_monitor_run_command('/usr/sbin/service monitor_pfsense_agent stop 2>/dev/null || true');
    systemup_monitor_remove_runtime_config();
    systemup_monitor_remove_update_secret_file();
    systemup_monitor_remove_node_secret_file();

    if (file_exists('/usr/sbin/sysrc')) {
        systemup_monitor_run_command('/usr/sbin/sysrc monitor_pfsense_agent_enable=NO 2>/dev/null || true');
    }

    // B6: lista explicita de temporarios do package (evita glob agressivo em /tmp).
    $tempFiles = array(
        SYSTEMUP_MONITOR_UPDATE_LOG_FILE,
        SYSTEMUP_MONITOR_RELEASE_CACHE_FILE,
        '/tmp/install-from-release.sh',
        '/tmp/monitor-package-release-cache.json',
        '/tmp/monitor-update.log',
    );
    foreach ($tempFiles as $tempFile) {
        if (is_file($tempFile)) {
            @unlink($tempFile);
        }
    }

    systemup_monitor_release_update_lock();
}

function systemup_monitor_run_command($command)
{
    $output = array();
    $exit_code = 0;

    exec($command . ' 2>&1', $output, $exit_code);

    return array(
        'exit_code' => $exit_code,
        'output' => implode("\n", $output),
    );
}

/**
 * Valida o token CSRF do pfSense (csrf-magic) em requisicoes POST.
 * Retorna true quando ok ou quando a requisicao nao e POST.
 */
function systemup_monitor_csrf_validate_post()
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        return true;
    }

    if (function_exists('csrf_check')) {
        return (bool) csrf_check(false);
    }

    if (function_exists('log_error')) {
        log_error('SystemUp Monitor: CSRF helper indisponivel; POST rejeitado.');
    }

    return false;
}

/**
 * Tags ocultas de CSRF para incluir nos formularios das paginas WWW do package.
 */
function systemup_monitor_csrf_tags()
{
    if (function_exists('csrf_get_tags')) {
        return csrf_get_tags();
    }

    return '';
}

/**
 * Verdadeiro quando o usuario da sessao tem privilegio administrativo.
 * Fail-closed quando helpers de privilegio do pfSense nao existem ou a sessao
 * nao tem privilegio administrativo real (page-all, uid 0 ou grupo admins).
 */
function systemup_monitor_current_user_is_admin()
{
    if (!function_exists('getUserEntry') || !function_exists('userHasPrivilege')) {
        return false;
    }

    $username = $_SESSION['Username'] ?? '';
    if ($username === '') {
        return false;
    }

    $userEntry = getUserEntry($username);
    if (!is_array($userEntry)) {
        return false;
    }

    // pfSense 2.7+ retorna ['idx' => ..., 'item' => ...]; versoes antigas retornam o usuario direto.
    $user = (isset($userEntry['item']) && is_array($userEntry['item']))
        ? $userEntry['item']
        : $userEntry;

    if (!is_array($user)) {
        return false;
    }

    if (userHasPrivilege($user, 'page-all')) {
        return true;
    }

    if (isset($user['uid']) && (string) $user['uid'] === '0') {
        return true;
    }

    if (function_exists('getUserGroups')) {
        $authcfg = function_exists('auth_get_authserver')
            ? auth_get_authserver(config_get_path('system/webgui/authmode'))
            : null;
        $groups = getUserGroups($user['name'] ?? $username, $authcfg, $_SESSION['user_radius_attributes'] ?? null);
        if (is_array($groups) && in_array('admins', $groups, true)) {
            return true;
        }
    }

    return false;
}

function systemup_monitor_redirect_self(array $query = array())
{
    $path = $_SERVER['SCRIPT_NAME'] ?? '';
    if ($path === '') {
        return;
    }

    $location = $path;
    if (!empty($query)) {
        $location .= '?' . http_build_query($query);
    }

    header('Location: ' . $location);
    exit;
}

function systemup_monitor_apply_flash_message()
{
    global $savemsg;

    if (!empty($savemsg)) {
        return;
    }

    $msg = trim((string) ($_GET['msg'] ?? ''));
    if ($msg === '') {
        return;
    }

    switch ($msg) {
        case 'backup_saved':
            $savemsg = 'Configuracoes de backup salvas e agente sincronizado.';
            break;
        case 'backup_ok':
            $savemsg = 'Backup enviado ao controlador.';
            break;
        case 'backup_fail':
            $savemsg = 'Falha ao enviar backup agora.';
            break;
        case 'update_started':
            $savemsg = 'Atualizacao iniciada. A pagina atualiza sozinha; log: ' . SYSTEMUP_MONITOR_UPDATE_LOG_FILE;
            break;
        case 'update_fail':
            $detail = trim((string) ($_GET['detail'] ?? ''));
            $savemsg = $detail !== ''
                ? $detail
                : 'Falha ao iniciar atualizacao do package.';
            break;
        case 'csrf_fail':
            $savemsg = 'Falha de validacao CSRF. Recarregue a pagina e tente novamente.';
            break;
        case 'forbidden':
            $savemsg = 'Acao restrita a administradores.';
            break;
    }
}

function systemup_monitor_should_auto_refresh_page()
{
    if (systemup_monitor_is_update_running()) {
        return true;
    }

    return trim((string) ($_GET['msg'] ?? '')) === 'update_started';
}

function systemup_monitor_render_auto_refresh_script()
{
    if (!systemup_monitor_should_auto_refresh_page()) {
        return;
    }

    $seconds = (int) SYSTEMUP_MONITOR_UI_REFRESH_SECONDS;
    if ($seconds < 3) {
        $seconds = 3;
    }

    echo '<script>(function(){var s=' . $seconds . '000;setTimeout(function(){window.location.replace(window.location.pathname);},s);})();</script>';
}

function systemup_monitor_sync_service($enabled, $config_ready, $background = false)
{
    $paths = systemup_monitor_runtime_paths();

    if (!file_exists($paths['rc_script']) || !file_exists('/usr/sbin/service')) {
        return;
    }

    if (file_exists('/usr/sbin/sysrc')) {
        $enable_value = ($enabled && $config_ready) ? 'YES' : 'NO';
        systemup_monitor_run_command('/usr/sbin/sysrc monitor_pfsense_agent_enable=' . $enable_value);
    }

    $serviceCommand = $enabled && $config_ready
        ? '/bin/sh -c "/usr/sbin/service monitor_pfsense_agent restart || /usr/sbin/service monitor_pfsense_agent start"'
        : '/bin/sh -c "/usr/sbin/service monitor_pfsense_agent stop || true"';

    if ($background) {
        systemup_monitor_run_command('nohup ' . $serviceCommand . ' >/dev/null 2>&1 &');
        return;
    }

    systemup_monitor_run_command($serviceCommand);
}

function systemup_monitor_refresh_pfsense_update_check($background = true)
{
    $helper = '/usr/local/libexec/monitor-pfsense-agent/check_pfsense_update_available.sh';
    if (!is_file($helper) || !is_executable($helper)) {
        return;
    }

    $state_file = '/var/db/monitor-pfsense-agent/pfsense-update-check.json';
    if (is_file($state_file)) {
        @unlink($state_file);
    }

    $command = escapeshellarg($helper) . ' force-check';
    if ($background) {
        systemup_monitor_run_command('nohup ' . $command . ' >/dev/null 2>&1 &');
        return;
    }

    systemup_monitor_run_command($command);
}

function systemup_monitor_sync_config($restartService = true, $backgroundRestart = false)
{
    systemup_monitor_apply_defaults();
    $pkg =& systemup_monitor_config_ref();
    systemup_monitor_migrate_node_secret_from_xml($pkg, true);
    systemup_monitor_sync_service_fields($pkg);
    $missing_fields = array();
    $config_ready = systemup_monitor_has_required_runtime_config($pkg, $missing_fields);

    if ($config_ready) {
        systemup_monitor_write_runtime_config($pkg);
    } else {
        systemup_monitor_remove_runtime_config();
    }

    if ($restartService) {
        systemup_monitor_sync_service(systemup_monitor_is_enabled($pkg), $config_ready, $backgroundRestart);
    }

    systemup_monitor_refresh_pfsense_update_check(true);

    // Resync periodico: nao gravar config.xml (evita revert por $config stale).
    // Persistencia explicita via systemup_monitor_persist_package_config() ou save do pfSense.
    // Durante install_package_xml, custom_php_resync roda ANTES do registro de menu no pfSense;
    // gravar aqui sem menu deixava package=1/service=1/menu=0 no config.xml.
    if (!systemup_monitor_is_service_registered()) {
        systemup_monitor_register_service();
        if (systemup_monitor_is_menu_registered()) {
            systemup_monitor_persist_package_config('SystemUp Monitor service registered');
        }
    }

    return true;
}

/**
 * Persiste ajustes de backup sem reiniciar o servico na requisicao HTTP.
 * O agente rele o arquivo de runtime a cada ciclo do loop (30s).
 */
function systemup_monitor_sync_backup_settings()
{
    systemup_monitor_apply_defaults();
    $pkg =& systemup_monitor_config_ref();
    systemup_monitor_migrate_node_secret_from_xml($pkg, true);
    systemup_monitor_sync_service_fields($pkg);
    $missing_fields = array();
    $config_ready = systemup_monitor_has_required_runtime_config($pkg, $missing_fields);

    if ($config_ready) {
        systemup_monitor_write_runtime_config($pkg);
    }

    systemup_monitor_persist_package_config('SystemUp Monitor backup settings updated');

    return true;
}

function systemup_monitor_mask_secret($secret)
{
    if ($secret === 'configurado') {
        return 'configurado (arquivo runtime)';
    }

    if (empty($secret)) {
        return 'nao configurado';
    }

    $length = strlen($secret);
    if ($length <= 8) {
        return str_repeat('*', $length);
    }

    return substr($secret, 0, 3) . str_repeat('*', $length - 6) . substr($secret, -3);
}

function systemup_monitor_secret_display_label(array $pkg)
{
    if (systemup_monitor_node_secret_is_stored($pkg)) {
        return 'configurado';
    }

    $secret = trim((string) ($pkg['node_secret'] ?? ''));

    return systemup_monitor_mask_secret($secret);
}

function systemup_monitor_local_commands()
{
    return array(
        'service monitor_pfsense_agent status',
        '/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh print-config',
        '/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh test-connection',
        '/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh heartbeat',
        '/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh backup-status',
        '/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh backup-config',
        'tail -n 50 /var/log/monitor-pfsense-agent.log',
    );
}

function systemup_monitor_backup_schedule_modes()
{
    return array(
        'hours' => 'A cada X horas',
        'daily' => 'Diariamente',
        'weekly' => 'Semanalmente',
        'monthly' => 'Mensalmente',
    );
}

function systemup_monitor_backup_schedule_dow_labels()
{
    return array(
        '0' => 'Domingo',
        '1' => 'Segunda-feira',
        '2' => 'Terca-feira',
        '3' => 'Quarta-feira',
        '4' => 'Quinta-feira',
        '5' => 'Sexta-feira',
        '6' => 'Sabado',
    );
}

function systemup_monitor_normalize_backup_schedule_mode($value)
{
    $normalized = strtolower(trim((string) $value));
    $modes = array_keys(systemup_monitor_backup_schedule_modes());

    return in_array($normalized, $modes, true) ? $normalized : 'hours';
}

function systemup_monitor_normalize_backup_schedule_time($value, $default = '03:00')
{
    $value = trim((string) $value);
    if (preg_match('/^([01][0-9]|2[0-3]):([0-5][0-9])$/', $value)) {
        return $value;
    }

    return $default;
}

function systemup_monitor_normalize_backup_schedule_dow($value, $default = '1')
{
    $dow = (int) $value;
    if ($dow < 0 || $dow > 6) {
        return $default;
    }

    return (string) $dow;
}

function systemup_monitor_normalize_backup_schedule_dom($value, $default = '1')
{
    $dom = (int) $value;
    if ($dom < 1 || $dom > 28) {
        return $default;
    }

    return (string) $dom;
}

function systemup_monitor_normalize_backup_schedule($pkg)
{
    $intervalHours = trim((string) ($pkg['config_backup_interval_hours'] ?? '24'));
    if ($intervalHours === '' || !ctype_digit($intervalHours)) {
        $intervalHours = '24';
    }
    $intervalHours = (string) max(1, min(168, (int) $intervalHours));

    return array(
        'mode' => systemup_monitor_normalize_backup_schedule_mode($pkg['config_backup_schedule_mode'] ?? 'hours'),
        'interval_hours' => $intervalHours,
        'time' => systemup_monitor_normalize_backup_schedule_time($pkg['config_backup_schedule_time'] ?? '03:00'),
        'dow' => systemup_monitor_normalize_backup_schedule_dow($pkg['config_backup_schedule_dow'] ?? '1'),
        'dom' => systemup_monitor_normalize_backup_schedule_dom($pkg['config_backup_schedule_dom'] ?? '1'),
    );
}

function systemup_monitor_backup_schedule_time_parts($time)
{
    $normalized = systemup_monitor_normalize_backup_schedule_time($time);
    $parts = explode(':', $normalized);

    return array(
        'hour' => $parts[0] ?? '03',
        'minute' => $parts[1] ?? '00',
    );
}

function systemup_monitor_backup_schedule_time_from_post($post)
{
    if (isset($post['config_backup_schedule_hour'], $post['config_backup_schedule_minute'])) {
        $hour = max(0, min(23, (int) $post['config_backup_schedule_hour']));
        $minute = max(0, min(59, (int) $post['config_backup_schedule_minute']));

        return sprintf('%02d:%02d', $hour, $minute);
    }

    return systemup_monitor_normalize_backup_schedule_time($post['config_backup_schedule_time'] ?? '03:00');
}

function systemup_monitor_apply_backup_schedule_post(&$pkgref, $post)
{
    $schedule = systemup_monitor_normalize_backup_schedule(array(
        'config_backup_schedule_mode' => $post['config_backup_schedule_mode'] ?? 'hours',
        'config_backup_interval_hours' => $post['config_backup_interval_hours'] ?? '24',
        'config_backup_schedule_time' => systemup_monitor_backup_schedule_time_from_post($post),
        'config_backup_schedule_dow' => $post['config_backup_schedule_dow'] ?? '1',
        'config_backup_schedule_dom' => $post['config_backup_schedule_dom'] ?? '1',
    ));

    $pkgref['config_backup_schedule_mode'] = $schedule['mode'];
    $pkgref['config_backup_interval_hours'] = $schedule['interval_hours'];
    $pkgref['config_backup_schedule_time'] = $schedule['time'];
    $pkgref['config_backup_schedule_dow'] = $schedule['dow'];
    $pkgref['config_backup_schedule_dom'] = $schedule['dom'];
}

function systemup_monitor_backup_schedule_label($pkg)
{
    $schedule = systemup_monitor_normalize_backup_schedule($pkg);
    $dowLabels = systemup_monitor_backup_schedule_dow_labels();

    switch ($schedule['mode']) {
        case 'daily':
            return 'Diariamente as ' . $schedule['time'];
        case 'weekly':
            $dowLabel = $dowLabels[$schedule['dow']] ?? $schedule['dow'];
            return 'Semanalmente (' . $dowLabel . ') as ' . $schedule['time'];
        case 'monthly':
            return 'Mensalmente (dia ' . $schedule['dom'] . ') as ' . $schedule['time'];
        case 'hours':
        default:
            return 'A cada ' . $schedule['interval_hours'] . ' hora(s)';
    }
}

function systemup_monitor_backup_state_paths()
{
    $stateDir = '/var/db/monitor-pfsense-agent';
    return array(
        'state_dir' => $stateDir,
        'last_sha256' => $stateDir . '/last-config-backup.sha256',
        'last_at' => $stateDir . '/last-config-backup-at',
        'last_error' => $stateDir . '/last-config-backup-error',
    );
}

function systemup_monitor_backup_summary()
{
    $paths = systemup_monitor_backup_state_paths();
    $summary = array(
        'last_sha256' => '',
        'last_at' => '',
        'last_error' => '',
        'state_dir' => $paths['state_dir'],
    );

    if (is_readable($paths['last_sha256'])) {
        $summary['last_sha256'] = trim((string) file_get_contents($paths['last_sha256']));
    }
    if (is_readable($paths['last_at'])) {
        $summary['last_at'] = trim((string) file_get_contents($paths['last_at']));
    }
    if (is_readable($paths['last_error'])) {
        $summary['last_error'] = trim((string) file_get_contents($paths['last_error']));
    }

    return $summary;
}

function systemup_monitor_run_backup_now()
{
    $paths = systemup_monitor_runtime_paths();
    if (!file_exists($paths['agent_bin'])) {
        return array('exit_code' => 1, 'output' => 'agent binary not found');
    }

    return systemup_monitor_run_command('/bin/sh ' . escapeshellarg($paths['agent_bin']) . ' backup-config');
}

function systemup_monitor_read_heartbeat_error_summary()
{
    $path = '/var/db/monitor-pfsense-agent/last-heartbeat-error.json';
    if (!is_readable($path)) {
        return null;
    }

    $data = json_decode((string) file_get_contents($path), true);
    if (!is_array($data)) {
        return null;
    }

    return array(
        'recorded_at' => trim((string) ($data['recorded_at'] ?? '')),
        'error_class' => trim((string) ($data['error_class'] ?? '')),
        'http_code' => isset($data['http_code']) ? (int) $data['http_code'] : null,
        'body_excerpt' => trim((string) ($data['body_excerpt'] ?? '')),
    );
}

function systemup_monitor_runtime_summary()
{
    $pkg = systemup_monitor_read_config();
    $paths = systemup_monitor_runtime_paths();
    $missing_fields = array();
    $config_ready = systemup_monitor_has_required_runtime_config($pkg, $missing_fields);
    $service_status = 'not installed';
    $service_detail = '';

    if (file_exists($paths['rc_script']) && file_exists('/usr/sbin/service')) {
        $result = systemup_monitor_run_command('/usr/sbin/service monitor_pfsense_agent onestatus');
        if ($result['exit_code'] === 0) {
            $service_status = 'running';
            $service_detail = $result['output'];
        } else {
            $result = systemup_monitor_run_command('/usr/sbin/service monitor_pfsense_agent status');
            $service_status = 'stopped';
            $service_detail = $result['output'];
        }
    }

    return array(
        'enabled' => systemup_monitor_is_enabled($pkg),
        'heartbeat_mode' => systemup_monitor_normalize_heartbeat_mode($pkg['heartbeat_mode'] ?? SYSTEMUP_MONITOR_DEFAULT_HEARTBEAT_MODE),
        'config_ready' => $config_ready,
        'missing_fields' => $missing_fields,
        'config_exists' => file_exists($paths['config_file']),
        'config_file' => $paths['config_file'],
        'log_file' => $paths['log_file'],
        'agent_bin' => $paths['agent_bin'],
        'loop_bin' => $paths['loop_bin'],
        'rc_script' => $paths['rc_script'],
        'service_status' => $service_status,
        'service_detail' => $service_detail,
        'last_heartbeat_error' => systemup_monitor_read_heartbeat_error_summary(),
    );
}

function systemup_monitor_installed_version()
{
    $paths = systemup_monitor_runtime_paths();
    if (is_readable($paths['config_file'])) {
        $content = @file_get_contents($paths['config_file']);
        if (is_string($content) && preg_match('/^AGENT_VERSION="([^"]+)"/m', $content, $matches)) {
            $fromConfig = trim((string) $matches[1]);
            if ($fromConfig !== '') {
                return $fromConfig;
            }
        }
    }

    return defined('SYSTEMUP_MONITOR_AGENT_VERSION')
        ? (string) SYSTEMUP_MONITOR_AGENT_VERSION
        : '0.0.0';
}

function systemup_monitor_release_cache_key($controllerUrl)
{
    return sha1(rtrim(trim((string) $controllerUrl), '/'));
}

function systemup_monitor_release_cache_read($controllerUrl)
{
    $cacheFile = SYSTEMUP_MONITOR_RELEASE_CACHE_FILE;
    if (!is_readable($cacheFile)) {
        return null;
    }

    $decoded = json_decode((string) file_get_contents($cacheFile), true);
    if (!is_array($decoded)) {
        return null;
    }

    $entry = $decoded[systemup_monitor_release_cache_key($controllerUrl)] ?? null;
    if (!is_array($entry) || !isset($entry['cached_at'], $entry['release']) || !is_array($entry['release'])) {
        return null;
    }

    if (time() - (int) $entry['cached_at'] > SYSTEMUP_MONITOR_RELEASE_CACHE_TTL) {
        return null;
    }

    return $entry['release'];
}

function systemup_monitor_release_cache_write($controllerUrl, $release)
{
    if (!is_array($release)) {
        return;
    }

    $cacheFile = SYSTEMUP_MONITOR_RELEASE_CACHE_FILE;
    $decoded = array();
    if (is_readable($cacheFile)) {
        $existing = json_decode((string) file_get_contents($cacheFile), true);
        if (is_array($existing)) {
            $decoded = $existing;
        }
    }

    $decoded[systemup_monitor_release_cache_key($controllerUrl)] = array(
        'cached_at' => time(),
        'release' => $release,
    );

    @file_put_contents($cacheFile, json_encode($decoded));
}

function systemup_monitor_http_get_ca_bundle_paths()
{
    return array(
        '/etc/ssl/cert.pem',
        '/usr/local/etc/ssl/cert.pem',
        '/usr/local/share/certs/ca-root-nss.crt',
        '/etc/ssl/certs/ca-certificates.crt',
    );
}

function systemup_monitor_resolve_curl_bin()
{
    if (is_executable('/usr/local/bin/curl')) {
        return '/usr/local/bin/curl';
    }

    $which = systemup_monitor_run_command('command -v curl');
    if ((int) $which['exit_code'] === 0 && trim((string) $which['output']) !== '') {
        return trim((string) $which['output']);
    }

    return '';
}

function systemup_monitor_normalize_version($version)
{
    $normalized = strtolower(trim((string) $version));
    $normalized = preg_replace('/^v/', '', $normalized);
    $normalized = preg_replace('/-release$/', '', $normalized);

    return $normalized === '' ? '0.0.0' : $normalized;
}

function systemup_monitor_version_compare($left, $right)
{
    return version_compare(
        systemup_monitor_normalize_version($left),
        systemup_monitor_normalize_version($right)
    );
}

function systemup_monitor_http_get($url, $timeoutSeconds = 20, &$diagnostic = null)
{
    if (!is_array($diagnostic)) {
        $diagnostic = array();
    }

    $diagnostic = array(
        'url' => (string) $url,
        'method' => '',
        'http_code' => 0,
        'error' => '',
    );

    if (!is_string($url) || trim($url) === '') {
        $diagnostic['error'] = 'URL vazia';
        return null;
    }

    $userAgent = 'SystemUp-Monitor/' . systemup_monitor_installed_version();

    if (function_exists('curl_init')) {
        $diagnostic['method'] = 'php-curl';
        $ch = curl_init($url);
        $options = array(
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => $timeoutSeconds,
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_USERAGENT => $userAgent,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        );

        foreach (systemup_monitor_http_get_ca_bundle_paths() as $caBundlePath) {
            if (is_readable($caBundlePath)) {
                $options[CURLOPT_CAINFO] = $caBundlePath;
                break;
            }
        }

        curl_setopt_array($ch, $options);
        $body = curl_exec($ch);
        $diagnostic['http_code'] = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($body === false) {
            $diagnostic['error'] = (string) curl_error($ch);
        } elseif ($diagnostic['http_code'] < 200 || $diagnostic['http_code'] >= 300) {
            $diagnostic['error'] = 'HTTP ' . $diagnostic['http_code'];
        }

        curl_close($ch);

        if ($body !== false && $diagnostic['http_code'] >= 200 && $diagnostic['http_code'] < 300) {
            return (string) $body;
        }
    }

    $curlBin = systemup_monitor_resolve_curl_bin();
    if ($curlBin === '') {
        if ($diagnostic['error'] === '') {
            $diagnostic['error'] = 'curl indisponivel';
        }
        return null;
    }

    $diagnostic['method'] = 'cli-curl';
    $result = systemup_monitor_run_command(
        escapeshellarg($curlBin)
            . ' -fsS --max-time ' . (int) $timeoutSeconds
            . ' -A ' . escapeshellarg($userAgent)
            . ' ' . escapeshellarg($url)
    );

    if ((int) $result['exit_code'] === 0 && trim((string) $result['output']) !== '') {
        $diagnostic['http_code'] = 200;
        $diagnostic['error'] = '';
        return (string) $result['output'];
    }

    if ($diagnostic['error'] === '') {
        $diagnostic['error'] = trim((string) $result['output']) !== ''
            ? trim((string) $result['output'])
            : 'cli curl falhou';
    }

    return null;
}

function systemup_monitor_parse_remote_release_body($body)
{
    $decoded = json_decode((string) $body, true);
    if (!is_array($decoded)) {
        return null;
    }

    $version = trim((string) ($decoded['version'] ?? ''));
    $sha256 = trim((string) ($decoded['sha256'] ?? ''));
    $artifactUrl = trim((string) ($decoded['artifact_url'] ?? ''));
    $installerUrl = trim((string) ($decoded['installer_url'] ?? ''));

    if ($version === '' || $sha256 === '' || $artifactUrl === '' || $installerUrl === '') {
        return null;
    }

    return array(
        'version' => $version,
        'sha256' => $sha256,
        'artifact_url' => $artifactUrl,
        'installer_url' => $installerUrl,
        'generated_at' => trim((string) ($decoded['generated_at'] ?? '')),
    );
}

function systemup_monitor_fetch_remote_release($controllerUrl)
{
    static $requestCache = array();

    $base = rtrim(trim((string) $controllerUrl), '/');
    if ($base === '') {
        return null;
    }

    $cacheKey = systemup_monitor_release_cache_key($base);
    if (isset($requestCache[$cacheKey])) {
        return $requestCache[$cacheKey];
    }

    $url = $base . '/api/v1/agent/package-release';
    $diagnostic = array();
    $body = systemup_monitor_http_get($url, 20, $diagnostic);
    $release = $body !== null ? systemup_monitor_parse_remote_release_body($body) : null;

    if ($release === null) {
        $release = systemup_monitor_release_cache_read($base);
    }

    if ($release !== null) {
        $requestCache[$cacheKey] = $release;
        if ($body !== null) {
            systemup_monitor_release_cache_write($base, $release);
        }
        return $release;
    }

    return null;
}

function systemup_monitor_fetch_remote_release_diagnostic($controllerUrl)
{
    $base = rtrim(trim((string) $controllerUrl), '/');
    if ($base === '') {
        return 'Controller URL nao configurada.';
    }

    $url = $base . '/api/v1/agent/package-release';
    $diagnostic = array();
    $body = systemup_monitor_http_get($url, 20, $diagnostic);
    if ($body === null) {
        $detail = trim((string) ($diagnostic['error'] ?? ''));
        $method = trim((string) ($diagnostic['method'] ?? ''));
        $httpCode = (int) ($diagnostic['http_code'] ?? 0);

        $message = 'Nao foi possivel consultar a versao publicada no controlador.';
        if ($method !== '' || $detail !== '' || $httpCode > 0) {
            $parts = array();
            if ($method !== '') {
                $parts[] = $method;
            }
            if ($httpCode > 0) {
                $parts[] = 'HTTP ' . $httpCode;
            }
            if ($detail !== '') {
                $parts[] = $detail;
            }
            $message .= ' (' . implode('; ', $parts) . ')';
        }

        return $message;
    }

    if (systemup_monitor_parse_remote_release_body($body) === null) {
        return 'Resposta invalida do controlador em ' . $url . '.';
    }

    return '';
}

function systemup_monitor_update_status($pkg = null)
{
    if ($pkg === null) {
        $pkg = systemup_monitor_read_config();
    }

    $installedVersion = systemup_monitor_installed_version();
    $status = array(
        'installed_version' => $installedVersion,
        'remote_version' => '',
        'update_available' => false,
        'check_ok' => false,
        'check_error' => '',
        'update_running' => systemup_monitor_is_update_running(),
        'log_file' => SYSTEMUP_MONITOR_UPDATE_LOG_FILE,
        'release' => null,
    );

    $controllerUrl = trim((string) ($pkg['controller_url'] ?? ''));
    if ($controllerUrl === '') {
        $status['check_error'] = 'Controller URL nao configurada.';
        return $status;
    }

    $release = systemup_monitor_fetch_remote_release($controllerUrl);
    if ($release === null) {
        $status['check_error'] = systemup_monitor_fetch_remote_release_diagnostic($controllerUrl);
        return $status;
    }

    $status['check_ok'] = true;
    $status['release'] = $release;
    $status['remote_version'] = $release['version'];
    $status['update_available'] = systemup_monitor_version_compare(
        $installedVersion,
        $release['version']
    ) < 0;

    return $status;
}

function systemup_monitor_is_update_running()
{
    $result = systemup_monitor_run_command('pgrep -f "install-from-release.sh.*monitor-pfsense-package"');
    return (int) $result['exit_code'] === 0 && trim((string) $result['output']) !== '';
}

function systemup_monitor_shell_quote($value)
{
    return "'" . str_replace("'", "'\"'\"'", (string) $value) . "'";
}

function systemup_monitor_build_package_update_command($pkg, $release)
{
    $secretFile = systemup_monitor_write_update_secret_file(systemup_monitor_resolve_node_secret($pkg));

    $args = array(
        '--release-url ' . systemup_monitor_shell_quote($release['artifact_url']),
        '--sha256 ' . systemup_monitor_shell_quote($release['sha256']),
        '--secret-file ' . systemup_monitor_shell_quote($secretFile),
        '--controller-url ' . systemup_monitor_shell_quote($pkg['controller_url']),
        '--node-uid ' . systemup_monitor_shell_quote($pkg['node_uid']),
        '--customer-code ' . systemup_monitor_shell_quote($pkg['customer_code']),
        '--heartbeat-mode ' . systemup_monitor_shell_quote(
            systemup_monitor_normalize_heartbeat_mode($pkg['heartbeat_mode'] ?? SYSTEMUP_MONITOR_DEFAULT_HEARTBEAT_MODE)
        ),
    );

    if (!empty($pkg['interval_seconds'])) {
        $args[] = '--interval-seconds ' . systemup_monitor_shell_quote($pkg['interval_seconds']);
    }

    $selectedServices = implode(',', systemup_monitor_selected_services($pkg));
    if ($selectedServices !== '') {
        $args[] = '--services ' . systemup_monitor_shell_quote($selectedServices);
    }

    $backupEnabled = systemup_monitor_normalize_yes_no($pkg['config_backup_enabled'] ?? 'on', 'on');
    $args[] = '--config-backup-enabled ' . systemup_monitor_shell_quote($backupEnabled === 'on' ? 'yes' : 'no');

    $installerUrl = $release['installer_url'];
    $installArgs = implode(' ', $args);
    $logFile = SYSTEMUP_MONITOR_UPDATE_LOG_FILE;
    $artifactLog = systemup_monitor_truncate_log_url($release['artifact_url']);
    $installerLog = systemup_monitor_truncate_log_url($installerUrl);

    $innerCommand = 'echo "[monitor-update] fetch installer ' . $installerLog . '" >> ' . systemup_monitor_shell_quote($logFile)
        . ' && fetch -o /tmp/install-from-release.sh ' . systemup_monitor_shell_quote($installerUrl)
        . ' && chmod +x /tmp/install-from-release.sh'
        . ' && echo "[monitor-update] install artifact ' . $artifactLog . ' sha256=' . substr($release['sha256'], 0, 12) . '..." >> ' . systemup_monitor_shell_quote($logFile)
        . ' && MONITOR_UPDATE_NODE_SECRET="$(cat ' . systemup_monitor_shell_quote($secretFile) . ')" /tmp/install-from-release.sh ' . $installArgs
        . ' && rm -f ' . systemup_monitor_shell_quote($secretFile);

    return 'nohup /bin/sh -c ' . systemup_monitor_shell_quote($innerCommand)
        . ' </dev/null >>' . systemup_monitor_shell_quote($logFile) . ' 2>&1'
        . " & echo 'Atualizacao em segundo plano. Log: tail -f " . $logFile . "'";
}

function systemup_monitor_start_package_update($force = false)
{
    $pkg = systemup_monitor_read_config();
    $missing = array();
    if (!systemup_monitor_has_required_runtime_config($pkg, $missing)) {
        return array(
            'exit_code' => 1,
            'output' => 'Configuracao incompleta para atualizar: ' . implode(', ', $missing),
        );
    }

    if (systemup_monitor_update_rate_limit_blocks($force)) {
        return array(
            'exit_code' => 1,
            'output' => 'Limite local: no maximo 1 atualizacao a cada 24h. Use CLI upgrade --force para ignorar.',
        );
    }

    if (!systemup_monitor_try_acquire_update_lock()) {
        return array(
            'exit_code' => 1,
            'output' => 'Outra atualizacao ja em andamento.',
        );
    }

    $status = systemup_monitor_update_status($pkg);
    if (!$status['check_ok'] || empty($status['release'])) {
        systemup_monitor_release_update_lock();
        return array(
            'exit_code' => 1,
            'output' => $status['check_error'] !== '' ? $status['check_error'] : 'Falha ao consultar release.',
        );
    }

    if (!$status['update_available']) {
        systemup_monitor_release_update_lock();
        return array(
            'exit_code' => 0,
            'output' => 'Package ja esta na versao mais recente (' . $status['installed_version'] . ').',
        );
    }

    $urlError = systemup_monitor_validate_release_urls($pkg['controller_url'], $status['release']);
    if ($urlError !== '') {
        systemup_monitor_release_update_lock();
        return array(
            'exit_code' => 1,
            'output' => $urlError,
        );
    }

    $command = systemup_monitor_build_package_update_command($pkg, $status['release']);
    $result = systemup_monitor_run_command('/bin/sh -c ' . escapeshellarg($command));

    if ((int) $result['exit_code'] !== 0) {
        systemup_monitor_release_update_lock();
        $result['output'] = trim((string) $result['output']);
        if ($result['output'] === '') {
            $result['output'] = 'Falha ao iniciar processo de atualizacao (rate-limit nao aplicado).';
        } else {
            $result['output'] .= ' (rate-limit nao aplicado).';
        }
        return $result;
    }

    systemup_monitor_record_update_started();

    return $result;
}

function systemup_monitor_handle_package_update_post()
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        return;
    }

    if (($_POST['action'] ?? '') !== 'package_update') {
        return;
    }

    if (!systemup_monitor_csrf_validate_post()) {
        systemup_monitor_redirect_self(array('msg' => 'csrf_fail'));
        return;
    }

    if (!systemup_monitor_current_user_is_admin()) {
        systemup_monitor_redirect_self(array('msg' => 'forbidden'));
        return;
    }

    $result = systemup_monitor_start_package_update();
    if ((int) $result['exit_code'] !== 0) {
        systemup_monitor_redirect_self(array(
            'msg' => 'update_fail',
            'detail' => substr(trim((string) $result['output']), 0, 240),
        ));
    }

    systemup_monitor_redirect_self(array('msg' => 'update_started'));
}

function systemup_monitor_render_config_update_action()
{
    $status = systemup_monitor_update_status();

    if ($status['update_running']) {
        echo '<div style="margin-bottom: 1rem;">';
        echo '  <span class="text-muted">Atualizacao em andamento. Log: <code>' . htmlspecialchars($status['log_file']) . '</code>';
        echo ' — recarregando a pagina a cada ' . (int) SYSTEMUP_MONITOR_UI_REFRESH_SECONDS . 's.</span>';
        echo '</div>';
        return;
    }

    if (!$status['check_ok']) {
        if ($status['check_error'] !== '') {
            echo '<div class="alert alert-warning" style="margin-bottom: 1rem;">';
            echo htmlspecialchars($status['check_error']);
            echo '<br><span class="text-muted">Alternativa: Diagnostics &gt; Command Prompt &gt; ';
            echo '<code>php -f /usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php upgrade</code></span>';
            echo '</div>';
        }
        return;
    }

    if (!$status['update_available']) {
        return;
    }

    if (!systemup_monitor_current_user_is_admin()) {
        return;
    }

    $remoteVersion = htmlspecialchars($status['remote_version']);
    echo '<div style="margin-bottom: 1rem; display: flex; align-items: center; flex-wrap: wrap; gap: 0.75rem;">';
    echo '  <form method="post" style="margin: 0;">';
    echo systemup_monitor_csrf_tags();
    echo '    <input type="hidden" name="action" value="package_update" />';
    echo '    <button type="submit" class="btn btn-primary" onclick="return confirm(\'Atualizar o SystemUp Monitor para a versao ' . $remoteVersion . '?\');">';
    echo '      <i class="fa fa-refresh"></i> Atualizar package';
    echo '    </button>';
    echo '  </form>';
    echo '  <span style="font-weight: 600; color: #8a6d3b;">Nova versao disponivel ' . $remoteVersion . '</span>';
    echo '</div>';
}
