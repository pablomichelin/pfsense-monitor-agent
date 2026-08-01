# 137 — Correção menu GUI ausente (HILE / bootstrap background)

**Data:** 2026-07-03  
**Status:** Corrigido no código; release **0.4.12** publicada (ver doc **138**); reparo manual pendente no HILE

---

## Atualização 0.4.12 (causa raiz definitiva)

O retry de **0.4.10/0.4.11** ainda chamava só `install_package_xml` no `install.sh`. A release **0.4.12** corrige:

- race `sync_config` → `persist` antes do registro de menu no pfSense
- injeção explícita `systemup_monitor_register_menu()`
- bootstrap via CLI `register-gui`

SHA256 **0.4.12:** `cef14c46ebef58ec1296cfab6f88f5a5d6a9099ae6cbc49c2de882d3f71ed78a` (63 692 bytes)

Doc completo: [`138-CORRECAO-MENU-GUI-RACE-0.4.12-2026-07-03.md`](138-CORRECAO-MENU-GUI-RACE-0.4.12-2026-07-03.md)

---

## Sintoma

- **ADML** (pfSense interno): **Services → SystemUp Monitor** visível.
- **HILE** (`fw-r0f5nver`): agente **online**, versão **0.4.10**, pfSense **2.8.1-RELEASE**, heartbeat OK — mas **SystemUp Monitor** ausente no menu **Services** (screenshot 2026-07-03).

---

## Comparação ADML vs HILE (controlador)

| Item | ADML (referência) | HILE (`fw-r0f5nver`) |
|------|-------------------|----------------------|
| Cadastro no painel | Não monitorado (firewall interno) | Cliente **HILE**, site Principal |
| Status agente | — | **online** |
| `agent_version` | — | **0.4.10** |
| `pfsense_version` | — | **2.8.1-RELEASE** (igual a dezenas de nodes com menu OK) |
| Menu GUI | Presente | **Ausente** |
| Instalação | Provável install interativo / histórico OK | Bootstrap **nohup** via `install-from-release.sh` (2026-07-03) |
| `node_commands` package_upgrade | — | Nenhum (install manual, não upgrade remoto) |

**Conclusão:** não é drift de versão pfSense/PHP. É **instalação parcial**: arquivos + runtime OK, registro GUI no `config.xml` falhou ou não foi persistido.

---

## Causa raiz

1. Bootstrap HILE rodou em **background** (`nohup … >>/tmp/monitor-install.log`). O `install.sh` chama `install_package_xml` + `seed` via PHP; falhas nessa fase não impedem `sysrc`/serviço quando os arquivos tarball já foram extraídos.
2. O comando de reparo anterior (`php -r '… install_package_xml …'`) **não chamava `write_config`** via `systemup_monitor_persist_package_config()` — insuficiente em alguns casos.
3. Release **0.4.10** publicada **não continha** correções já presentes no source:
   - `ensure_package_gui_registration()` no `install.sh`
   - subcomando CLI `register-gui`
   - script `repair-gui-registration.sh`

---

## Correções aplicadas (controlador / repositório)

| Item | Descrição |
|------|-----------|
| `install.sh` | Retry idempotente de registro GUI (`ensure_package_gui_registration`) — já no source, agora no tarball |
| `systemup_monitor_cli.php` | Subcomando `register-gui` |
| `bootstrap/repair-gui-registration.sh` | Script de diagnóstico + reparo para colar no pfSense |
| Release **0.4.11** | Artefato regerado; SHA256 `c22edadd6f2ce53af3022e58655e7a1b95652b71ac6819770fd6f53502ae4aca` |
| API | `.env.api` + `config/package-release.env` alinhados; container API reconstruído |

---

## Reparo imediato — HILE (copiar/colar no shell do pfSense)

### Passo 1 — diagnóstico

```sh
echo "=== arquivos ==="
for f in /usr/local/pkg/systemup_monitor.xml /usr/local/pkg/systemup_monitor.inc \
  /usr/local/share/pfSense-pkg-systemup-monitor/info.xml \
  /usr/local/www/config_systemup_monitor.php; do
  test -f "$f" && echo "OK $f" || echo "MISSING $f"
done

echo "=== contagens config.xml ==="
/usr/local/bin/php -r '
require_once("/etc/inc/config.inc");
$c=function($items,$f,$e){$t=0;if(!is_array($items))return 0;foreach($items as $i){if(is_array($i)&&($i[$f]??"")===$e)$t++;}return $t;};
echo "package=".$c($config["installedpackages"]["package"]??[],"name","systemup-monitor")."\n";
echo "menu=".$c($config["installedpackages"]["menu"]??[],"name","SystemUp Monitor")."\n";
echo "service=".$c($config["installedpackages"]["service"]??[],"name","monitor_pfsense_agent")."\n";
'

echo "=== servico ==="
service monitor_pfsense_agent onestatus 2>&1 || true
tail -20 /tmp/monitor-install.log 2>/dev/null || echo "(sem monitor-install.log)"
```

Esperado antes do reparo: arquivos **OK**, `menu=0` ou `package=0`, serviço **running**.

### Passo 2 — reparo GUI (obrigatório)

```sh
/usr/local/bin/php -d opcache.enable_cli=0 -r '
require_once("/etc/inc/config.inc");
require_once("/etc/inc/globals.inc");
require_once("/etc/inc/pkg-utils.inc");
require_once("/usr/local/pkg/systemup_monitor.inc");
install_package_xml("systemup-monitor");
systemup_monitor_register_service();
systemup_monitor_persist_package_config("SystemUp Monitor GUI registration repair");
'
```

### Passo 3 — verificar e recarregar GUI

```sh
/usr/local/bin/php -r '
require_once("/etc/inc/config.inc");
$c=function($items,$f,$e){$t=0;if(!is_array($items))return 0;foreach($items as $i){if(is_array($i)&&($i[$f]??"")===$e)$t++;}return $t;};
echo "menu=".$c($config["installedpackages"]["menu"]??[],"name","SystemUp Monitor")."\n";
'
```

Se `menu>=1`: recarregar navegador (**Ctrl+F5**) → **Services → SystemUp Monitor**.

### Passo 4 (opcional) — upgrade para 0.4.11

Após menu OK, upgrade via painel ou:

```sh
/usr/local/bin/php -d opcache.enable_cli=0 -f /usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php upgrade
```

---

## Incidente SHA256 (contexto HILE)

Durante o incidente do doc **136**, firewalls na faixa **0.2.26–0.2.27** (incl. HILE) ficaram offline por falha de rede/agente. HILE foi reinstalado hoje com artefato **0.4.10** (SHA256 corrigido `980d01e5…`). O problema atual **não** é mismatch SHA256 — é registro GUI não persistido no bootstrap background.

---

## Verificação pós-release 0.4.11

```bash
curl -s https://pfs-monitor.systemup.inf.br/api/v1/agent/package-release | jq '{version,sha256}'
# version: 0.4.11
# sha256: c22edadd6f2ce53af3022e58655e7a1b95652b71ac6819770fd6f53502ae4aca
```
