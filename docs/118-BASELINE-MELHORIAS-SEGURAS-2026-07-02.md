# 118 — Baseline: melhorias seguras (Fase 0)

**Data:** 2026-07-02  
**Fase do plano 117:** Fase 0 — Baseline e harness de segurança  
**Escopo:** documentação operacional + validações; sem mudança de runtime obrigatória  
**Plano mestre:** `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md`

---

## 1. Objetivo

Registrar o estado real do stack antes da trilha de melhorias seguras, consolidar gates por fase e padronizar handoff para chats futuros.

---

## 2. Versões atuais (baseline)

| Componente | Versão | Fonte |
|------------|--------|-------|
| API | `0.6.4` | `apps/api/package.json` |
| Painel web | `1.4.5` | `apps/web/package.json` |
| Package pfSense | `0.4.7` | `packages/pfsense-package/Makefile` + `config/package-release.env` |
| Agente (package) | `0.4.7` | `SYSTEMUP_MONITOR_AGENT_VERSION` em `systemup_monitor.inc` |
| Prisma | `^6.15.0` (CLI local `6.19.2`) | `apps/api/package.json` |
| Node (host) | `v22.22.3` | `node -v` |
| npm (host) | `10.9.8` | `npm -v` |
| PostgreSQL (compose) | `17` | `compose.yaml` (`postgres:17`) |

**Release package:** `config/package-release.env` → `PACKAGE_RELEASE_VERSION=0.4.7`

---

## 3. Estado git (preservado — snapshot 2026-07-02)

Comando: `git status --short` em `/Dados/Monitor-Pfsense`

**Resumo:** working tree com mudanças extensas pré-existentes (docs 114–117, package 0.4.7, coluna Pacote, upgrade remoto, etc.) + entregas desta sessão (Fase 0 doc + início Fase 1 notificações). Nenhum reset/revert aplicado.

**Categorias observadas:**

- Modificados: entrypoints (`LEITURA-INICIAL.md`, `CORTEX.md`, `00-INDICE`), API/web/package, docs operacionais
- Não rastreados: migrations recentes, docs 104–117, scripts de repro/smoke auxiliares, `data/`

**Regra:** preservar mudanças existentes; não commitar sem pedido explícito.

---

## 4. Stack runtime (compose)

| Serviço | Status (2026-07-02) |
|---------|---------------------|
| `api` | healthy |
| `web` | healthy |
| `db` | healthy |
| `nginx` | healthy (`8088`, LAN `192.168.100.221:3031`) |

**Nota:** imagem Docker da API embute código/migrations do build. Migration `20260702120000_notification_channels` aplicada manualmente no PostgreSQL via SQL (tabelas + permissões RBAC) até rebuild/redeploy da API.

---

## 5. Scripts smoke disponíveis

Agregador principal: `scripts/run-smoke-suite.sh`

```bash
cd /Dados/Monitor-Pfsense
BASE_URL=http://127.0.0.1:8088 ./scripts/run-smoke-suite.sh
```

**Suite padrão (14 scripts):**

| Script | Área |
|--------|------|
| `smoke-frontend-assets.sh` | Login + assets Next |
| `smoke-agent-release.sh` | Release/instalação package em INSTALL_ROOT temp |
| `smoke-realtime-refresh.sh` | SSE + heartbeat + dashboard |
| `smoke-auth-sessions.sh` | Sessões humanas |
| `smoke-mfa.sh` | MFA TOTP |
| `smoke-bootstrap-flow.sh` | Bootstrap / nodes |
| `smoke-admin-operations.sh` | CRUD admin |
| `smoke-rbac-roles.sh` | Papéis operator/readonly |
| `smoke-rbac-node-detail.sh` | Detalhe node + escopo |
| `smoke-rbac-client-scope.sh` | Escopo por cliente |
| `smoke-rbac-permissions.sh` | Matriz permissões |
| `smoke-rbac-client-profile.sh` | Perfil client |
| `smoke-rbac-admin-ux.sh` | UX admin |
| `smoke-rbac-audit-hardening.sh` | Auditoria |

**Smokes adicionais (backup/package — rodar sob demanda):**

- `smoke-config-backup-*.sh`, `smoke-pfsense-upgrade-command.sh`, `test-package-upgrade-dispatch.sh`

**Contrato externo (quando alterar ISPConfig/Cloudflare):**

```bash
BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/verify-origin-contract.sh
```

---

## 6. Validações executadas (Fase 0)

