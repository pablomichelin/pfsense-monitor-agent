# 134 — Checklist: enablement e homologação pós-plano 117

**Data:** 2026-07-02  
**Escopo:** homologação operacional das 13 fases do plano 117 — código já entregue, flags **off** por default  
**Referências:** `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md`, `apps/api/src/config/app-config.ts`, `apps/api/src/auth/permission-keys.ts`, `scripts/run-smoke-suite.sh`

> **Nota:** este checklist não substitui rollback por feature flag (§25 do plano 117). Use flags para ligar/desligar comportamento; use checkpoint de banco/tag git apenas se dados ou schema forem afetados.

---

## P0 — Pré-requisitos (antes de ligar qualquer flag)

| # | Item | Como validar | Go | No-go |
|---|------|--------------|----|-------|
| P0.1 | Frota alinhada ao package **0.4.10** | Coluna **Pacote** em `/nodes` vs `config/package-release.env`; upgrade remoto ou manual conforme `docs/114-UPGRADE-REMOTO-PACKAGE.md` | ≥ 95% dos firewalls ativos em `0.4.10` | Drift relevante sem plano de rollout |
| P0.2 | Versões do controlador | `apps/api/package.json` → `0.7.0`; `apps/web/package.json` → `1.5.1` | Builds API/web verdes | Versão divergente do doc 130 |
| P0.3 | Smoke suite baseline | `BASE_URL=http://127.0.0.1:8088 ./scripts/run-smoke-suite.sh` | Suite 100% verde | Qualquer smoke vermelho sem causa conhecida |
| P0.4 | Smoke plano 117 (flags off) | `./scripts/smoke-plan117-flags-off.sh` | Passos 1–6 OK (`enabled: false` / 403 onde esperado) | Resposta inesperada com flags default |
| P0.5 | Checkpoints §25 revisados | Ler §25 do plano 117; confirmar tags/dumps externos existentes para fases críticas (7–11) | Procedimento de retorno documentado e testado em lab | Restore de banco nunca ensaiado |
| P0.6 | Staging isolado | Ambiente com `.env.api` separado; firewalls **lab** identificados (`criticidade=lab`) | Staging não compartilha credenciais de produção | Homologação direto em produção |

---

## P1 — Ordem de habilitação em staging

Habilitar **uma flag por vez**. Após cada etapa: smoke específico + critério go/no-go + 24–48 h de observação antes da próxima.

Ordem recomendada:

1. `METRIC_ROLLUPS_ENABLED`
2. `BACKUP_DIFF_ENABLED` + `BACKUP_DRIFT_ENABLED`
3. `NOTIFICATIONS_ENABLED`
4. Vault / capacidades (read-only)
5. pfREST read-only
6. Ações operacionais (lab)
7. pfREST apply (piloto)

Rollback imediato de qualquer etapa: reverter env para `false`, reiniciar container `api`, confirmar smoke flags-off.

---

## Detalhamento por flag

Fonte de defaults: `apps/api/src/config/app-config.ts`.

### 1. Rollups de métricas (Fase 6)

| Campo | Valor |
|-------|-------|
| **Env** | `METRIC_ROLLUPS_ENABLED=true` |
| **Env auxiliar** | `METRIC_SAMPLE_INTERVAL_SECONDS`, retenções (ver doc 124) |
| **min_agent_version** | N/A (somente controlador) |
| **RBAC** | `firewalls.view` — `GET /api/v1/nodes/:id/metrics/history` |
| **Smoke criar/executar** | `./scripts/smoke-plan117-flags-off.sh` (off); com flag on: `GET .../metrics/history?period=24h` → `enabled: true` após ≥1 ciclo de amostragem |
| **Go** | Pontos aparecem em 24h; jobs sem erro em logs; snapshot operacional intacto | 
| **No-go** | Crescimento anormal de tabelas `node_metric_*`; latência API; UI quebrada na aba Métricas |

**Doc entrega:** `docs/124-ENTREGA-OBSERVABILIDADE-HISTORICA-2026-07-02.md`

---

### 2. Backup avançado — diff e drift (Fase 5)

