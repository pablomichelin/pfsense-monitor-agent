# 125 — Entrega: Fundação de jobs/comandos

**Data:** 2026-07-02  
**Fase do plano 117:** Fase 7 — Fundação de jobs/comandos  
**Componentes alterados:** API, web, docs (sem alteração de package/agente pfSense)  
**Versões antes:** API `0.6.6` · web `1.4.7` · package `0.4.7`  
**Versões depois:** API `0.6.7` · web `1.4.8` · package `0.4.7` (sem bump)

**Referências:** `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md` §14

---

## Escopo entregue

### Modelo de dados (migration aditiva)

Migration `20260702170000_command_jobs_foundation`:

| Tabela / coluna | Papel |
|-----------------|-------|
| `job_batches` | Agrupa comandos em lote (tipo, contadores, status) |
| `node_commands.batch_id` | Vínculo comando ↔ lote |
| `node_commands.idempotency_key` | Idempotência por `(node, type, key)` enquanto ativo |
| `node_commands.retry_count` / `max_retries` / `next_retry_at` | Retry/backoff e fila por concorrência |
| `node_commands.cancelled_at` / `cancelled_by_user_id` | Cancelamento explícito |

Enum novo: `job_batch_status` (`pending`, `running`, `completed`, `cancelled`, `failed`).

### Contrato único (allowlist)

Registry central em `apps/api/src/commands/command-registry.ts`:

| Tipo | Permissão | Expiração | Retries default |
|------|-----------|-----------|-----------------|
| `config_backup_now` | `backups.run` | env backup | 2 |
| `pfsense_upgrade` | `pfsense.upgrade.run` | env pfsense | 1 |
| `package_upgrade` | `package.upgrade.run` | env package | 1 |

Validação forte de payload por tipo; **nenhum comando arbitrário**.

### Feature flag e env

| Variável | Default | Descrição |
|----------|---------|-----------|
| `COMMAND_WORKER_ENABLED` | `false` | Liga worker NestJS (retry, concorrência global, reconciliação de lotes) |
| `COMMAND_WORKER_INTERVAL_SECONDS` | `30` | Ciclo do worker |
| `COMMAND_WORKER_LOCK_TTL_SECONDS` | `120` | TTL do lock `system_job_locks` |
| `COMMAND_HISTORY_DEFAULT_LIMIT` | `25` | Limite padrão do histórico |
| `*_COMMAND_MAX_RETRIES` | ver `.env.api.example` | Retries por tipo |

Com `COMMAND_WORKER_ENABLED=false`, o comportamento legado permanece: expiração via `NodeCommandsService`, heartbeat/polling inalterados.

### Backend

Módulo `CommandsModule`:

- `CommandOrchestratorService` — enqueue idempotente, histórico, cancelamento, lotes, registry summary
- `CommandWorkerService` — lock no banco (`SystemJobLockService` movido para `common/`), retry, defer por concorrência global, reconciliação de lotes
- `NodeCommandsService` — filtra `next_retry_at` no heartbeat; reconcilia contadores de lote ao terminalizar

**Endpoints novos:**

| Método | Rota | Permissão |
|--------|------|-----------|
| `GET` | `/api/v1/nodes/:nodeId/commands/history` | `firewalls.view` + escopo node |
| `GET` | `/api/v1/nodes/:nodeId/commands/:commandId` | `firewalls.view` |
| `POST` | `/api/v1/nodes/:nodeId/commands/:commandId/cancel` | permissão do tipo (`backups.run`, etc.) |
| `POST` | `/api/v1/command-batches` | permissão do tipo |
| `GET` | `/api/v1/command-batches/:batchId` | `firewalls.view` + escopo por node |
| `GET` | `/api/v1/command-batches/registry` | `firewalls.view` |

### Painel web

Aba **Visão geral** do detalhe do firewall:

- `NodeCommandHistoryPanel` — histórico compacto com cancelamento quando permitido
- `NodeCommandProgress` — badge/progresso padronizado (fases `queued` → `terminal`)
- Polling automático enquanto houver comando ativo

### Testes unitários

- `apps/api/test/command-registry.util.test.mjs` — backoff, concorrência, retry, limite de histórico

### Compatibilidade

Comandos existentes **inalterados** nos fluxos atuais:

- `config_backup_now` via `BackupsCommandService`
- `pfsense_upgrade` via `PfsenseUpgradeService`
- `package_upgrade` via `PackageUpgradeService`

Heartbeat continua polling-only; agente desconhecido continua fail-safe no package.

---

## Rollback

1. `COMMAND_WORKER_ENABLED=false` — desliga retry/defer/reconciliação periódica de lotes
2. UI de histórico permanece read-only útil mesmo com worker off
3. Migration aditiva — colunas/tabelas novas podem ficar vazias

---

## Homologação sugerida

1. `docker compose exec -T api npx prisma migrate deploy`
2. `docker compose build api web && docker compose up -d api web`
3. Detalhe de firewall → Visão geral → seção **Comandos remotos**
4. Solicitar backup; verificar histórico e progresso
5. (Opcional) `COMMAND_WORKER_ENABLED=true` + lote `POST /api/v1/command-batches` com `config_backup_now`

---

## Próximo passo

**Fase 8** — Ações operacionais allowlistadas (`service_restart`, `node_reboot`, backup em lote via batch).
