# 140 — Correção reentrega de comandos + persist do menu (release 0.4.14)

**Data:** 2026-07-03  
**Status:** Corrigido no servidor (API rebuildada) e no package — release **0.4.14** publicada

---

## Problema 1 — "another package upgrade is running" (HILE em 0.4.13)

### Sintoma

HILE (`fw-r0f5nver`) chegou a **0.4.13** com sucesso, mas o painel exibia
`Última atualização falhou: another package upgrade is running`.

### Causa raiz (confirmada no DB)

Linha do tempo do comando `52367c45-183a-484b-9340-c194cf47c2c9`:

| Hora (UTC) | Evento |
|---|---|
| 20:27:57 | comando criado (`pending`) |
| 20:28:18 | agente deu ack `picked_up`/`running` e disparou `run_package_upgrade.sh` |
| ~20:28:2x | wrapper instala 0.4.13 e **reinicia o serviço do agente antes de postar o resultado** |
| 20:28:29 | agente recém-reiniciado envia heartbeat; a API **reentregou o mesmo comando** (`getPendingCommandsForNode` incluía status `running`); o dispatch viu o lock do wrapper original vivo e postou `failed: another package upgrade is running` |
| depois | o sucesso real do wrapper chegou, mas o comando já estava terminal (`failed`) e foi descartado |

Mesmo padrão no `wolff-software` em 02/07. **Não era lock stale**: `acquire_lock`
já verifica PID vivo e remove lock morto — nenhum host fica preso permanentemente.

### Correções

1. **Servidor (efeito imediato para toda a frota, qualquer versão de agente):**
   `apps/api/src/node-commands/node-commands.service.ts` — `getPendingCommandsForNode`
   não reentrega mais comandos em `running` (somente `pending`/`picked_up`).
   Comando `running` cujo agente morreu expira pelo job `expireStaleCommands` (60 min).
   API rebuildada e redeployada; verificado no container:
   `dist/node-commands/node-commands.service.js` linha 117 com `[pending, picked_up]`.
2. **Agente (0.4.14, defesa em profundidade):** `monitor-pfsense-agent.sh`
   `dispatch_package_upgrade` — se o `command_id` reentregue é o mesmo do
   `package-upgrade-pending.json` e o lock está ativo, ignora silenciosamente
   (o wrapper original posta o resultado).
3. **Agente (0.4.14):** `run_package_upgrade.sh` remove o state file
   (`package-upgrade-pending.json`) no cleanup — antes ficava para sempre.

### Reconciliação HILE (DB)

Comando `52367c45` marcado `succeeded` (upgrade de fato concluiu — nó reporta 0.4.13),
com `result_json.reconciled=true` e entrada em `audit_logs`
(`package.upgrade.reconciled_manual`). O banner vermelho do painel vem de
`last_result.status === 'failed'`; com a reconciliação passa a exibir o banner
verde de sucesso no próximo carregamento da página.

Orquestração de duplicados já era correta: `requestUpgrade` e
`enqueueCommandInTransaction` rejeitam novo `package_upgrade` enquanto houver
comando ativo do mesmo tipo no nó (transação serializable + `maxConcurrentPerNode=1`).

---

## Problema 2 — Menu GUI (Services → SystemUp Monitor)

### Bug remanescente no register-gui do 0.4.13

`systemup_monitor_persist_package_config()` faz `config_read_file()` (recarrega
`$config` do disco) **depois** de `systemup_monitor_register_menu()` ter adicionado
o menu em memória — e o snapshot importado não carrega entradas de menu. Resultado:
o reparo de menu era descartado antes do `write_config()` quando o
`install_package_xml` do pfSense não tivesse persistido o menu por conta própria.

**Fix (0.4.14):** `persist_package_config` re-injeta as entradas de menu ausentes
(`systemup_monitor_register_menu()`) **após** o `config_read_file()` e antes do
`write_config()`.

### Verificação/reparo imediato no HILE (0.4.13, sem SSH do controlador)

Bloco único para colar no shell do pfSense (root) — imprime contagem antes,
roda o `register-gui` do 0.4.13, aplica reparo direto e imprime contagem final:

