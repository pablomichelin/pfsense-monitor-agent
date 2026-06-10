#!/bin/sh
#
# Diagnóstico de interfaces no pfSense para o agente Monitor.
# Rode no pfSense em Diagnostics > Command Prompt e envie a saída.
#
# Uso no pfSense: copie e cole o bloco inteiro no Command Prompt (ou salve em /tmp/diag.sh e execute sh /tmp/diag.sh).
#
set -u
CONFIG_XML="${MONITOR_AGENT_PFSENSE_CONFIG_XML:-/conf/config.xml}"
export PATH="/usr/local/sbin:/usr/local/bin:/usr/bin:/bin${PATH:+:$PATH}"

echo "=== 1. PATH e PHP ==="
echo "PATH=$PATH"
which php 2>/dev/null || echo "php: nao encontrado"
php -v 2>/dev/null || true

echo ""
echo "=== 2. Config XML ==="
echo "CONFIG_XML=$CONFIG_XML"
if [ -f "$CONFIG_XML" ]; then
  echo "Arquivo existe, tamanho: $(wc -c < "$CONFIG_XML") bytes"
  echo "Estrutura (abertura de interfaces e primeiros filhos):"
  grep -n "<interfaces>" "$CONFIG_XML" | head -1
  sed -n '/<interfaces>/,/<\/interfaces>/p' "$CONFIG_XML" | head -30
else
  echo "Arquivo NAO existe."
fi

echo ""
echo "=== 3. PHP: listar interfaces (mesmo codigo do agente) ==="
PFSENSE_CONFIG_XML="$CONFIG_XML" php -r '
  $configPath = getenv("PFSENSE_CONFIG_XML") ?: "/conf/config.xml";
  $config = @simplexml_load_file($configPath);
  if (!$config) { echo "ERRO: simplexml_load_file falhou\n"; exit(1); }
  if (!isset($config->interfaces)) { echo "AVISO: config->interfaces nao existe\n"; exit(0); }
  $n = 0;
  foreach ($config->interfaces->children() as $name => $node) {
    $if = trim((string) ($node->if ?? ""));
    if ($if === "") { continue; }
    $descr = trim((string) ($node->descr ?? ""));
    echo $name . "\t" . $if . "\t" . $descr . "\n";
    $n++;
  }
  if ($n === 0) { echo "(nenhuma interface com ->if preenchido)\n"; }
' 2>&1

echo ""
echo "=== 4. Teste ifconfig (primeira interface do config) ==="
_first_if=$(PFSENSE_CONFIG_XML="$CONFIG_XML" php -r '
  $configPath = getenv("PFSENSE_CONFIG_XML") ?: "/conf/config.xml";
  $config = @simplexml_load_file($configPath);
  if (!$config || !isset($config->interfaces->lan->if)) { exit(0); }
  echo trim((string)$config->interfaces->lan->if);
' 2>/dev/null)
if [ -n "$_first_if" ]; then
  echo "Interface LAN (if): $_first_if"
  ifconfig "$_first_if" 2>/dev/null | head -5 || echo "ifconfig falhou"
else
  echo "Nao foi possivel obter interface LAN do config."
fi

echo ""
echo "=== 5. Fim do diagnostico ==="
echo "Se o bloco 3 mostrou linhas (role TAB ifname TAB descr), o agente deveria listar interfaces."
echo "Se o bloco 3 estiver vazio ou com ERRO/AVISO, o problema esta no PHP ou no config.xml."
