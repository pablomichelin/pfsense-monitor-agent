# 138 — Correção race menu GUI (release 0.4.12)

**Data:** 2026-07-03  
**Status:** Corrigido no código; release **0.4.12** publicada no controlador

---

## Sintoma (HILE `fw-r0f5nver`)

- Agente **online** 0.4.10, serviço `monitor_pfsense_agent` OK
- `config.xml`: `package=1`, `service=1`, **`menu=0`**
- Log: `ensure_package_gui_registration` retenta e falha (`GUI registration failed`)
- **ADML** tem menu; **HILE** não — mesma versão pfSense 2.8.1

---

## Causa raiz

Dois bugs combinados:

### 1. Race em `install_package_xml` (pfSense)

Ordem no core pfSense (`pkg-utils.inc`):

1. Grava entrada `installedpackages/package`
2. Executa `custom_php_resync_config_command` → `systemup_monitor_sync_config()`
3. **Depois** registra `installedpackages/menu`

Em `systemup_monitor_sync_config()`, quando o serviço ainda não estava registrado, chamávamos `systemup_monitor_persist_package_config()` **antes** do passo 3. Isso fazia `config_read_file()` + `write_config()` com **package + service, sem menu** — estado parcial persistido no disco.

### 2. Retry incompleto no `install.sh` (0.4.10 / 0.4.11)

`ensure_package_gui_registration()` retentava via `register_package_gui()` que só executava `install_package_xml()` — sem `systemup_monitor_register_menu()`, sem `write_config` via `persist`. Em hosts já com `package=1`, o retry não reparava o menu.

Releases **0.4.10** (`bbbb35e8…`, 62 051 bytes) e **0.4.11** (`c22edadd…`) tinham retry insuficiente no bootstrap.

---

## Correções (0.4.12)

| Arquivo | Mudança |
|---------|---------|
| `systemup_monitor.inc` | `systemup_monitor_register_menu()`, `systemup_monitor_ensure_gui_registration()`; `sync_config` não persiste antes do menu existir; `persist_package_config` garante menu |
| `install.sh` | `register_package_gui` chama CLI `register-gui` (fluxo completo + opcache off) |
| `systemup_monitor_cli.php` | `register-gui` usa `ensure_gui_registration` |
| `repair-gui-registration.sh` | inclui `register_menu` |

**Release:** `0.4.12` — SHA256 `cef14c46ebef58ec1296cfab6f88f5a5d6a9099ae6cbc49c2de882d3f71ed78a` (63 692 bytes)

---

## Artefato SHA256 (esclarecimento HILE)

| SHA256 | Bytes | Situação |
|--------|-------|----------|
| `e8c41fb9…` | ~61 kB | Artefato **antigo** desalinhado (doc 136) |
| `bbbb35e8…` | **62 051** | 0.4.10 com retry **incompleto** — download correto se SHA bater |
| `cef14c46…` | **63 692** | 0.4.12 com fix definitivo |

Download ~60 kB com SHA `bbbb35e8` = artefato **correto** para 0.4.10; o menu ausente **não** era mismatch de artefato.

---

## Reparo imediato HILE (sem reinstalar)

Colar no shell do pfSense (**root**):

```sh
# Diagnóstico
/usr/local/bin/php -r '
require_once("/etc/inc/config.inc");
$c=function($i,$f,$e){$t=0;if(!is_array($i))return 0;foreach($i as $x){if(is_array($x)&&($x[$f]??"")===$e)$t++;}return $t;};
echo "package=".$c($config["installedpackages"]["package"]??[],"name","systemup-monitor")." menu=".$c($config["installedpackages"]["menu"]??[],"name","SystemUp Monitor")." service=".$c($config["installedpackages"]["service"]??[],"name","monitor_pfsense_agent")."\n";
'

# Reparo (funciona em 0.4.10+ — injeta menu manualmente se install_package_xml não persistir)
/usr/local/bin/php -d opcache.enable_cli=0 -r '
require_once("/etc/inc/config.inc");
require_once("/etc/inc/globals.inc");
require_once("/etc/inc/pkg-utils.inc");
require_once("/usr/local/pkg/systemup_monitor.inc");
install_package_xml("systemup-monitor");
$defs=array(
  array("name"=>"SystemUp Monitor","section"=>"Services","configfile"=>"systemup_monitor.xml","tooltiptext"=>"Configure o agente leve do Monitor-Pfsense.","url"=>"/config_systemup_monitor.php"),
  array("name"=>"SystemUp Monitor","section"=>"Status","configfile"=>"systemup_monitor.xml","tooltiptext"=>"Diagnostico e status do agente Monitor-Pfsense.","url"=>"/status_systemup_monitor.php"),
);
if(!is_array($config["installedpackages"]["menu"]))$config["installedpackages"]["menu"]=array();
foreach($defs as $menu){$skip=false;foreach($config["installedpackages"]["menu"] as $m){if(is_array($m)&&trim($m["name"])==trim($menu["name"])&&($m["section"]??"")==$menu["section"]){$skip=true;break;}}if(!$skip)$config["installedpackages"]["menu"][]=$menu;}
systemup_monitor_register_service();
systemup_monitor_persist_package_config("SystemUp Monitor GUI registration repair");
$c=function($i,$f,$e){$t=0;if(!is_array($i))return 0;foreach($i as $x){if(is_array($x)&&($x[$f]??"")===$e)$t++;}return $t;};
echo "menu=".$c($config["installedpackages"]["menu"]??[],"name","SystemUp Monitor")."\n";
'

rm -f /tmp/config.cache
```

Recarregar GUI (**Ctrl+F5**) → **Services → SystemUp Monitor**.

Após upgrade para **0.4.12**, usar:  
`/usr/local/bin/php -d opcache.enable_cli=0 -f /usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php register-gui`

---

## Reinstalação recomendada (0.4.12)

No servidor do controlador:

```bash
cd /Dados/Monitor-Pfsense
./scripts/generate-install-command.sh fw-r0f5nver
```

SHA256 embutido: `cef14c46ebef58ec1296cfab6f88f5a5d6a9099ae6cbc49c2de882d3f71ed78a`

Verificação API:

```bash
curl -s http://127.0.0.1:8088/api/v1/agent/package-release | jq '{version,sha256}'
curl -sI http://127.0.0.1:8088/api/v1/agent/package-artifact | grep -i content-length
# Content-Length: 63692
```