```sh
/usr/local/bin/php -d opcache.enable_cli=0 -f /usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php register-gui < /dev/null; /usr/local/bin/php -d opcache.enable_cli=0 -r '
require_once("/etc/inc/config.inc"); require_once("/etc/inc/globals.inc");
$count=function() use (&$config){$t=0;foreach(($config["installedpackages"]["menu"]??array()) as $m){if(is_array($m)&&trim((string)($m["name"]??""))==="SystemUp Monitor")$t++;}return $t;};
echo "menu antes=".$count()."\n";
$defs=array(
 array("name"=>"SystemUp Monitor","section"=>"Services","configfile"=>"systemup_monitor.xml","tooltiptext"=>"Configure o agente leve do Monitor-Pfsense.","url"=>"/config_systemup_monitor.php"),
 array("name"=>"SystemUp Monitor","section"=>"Status","configfile"=>"systemup_monitor.xml","tooltiptext"=>"Diagnostico e status do agente Monitor-Pfsense.","url"=>"/status_systemup_monitor.php"));
if(!is_array($config["installedpackages"]["menu"]??null))$config["installedpackages"]["menu"]=array();
$changed=false;
foreach($defs as $menu){$found=false;foreach($config["installedpackages"]["menu"] as $m){if(is_array($m)&&trim((string)($m["name"]??""))===$menu["name"]&&(string)($m["section"]??"")===$menu["section"]){$found=true;break;}}if(!$found){$config["installedpackages"]["menu"][]=$menu;$changed=true;}}
if($changed){write_config("SystemUp Monitor menu repair (doc 140)");}
echo "menu depois=".$count()." (".($changed?"gravado agora":"ja estava registrado")."))\n";
'; rm -f /tmp/config.cache
```

Esperado: `menu depois=2`. Recarregar a GUI (Ctrl+F5) → Services → SystemUp Monitor.
Alternativa equivalente: atualizar HILE para **0.4.14** pelo painel (o installer
0.4.14 registra o menu com o persist corrigido) e conferir a GUI.

---

## Problema 3 — Lote de upgrade

### Validações

- **Web container:** imagem `monitor-pfsense-web` buildada 2026-07-03 20:24 UTC,
  posterior ao fix de seleção (20:22 UTC); chunk
  `.next/static/chunks/app/nodes/page-*.js` contém o código novo
  (`Selecionar todos os firewalls`).
- **Backend:** `POST /api/v1/package-upgrade/batch` usa exatamente `dto.node_ids`
  (dedup + `assertNodeAccess` por nó) e pré-validação pula inelegíveis:
  não encontrado, heartbeat >5 min, já na versão alvo, agente < 0.4.6.
- **Release 0.4.14:** SHA256 `81159173ce1b97ca6d0fadc0f454a3bbc68fee37fc2898f6f570addb8ecfeb07`
  (64 125 bytes) — idêntico em `config/package-release.env`, no disco, no
  `/api/v1/agent/package-release` e no download real do artifact.
  `smoke-agent-release.sh` OK (9/9).

### Frota (2026-07-03 21:30 UTC, alvo 0.4.14)

| Grupo | Qtde |
|---|---|
| Candidatos ao lote (heartbeat <5 min, ≥0.4.6, abaixo de 0.4.14) | **50** (48×0.4.10 + 2×0.4.13) |
| Elegíveis porém offline (0.4.10) | 3 — `pfSense.home.arpa` (fw-6ztgrb1v), `Fw.acrel.chapeco`, `pfsense.super.gentil` |
| Abaixo do mínimo 0.4.6 (reinstalação manual) | 4 — `wustro.fazenda.wustro`, `Fw.contacenterxxe.com.br`, `pfSense.recon.firewall`, `Firewall.ofizzi.interno` (0.2.2x) |

### Go/No-Go

**GO.** A causa da falha espúria (reentrega de `running`) está corrigida no
servidor — vale para os agentes 0.4.10 do lote, que têm o mesmo dispatch.
Recomendação: lote piloto de 3–5 nós, conferir `succeeded`, depois o restante.

---

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `apps/api/src/node-commands/node-commands.service.ts` | não reentrega comandos `running` |
| `packages/.../monitor-pfsense-agent.sh` | dedup de reentrega do mesmo `command_id` |
| `packages/.../run_package_upgrade.sh` | remove state file no cleanup |
| `packages/.../systemup_monitor.inc` | `persist_package_config` re-injeta menu após `config_read_file` |
| `packages/pfsense-package/Makefile` | `PORTVERSION=0.4.14` |
| `config/package-release.env` | versão/SHA 0.4.14 (via release script) |
| DB `node_commands` | `52367c45…` reconciliado `failed→succeeded` + audit log |