| Campo | Valor |
|-------|-------|
| **Env** | `BACKUP_DIFF_ENABLED=true`, `BACKUP_DRIFT_ENABLED=true` |
| **min_agent_version** | N/A (usa backups já ingeridos) |
| **RBAC** | `backups.view`, `backups.download`, `backups.manage` |
| **Smoke criar/executar** | `./scripts/smoke-config-backup-api.sh` (baseline backup); com flags on: diff/drift no detalhe do backup |
| **Go** | Diff mascarado fail-closed; drift por seções sensíveis; export-guide sem restore automático |
| **No-go** | Segredo exposto em diff; drift falso positivo em massa |

**Doc entrega:** `docs/123-ENTREGA-BACKUP-AVANCADO-2026-07-02.md`

---

### 3. Notificações externas (Fase 1)

| Campo | Valor |
|-------|-------|
| **Env** | `NOTIFICATIONS_ENABLED=true` |
| **Env auxiliar** | `NOTIFICATIONS_MAX_ATTEMPTS`, `NOTIFICATIONS_RETRY_DELAY_MS` |
| **min_agent_version** | N/A |
| **RBAC** | `notifications.view`, `notifications.manage`, `notifications.test` |
| **Smoke criar/executar** | `./scripts/smoke-plan117-flags-off.sh` → `GET /api/v1/notifications/status` com `enabled: false`; com flag on: status `enabled: true` + canal teste em `/admin/notificacoes` |
| **Go** | Entrega de teste OK; alertas internos intactos; dispatcher idempotente |
| **No-go** | Spam; credenciais SMTP/Telegram em log; loop de retry |

**Doc entrega:** `docs/119-ENTREGA-NOTIFICACOES-EXTERNAS-2026-07-02.md`

---

### 4. Vault e capacidades pfREST — read-only (Fase 10)

| Campo | Valor |
|-------|-------|
| **Env (controlador)** | `NODE_CAPABILITIES_ENABLED=true`, `PFSENSE_VAULT_ENABLED=true` |
| **Env (agente lab)** | `MONITOR_AGENT_CAPABILITIES_ENABLED=1` no `.conf` do firewall |
| **min_agent_version** | `NODE_CAPABILITIES_MIN_AGENT_VERSION` → **0.4.9** (package **0.4.10** recomendado) |
| **RBAC** | `pfsense.api.view`, `pfsense.credentials.manage` |
| **Smoke criar/executar** | `GET /api/v1/node-capabilities/status`; heartbeat lab envia `capabilities{}`; teste read-only `POST .../credentials/pfrest/test` em firewall com pacote `pfSense-restapi` |
| **Go** | Inventário correto; credencial cifrada; teste read-only OK; segredo nunca na UI |
| **No-go** | Escrita no pfSense; segredo em resposta JSON ou audit payload |

**Doc entrega:** `docs/128-ENTREGA-VAULT-CAPACIDADES-PFSENSE-2026-07-02.md`

---

### 5. pfREST read-only e compare-backup (Fase 11A)

| Campo | Valor |
|-------|-------|
| **Env** | `PFSENSE_API_ENABLED=true`, `PFSENSE_ALIAS_READ_ENABLED=true` |
| **Pré-requisito** | Etapa 4 concluída; credencial pfREST cadastrada no vault |
| **min_agent_version** | Package **0.4.9+** com capacidades; **0.4.10** em produção |
| **RBAC** | `pfsense.api.view`, `pfsense.alias.view` |
| **Smoke criar/executar** | `GET /api/v1/nodes/:id/pfsense-api/status`; `GET .../aliases`; `GET .../aliases/compare-backup` em node lab |
| **Go** | Lista aliases via pfREST; compare-backup coerente com último `config.xml` |
| **No-go** | TLS/CA não resolvido; timeout massivo; 403 inesperado com RBAC correto |

**Doc entrega:** `docs/129-ENTREGA-PFREST-READONLY-ALIASES-2026-07-02.md`

---

### 6. Ações operacionais allowlistadas — lab (Fase 8)