| Validação | Comando | Resultado | Observação |
|-----------|---------|-----------|------------|
| Git status | `git status --short` | OK | Ver secao 3 |
| Build API | `cd apps/api && npm run build` | **OK** | Apos Fase 1 parcial |
| Build web | `cd apps/web && npm run build` | **OK** | Rota `/admin/notificacoes` incluida |
| Smoke suite | `./scripts/run-smoke-suite.sh` | **Parcial** | `smoke-frontend-assets.sh` OK; falha em `smoke-agent-release.sh` passo [8/9] — `monitor-pfsense-agent.sh: Syntax error: redirection unexpected` (shell `sh` vs bash em INSTALL_ROOT temp) |
| Teste unitario Fase 1 | `node --test apps/api/test/notification-rule-matcher.test.mjs` | **OK** | 3/3 apos build API |

---

## 7. Checklist de gates por fase (referencia plano 117)

Cada fase so pode ser **Concluida** quando cumprir:

| Gate | Obrigatorio |
|------|-------------|
| Contrato | Doc declara impacto em API/dados/UI/agente/operacao |
| Banco | Migration aditiva + reversibilidade documentada |
| RBAC | Permissoes novas registradas e refletidas no painel |
| Auditoria | Acoes sensiveis em `audit_logs` |
| Feature flag | Recursos arriscados desligaveis por env |
| Testes | Build + smokes coerentes com area alterada |
| Handoff | Doc de entrega + atualizar trilha (`117`, `LEITURA-INICIAL` se estado operacional mudar) |
| Rollback | Como desabilitar sem quebrar heartbeats |

**Checkpoint complementar (secao 25 do plano 117):**

- Tag git `fase-N-baseline` antes de codigo
- Dump PostgreSQL rotulado antes de migration
- Versoes antes/depois no doc de entrega

---

## 8. Template de handoff para fases futuras

```markdown
# XXX — Entrega: <nome>

**Data:** YYYY-MM-DD
**Fase do plano 117:** Fase N — <nome>
**Versoes antes:** API X · web Y · package Z
**Versoes depois:** API X · web Y · package Z

## Escopo entregue
## O que nao foi entregue
## Impacto (API, dados, UI, agente)
## RBAC e auditoria
## Feature flags e rollback
## Testes executados
## Bloqueios / riscos
## Proximo passo
```

**Ao iniciar fase N+1:**

1. Ler ordem obrigatoria do plano 117
2. `git status --short` — preservar pendencias
3. Capturar versoes (`package-release.env`, `apps/*/package.json`)
4. Dump DB antes de migration (`scripts/backup-postgres.sh`)
5. Marcar fase como `Em execucao` na tabela do plano 117
6. Ao encerrar: doc `docs/XXX-ENTREGA-...md`, atualizar plano 117, builds/smokes

---

## 9. Resultado Fase 0

| Criterio | Status |
|----------|--------|
| Baseline registrado | **Concluido** (este documento) |
| Plano 117 atualizado | **Concluido** |
| Builds API/web | **OK** |
| Smoke suite completa | **Bloqueio parcial** (agent-release em ambiente local) |
| Proxima fase escolhida | **Fase 1 — Notificacoes externas** (iniciada na mesma sessao) |

---

## 10. Handoff para Fase 1 (estado ao fechar Fase 0)

**Iniciado na mesma sessao:**

- Models Prisma: `notification_channels`, `notification_rules`, `notification_deliveries`
- Migration: `20260702120000_notification_channels` (aplicada no DB)
- API: modulo `notifications` com dispatcher, providers (webhook/telegram/email), RBAC, auditoria
- Feature flag: `NOTIFICATIONS_ENABLED=false` (default)
- Permissoes: `notifications.view`, `notifications.manage`, `notifications.test`
- Painel: `/admin/notificacoes` (listagem + teste de canal; formularios CRUD pendentes)
- Hook dispatcher: `ingest.service` + `node-lifecycle.service`

**Pendente Fase 1:**

- UI de create/update/delete canais e regras (formularios)
- Rebuild/redeploy container API para runtime em producao
- Smoke dedicado ou extensao da suite
- Doc de entrega `119-ENTREGA-NOTIFICACOES-EXTERNAS-...md`
- Validar SMTP real e Telegram em ambiente com credenciais
- Historico de entregas por alerta no detalhe do firewall

**Rollback Fase 1:** `NOTIFICATIONS_ENABLED=false` — alertas internos intactos.

---

*Baseline executado em 2026-07-02. Smoke agent-release permanece item de acompanhamento independente da trilha 117.*
