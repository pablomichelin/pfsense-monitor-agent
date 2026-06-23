# 91 — Entrega: upgrade remoto pfSense OS (por firewall)

**Data:** 2026-06-14  
**Versões:** API `0.3.1`, painel `1.1.0`, package pfSense `0.3.3`

## Objetivo

Permitir upgrade individual do **pfSense OS** por firewall, equivalente ao fluxo manual System → Update → Confirm, com detecção via agente, comando `pfsense_upgrade` na fila `NodeCommand`, supressão de alerta offline durante reboot e gate de backup recente.

## Escopo entregue

### API 0.3.1

- Migration `add_pfsense_upgrade_command_payload_running_at_and_update_cache`
- `NodeCommandsService` genérico (payload filtrado ao agente, `runningAt`, reconciliação tardia)
- Módulo `pfsense-upgrade`: GET status + POST request com transação Serializable
- Permissão `pfsense.upgrade.run` (superadmin + admin)
- Config `PFSENSE_UPGRADE_*` em `app-config.ts` e `.env.api.example`
- Feature flag `PFSENSE_UPGRADE_ENABLED=false` (default até homologação)

### Painel 1.1.0

- `NodePfsenseUpgradeSection` na aba Visão geral (`node-detail-overview-tab.tsx`)
- Modal com confirmação hostname/CONFIRMAR, maintenance default, override de backup
- Polling 12s com comando ativo
- Audit labels `pfsense.upgrade.*` e `node_command`

### Package 0.3.1

- Helper `check_pfsense_update_available.sh` com throttle `MONITOR_AGENT_PFSENSE_UPDATE_CHECK_INTERVAL_HOURS`
- Heartbeat envia cache `pfsense_update_*` + `ha_detected`
- Dispatcher de comandos (`config_backup_now` + `pfsense_upgrade`)
- CLI `upgrade-check` em `systemup_monitor_cli.php`
- **Execução real do upgrade (Fase 4.4): STUB** — aguarda spike CE

### Correção 0.3.1

- Helper reconhece a saída `Version X is available.` do `pfSense-upgrade -d -c`
- Saída desconhecida ou erro de checagem vira `available=null` com `pfsense_update_check_error`, não falso "atualizado"
- API persiste `pfsense_update_check_error` e o painel exibe falha de checagem
- Agente mínimo para upgrade remoto elevado para `0.3.1`

### Correção 0.3.3

- Parser reconhece saída CLI `X version of pfSense is available` (não só widget `Version X is available.`)
- Remove falso negativo em linhas intermediárias `repository is up to date` / `All repositories are up to date`

### Correção 0.3.2

- Cache `pfsense-update-check.json` ganha `cache_version`; resultado antigo (sem versão) é invalidado no heartbeat e após `sync_config`
- `monitor-pfsense-agent.sh` força `force-check` quando cache é legado (ex.: `available=false` do parser 0.3.0)
- **Workaround imediato no piloto 0.3.1:** `php .../systemup_monitor_cli.php upgrade-check --force`

## Fase 0 — Spike CE (pendente)

| Item | Status |
|------|--------|
| Parse `pfSense-upgrade -d -c` | Helper implementado; validar em VM CE |
| Comando não assistido (Confirm) | **Não codificado** — stub retorna falha documentada |
| Log `/conf/upgrade_log.latest.txt` pós-reboot | `finalize_pfsense_upgrade_if_pending` preparado |
| Matriz CE vs Plus | Documentar após spike |

### Comportamento do stub (até spike)

O agente aceita comando `pfsense_upgrade`, envia ack `picked_up`/`running` e reporta `failed` com mensagem:

`pfSense OS upgrade execution pending CE lab spike validation`

## Rollout

1. Deploy com `PFSENSE_UPGRADE_ENABLED=true` (homologação ativa em `.env.api`)
2. Instalar package `0.3.3` no firewall piloto (comando bootstrap no painel)
3. Concluir spike CE e substituir stub em `dispatch_pfsense_upgrade`
4. Validar fluxo completo após spike

## Checklist teste (homologação)

1. **Firewall piloto:** instalar/atualizar package `0.3.2` via comando bootstrap na aba Configuração
2. **Agente:** após alguns heartbeats, verificar na visão geral se aparece status de update (`Versão não verificada` → `Atualizado` ou `Atualização disponível`)
3. **CLI no pfSense:** `php /usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php upgrade-check`
4. **Painel:** botão "Atualizar pfSense" (requer `pfsense.upgrade.run` + update disponível + agente ≥ 0.3.1)
5. **Execução:** até spike CE, comando falha com mensagem stub — comportamento esperado

Artefato local: `dist/pfsense-package/monitor-pfsense-package-v0.3.3.tar.gz`  
SHA256: `95488d39a45efaa64aec28ab3bde829917675d9135268ed4d2cb69f8e68321f7`  
**Push GitHub:** rodar `bash scripts/release-pfsense-package.sh` (sem `--no-push`) para firewalls baixarem do remote.

## Smoke

```bash
bash scripts/smoke-pfsense-upgrade-command.sh
```

## Referências

- Plano aprovado: `.cursor/plans/upgrade_pfsense_remoto_478c5fee.plan.md`
- Matriz RBAC: `23-matriz-permissoes-e-escopo-rbac-2026-06-09.md`