| Campo | Valor |
|-------|-------|
| **Env (controlador)** | `OPERATIONAL_ACTIONS_ENABLED=true`, `SERVICE_RESTART_ENABLED=true` (reboot opcional: `NODE_REBOOT_ENABLED=true`) |
| **Env (agente lab)** | `MONITOR_AGENT_OPERATIONAL_ACTIONS_ENABLED=1`, `MONITOR_AGENT_SERVICE_RESTART_ENABLED=1` |
| **min_agent_version** | `OPERATIONAL_ACTIONS_MIN_AGENT_VERSION` → **0.4.8** (usar **0.4.10**) |
| **RBAC** | `service.restart.run`, `node.reboot.run`, `backups.run` (backup em lote) |
| **Smoke criar/executar** | `GET .../operational-actions/status`; restart de serviço allowlist (`unbound`) em firewall **lab**; opcional `./scripts/smoke-config-backup-request-now.sh` |
| **Go** | Comando allowlistado executa; auditoria em `audit_logs`; sem shell livre |
| **No-go** | Restart fora da allowlist; reboot sem confirmação HA; impacto fora do lab |

**Doc entrega:** `docs/126-ENTREGA-ACOES-OPERACIONAIS-2026-07-02.md`

---

### 7. pfREST apply — piloto (Fase 11B)

| Campo | Valor |
|-------|-------|
| **Env** | `PFSENSE_ALIAS_APPLY_ENABLED=true` (requer `PFSENSE_API_ENABLED=true`) |
| **Env auxiliar** | `PFSENSE_ALIAS_REQUIRE_BACKUP_HOURS=24` |
| **min_agent_version** | Mesmo da etapa 5 |
| **RBAC** | `pfsense.alias.manage` (preview), `pfsense.alias.apply` (**superadmin** default) |
| **Smoke criar/executar** | `POST .../aliases/preview` + `POST .../aliases/apply` com `confirm_name` em alias de teste lab; backup recente obrigatório |
| **Go** | Preview/apply auditados; rollback assistido documentado; apenas firewalls piloto |
| **No-go** | Apply sem backup recente; apply em produção sem piloto read-only estável |

**Doc entrega:** `docs/129-ENTREGA-PFREST-READONLY-ALIASES-2026-07-02.md`

---

## Flags complementares (fora da ordem P1, habilitar sob demanda)

| Flag | Default | min_agent | RBAC principal | Doc |
|------|---------|-----------|----------------|-----|
| `CERTIFICATES_ENABLED` | `false` | **0.4.9** (`CERTIFICATES_MIN_AGENT_VERSION`) | ingest + alertas | 127 |
| `COMMAND_WORKER_ENABLED` | `false` | N/A | comandos/jobs (Fase 7) | 125 |
| `PACKAGE_UPGRADE_ENABLED` | `true` | **0.4.6** | `package.upgrade.run` | 114 |
| `PFSENSE_UPGRADE_ENABLED` | `false` | **0.3.1** | `pfsense.upgrade.run` | 91 |

Agente (package): variáveis `MONITOR_AGENT_*` espelham flags do controlador — ver entregas 126–128 e `docs/pfsense-package/00-GUIA-OPERACAO-PACKAGE.md`.

---

## Registro de homologação (preencher por etapa)

| Etapa | Data | Ambiente | Responsável | Smoke | Resultado | Rollback necessário? |
|-------|------|----------|-------------|-------|-----------|----------------------|
| P0 baseline | | | | `run-smoke-suite.sh` | | |
| 1 Rollups | | staging | | | | |
| 2 Backup diff/drift | | staging | | | | |
| 3 Notificações | | staging | | | | |
| 4 Vault/capabilities | | lab | | | | |
| 5 pfREST read-only | | lab | | | | |
| 6 Ações operacionais | | lab | | | | |
| 7 pfREST apply | | piloto | | | | |

---

## Referências rápidas

| Artefato | Caminho |
|----------|---------|
| Defaults de flags | `apps/api/src/config/app-config.ts` |
| Chaves RBAC | `apps/api/src/auth/permission-keys.ts` |
| Suite de smokes | `scripts/run-smoke-suite.sh` |
| Smoke flags off (plano 117) | `scripts/smoke-plan117-flags-off.sh` |
| Exemplo env | `.env.api.example` |
| Release package | `config/package-release.env` |
| Checkpoints §25 | `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md` §25 |
| Trilha pfREST pos-117 | `docs/125-PLANO-PFREST-GERENCIAMENTO-CENTRALIZADO-2026-07-02.md` |
