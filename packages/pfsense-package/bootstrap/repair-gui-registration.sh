#!/bin/sh
#
# Reparo idempotente: registra menu Services/Status do SystemUp Monitor no config.xml
# quando os arquivos do package existem mas a GUI nao mostra a entrada.
#
# Uso no shell do pfSense (como root):
#   sh repair-gui-registration.sh
#
set -eu

if [ ! -x /usr/local/bin/php ]; then
  echo "PHP nao encontrado (/usr/local/bin/php)." >&2
  exit 1
fi

if [ ! -f /etc/inc/config.inc ]; then
  echo "Este script deve rodar no pfSense (config.inc ausente)." >&2
  exit 1
fi

REQUIRED_FILES="
/usr/local/pkg/systemup_monitor.xml
/usr/local/pkg/systemup_monitor.inc
/usr/local/share/pfSense-pkg-systemup-monitor/info.xml
/usr/local/www/config_systemup_monitor.php
/usr/local/www/status_systemup_monitor.php
"

missing=0
for f in $REQUIRED_FILES; do
  if [ ! -f "$f" ]; then
    echo "MISSING $f" >&2
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo "ABORT: arquivos do package ausentes. Reinstale o tarball antes do reparo GUI." >&2
  exit 2
fi

/usr/local/bin/php -d opcache.enable_cli=0 <<'PHP'
<?php
require_once('/etc/inc/config.inc');
require_once('/etc/inc/globals.inc');
require_once('/etc/inc/pkg-utils.inc');
require_once('/usr/local/pkg/systemup_monitor.inc');

function sum_monitor_counts(array $config)
{
    $count_named = function ($items, $field, $expected) {
        $total = 0;
        if (!is_array($items)) {
            return 0;
        }
        foreach ($items as $item) {
            if (is_array($item) && ($item[$field] ?? '') === $expected) {
                $total++;
            }
        }
        return $total;
    };

    return array(
        'package' => $count_named($config['installedpackages']['package'] ?? array(), 'name', 'systemup-monitor'),
        'menu' => $count_named($config['installedpackages']['menu'] ?? array(), 'name', 'SystemUp Monitor'),
        'service' => $count_named($config['installedpackages']['service'] ?? array(), 'name', 'monitor_pfsense_agent'),
    );
}

$before = sum_monitor_counts($config);
echo 'BEFORE package=' . $before['package'] . ' menu=' . $before['menu'] . ' service=' . $before['service'] . PHP_EOL;

install_package_xml('systemup-monitor');
systemup_monitor_register_menu();
systemup_monitor_register_service();
systemup_monitor_persist_package_config('SystemUp Monitor GUI registration repair');

if (function_exists('config_read_file')) {
    config_read_file();
} elseif (function_exists('parse_config')) {
    $config = parse_config(true);
}

$after = sum_monitor_counts($config);
echo 'AFTER  package=' . $after['package'] . ' menu=' . $after['menu'] . ' service=' . $after['service'] . PHP_EOL;

if ($after['menu'] < 1 || $after['package'] < 1) {
    fwrite(STDERR, 'FAIL: menu/package ainda ausente no config.xml apos reparo.' . PHP_EOL);
    exit(1);
}

echo 'OK: recarregue a GUI do pfSense (Ctrl+F5) e confira Services > SystemUp Monitor.' . PHP_EOL;
PHP
