# 111 — Entrega: correção falhas pós-auditoria (plano 110)

**Data:** 2026-06-24  
**Status:** ✅ Entregue  
**Plano:** [110-PLANO-CORRECAO-FALHAS-AUDITORIA-POS-109-2026-06-24.md](./110-PLANO-CORRECAO-FALHAS-AUDITORIA-POS-109-2026-06-24.md)

---

## Versões finais

| Componente | Versão |
|------------|--------|
| Package pfSense | **0.4.3** |
| API NestJS | **0.6.1** |
| Painel web | **1.4.2** |

---

## Resumo por item

### Package (P1–P9)

| ID | Implementação |
|----|---------------|
| **P1** | `systemup_monitor_current_user_is_admin()` restrito a `page-all`, uid 0 ou grupo `admins`; removidos privilégios de página; botão update oculto para não-admin |
| **P2** | Rate-limit 24h gravado **após** spawn OK; falha libera lock sem rate-limit |
| **P3** | `systemup_monitor_try_acquire_update_lock()` com `fopen(..., 'x')` atômico |
| **P4** | Stale lock só remove se processo morto e log sem atividade recente (5 min) |
| **P5** | Handler `package_update` removido de `setup_package_tabs()`; chamada explícita em `config_systemup_monitor.php` |
| **P6** | CSRF fail-closed quando `csrf_check` ausente |
| **P7** | Admin check fail-closed quando helpers ausentes |
| **P8** | `backup_now` exige admin; save de agendamento permanece para quem tem acesso à página |
| **P9** | Doc 101 E2 atualizado (PostgreSQL + fail-closed emergência C3) |

### Agente (A1–A4)

| ID | Implementação |
|----|---------------|
| **A1** | Lock backup com arquivo `pid`/`started_at`, stale TTL 3600s, cleanup no heartbeat |
| **A2** | Lock upgrade OS reutiliza `agent_acquire_stale_lock()` (TTL 7200s) |
| **A3** | Migração `NODE_SECRET` legado do `.conf` → arquivo 0600; remove linha do `.conf` |
| **A4** | Guias existentes validados; tooltip semi-manual em `node-pfsense-upgrade-section.tsx` |

### API (C1–C6)

| ID | Implementação |
|----|---------------|
| **C1** | `assertCanCreateClient` mantido (escopo global); `/auth/me` expõe `has_global_client_scope` |
| **C2** | `MFA_ENFORCEMENT_BLOCKING` (default false); `/auth/me` com `mfa_enrollment_required` + `mfa_enforcement_blocking`; `MfaEnrollmentGuard` em `/api/v1/admin/*` |
| **C3** | Fail-closed emergência: 1 req/min/IP em memória quando PG indisponível |
| **C4** | Invalidação em `admin.service.ts` (setRolePermissions) confirmada; TTL cache 60s; limitação multi-instância documentada |
| **C5** | Invalidação em CRUD client/site/node confirmada; TTL residual 120s documentado |
| **C6** | `backups-ingest.controller.ts` usa `resolveClientIp()` |

### Web (W1–W4)

| ID | Implementação |
|----|---------------|
| **W1** | `firewalls.view` em `/dashboard`, `/nodes`, `/nodes/[id]`; nav oculta Dashboard/Firewalls |
| **W2** | `lib/handle-page-api-error.ts` — 401→login, 403→`/conta?access=denied` |
| **W3** | Cadastro `/admin` e nav alinhados com `has_global_client_scope` |
| **W4** | Middleware redireciona para `/conta?mfa=required` quando blocking + enrollment pendente |

---

## Decisões registradas

- **C1/W3 — Opção A:** criar cliente top-level exige escopo global (superadmin ou RBAC scope desligado).
- **C2 — Modo soft default:** `MFA_ENFORCEMENT_BLOCKING=false`; blocking opt-in via env.
- **P8:** save de config backup permitido; `backup_now` admin-only.

---

## C4/C5 — Auditoria de invalidação

**RBAC (`invalidateRoleCache`):** chamado em `admin.service.ts` ao criar role e ao `setRolePermissions`.

**Filters (`invalidateFiltersCache`):** chamado em create/update/delete de client, site e node em `admin.service.ts`.

**Gaps:** nenhum gap adicional encontrado na auditoria de call sites.

**Limitação multi-instância:** caches in-memory por processo; sem Redis — alterações podem demorar até TTL (60s RBAC / 120s filters) em réplicas distintas.

---

## Validação

```bash
cd /Dados/Monitor-Pfsense
./scripts/run-smoke-suite.sh          # 14/14 verde (~37s)
cd apps/web && npm run build            # OK (1.4.2)
cd apps/api && npm run build            # OK (0.6.1)
./scripts/release-pfsense-package.sh --no-push  # artefato 0.4.3
```

Artefato: `dist/pfsense-package/monitor-pfsense-package-v0.4.3.tar.gz`  
Config: `config/package-release.env` (`PACKAGE_RELEASE_SHA256=6d12cc5e…`)

---

## Próximo passo

1. Publicar package 0.4.3 (`./scripts/release-pfsense-package.sh` com push raw GitHub).
2. Piloto em 1 firewall pfSense 2.7+ (T1–T6 do plano 110).
3. Opcional: `MFA_ENFORCED_ROLES=admin,superadmin` + `MFA_ENFORCEMENT_BLOCKING=true` após enrollment dos admins.

---

## Não-regressões preservadas

- Hotfix 106: portal modal, `key={pathname}`, admin layout pass-through.
- Hotfix 109: `getUserEntry['item']` desempacotado.
- Melhorias visuais 109 intactas.
