# 126 — Entrega: Ações operacionais allowlistadas

**Data:** 2026-07-02  
**Fase do plano 117:** Fase 8 — Ações operacionais allowlistadas  
**Componentes alterados:** API, web, package/agent, docs  
**Versões antes:** API `0.6.7` · web `1.4.8` · package `0.4.7`  
**Versões depois:** API `0.6.8` · web `1.4.9` · package `0.4.8` (código; release publicada permanece `0.4.7` até `release-pfsense-package.sh`)

**Referências:** `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md` §15 · `docs/125-ENTREGA-FUNDACAO-JOBS-COMANDOS-2026-07-02.md`

---

## Escopo entregue

### Novos `NodeCommandType`

| Tipo | Permissão | Payload validado |
|------|-----------|------------------|
| `service_restart` | `service.restart.run` | `{ service }` — allowlist |
| `node_reboot` | `node.reboot.run` | `{ delay_seconds, enable_maintenance_mode, acknowledge_ha_risk }` |

`config_backup_now` em lote reutiliza `POST /api/v1/operational-actions/backup-batch` → `job_batches` (Fase 7).

### Allowlist de serviços (API + agente)

`monitor_pfsense_agent`, `unbound`, `dhcpd`, `ntpd`, `dpinger`

Sem campo shell/args livre. Comando desconhecido no agente → `failed` seguro.

### Feature flags (default seguro)

| Variável | Default |
|----------|---------|
| `OPERATIONAL_ACTIONS_ENABLED` | `false` |
| `SERVICE_RESTART_ENABLED` | `false` |
| `NODE_REBOOT_ENABLED` | `false` |

Agente: `MONITOR_AGENT_OPERATIONAL_ACTIONS_ENABLED`, `MONITOR_AGENT_SERVICE_RESTART_ENABLED`, `MONITOR_AGENT_NODE_REBOOT_ENABLED` (default `0`).

### API

Migration `20260702180000_operational_actions` — enum + permissões RBAC.

Módulo `OperationalActionsModule`:

| Método | Rota | Permissão |
|--------|------|-----------|
| `GET` | `/api/v1/nodes/:id/operational-actions/status` | `firewalls.view` |
| `POST` | `/api/v1/nodes/:id/operational-actions/service-restart` | `service.restart.run` |
| `POST` | `/api/v1/nodes/:id/operational-actions/reboot` | `node.reboot.run` |
| `POST` | `/api/v1/operational-actions/backup-batch` | `backups.run` |

**Reboot:** exige `confirm_hostname` (= hostname ou `CONFIRMAR`), maintenance mode ativo ou `enable_maintenance_mode`, e `acknowledge_ha_risk` em nós HA/CARP.

Registry central atualizado em `command-registry.ts` · `min_agent_version` **`0.4.8`**.

### Package / agente (`0.4.8`)

- Handlers `service_restart` e `node_reboot` em `monitor-pfsense-agent.sh`
- Allowlist defensiva no agente
- Lock operacional + logs em `/var/log/monitor-pfsense-agent-operational.log`
- Wrapper `run_node_reboot.sh` (resultado antes do reboot)
- Comando desconhecido → `unknown command type`

### Painel web

- Aba **Visão geral** do firewall: seção **Ações operacionais** (`NodeOperationalActionsSection`) com confirmação forte para reboot
- Inventário `/nodes`: **Backup em lote** para filtro atual (`FleetBatchBackupPanel`)
- Histórico/cancelamento estendidos para novos tipos

### Testes

- `apps/api/test/operational-actions.util.test.mjs` — allowlist, maintenance gate, HA gate, confirmação hostname

---

## Rollback

1. `OPERATIONAL_ACTIONS_ENABLED=false` (e sub-flags) — API recusa enqueue
2. Agente com flags `0` — recusa execução local
3. UI oculta seções quando `enabled=false`
4. Migration aditiva — tipos novos inativos sem flags

---

## Homologação sugerida

1. `docker compose exec -T api npx prisma migrate deploy`
2. Habilitar flags em staging: `OPERATIONAL_ACTIONS_ENABLED=true`, `SERVICE_RESTART_ENABLED=true`
3. Package **0.4.8** no lab + `MONITOR_AGENT_*_ENABLED=1` no `.conf`
4. Detalhe firewall → reiniciar `monitor_pfsense_agent`
5. Reboot em lab com maintenance + confirmação
6. Inventário → backup em lote (2+ nodes online)

---

## Próximo passo

**Fase 9** — Certificados e expiração (inventário metadados, alertas 30/15/7 dias, sem renovação automática).
