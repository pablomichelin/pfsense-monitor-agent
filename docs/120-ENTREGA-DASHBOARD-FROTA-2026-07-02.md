# 120 — Entrega: Dashboard frota e matriz de versões

**Data:** 2026-07-02  
**Fase do plano 117:** Fase 2 — Dashboard frota e matriz de versões  
**Componentes alterados:** API, web, docs (sem package pfSense, sem ingestão/agente)  
**Versões antes:** API `0.6.4` · web `1.4.5` · package `0.4.7`  
**Versões depois:** API `0.6.4` · web `1.4.5` · package `0.4.7` (sem bump semver nesta entrega)

**Referências:** `docs/118-BASELINE-MELHORIAS-SEGURAS-2026-07-02.md`, `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md`

---

## Escopo entregue

### API

Novo endpoint **`GET /api/v1/dashboard/fleet`** (permissão `firewalls.view`):

| Campo | Descrição |
|-------|-----------|
| `totals` | Total, online, degradado, offline, manutenção, unknown, alertas abertos e **críticos** |
| `compliance` | Contagem e percentual de backup em dia; package desatualizado vs release alvo |
| `version_matrix` | Matrizes pfSense OS e package monitor (versão → count; package inclui `alignment`) |
| `filters` | Eco dos filtros aplicados (`client_id`, `site_id`, `status`) |

**Query opcional:** `client_id`, `site_id`, `status` — mesma semântica do inventário (`/api/v1/nodes`).

**Compatibilidade:** `GET /api/v1/dashboard/summary` **inalterado** no contrato; cache do summary passou a respeitar escopo RBAC por usuário (correção de segurança).

**Cache:** TTL 20s, chave por usuário + escopo de clientes + filtros.

**Agregação:** reutiliza `deriveEffectiveNodeStatus`, `deriveBackupVisualStatus` e comparação semver de package (`config/package-release.env`).

Arquivos principais:

- `apps/api/src/dashboard/dashboard.service.ts`
- `apps/api/src/dashboard/dashboard.controller.ts`
- `apps/api/src/dashboard/fleet-aggregation.util.ts`
- `apps/api/src/common/package-version.util.ts`
- `apps/api/src/dashboard/dto/fleet-query.dto.ts`

### Painel web (`/dashboard`)

- KPIs expandidos: total, online, degradado, offline, manutenção, alertas críticos (oculto perfil cliente), backup em dia (%), pacote desatualizado (%)
- Seção **Matriz de versões**: tabelas compactas pfSense OS e package monitor
- `/nodes` permanece fonte de ação detalhada (links no rodapé das matrizes)
- Sem gráficos pesados; layout operacional denso preservado

Arquivos principais:

- `apps/web/app/dashboard/page.tsx`
- `apps/web/components/dashboard/dashboard-kpi-grid.tsx`
- `apps/web/components/dashboard/fleet-version-matrix.tsx`
- `apps/web/components/dashboard/kpi-card.tsx`
- `apps/web/lib/api.ts` (`FleetResponse`, `getDashboardFleet`)

### Banco

Nenhuma migration — agregação a partir de dados existentes (`nodes`, `config_backups`, `alerts`, `node_commands`).

---

## O que não foi entregue

| Item | Motivo |
|------|--------|
| Filtros visuais no `/dashboard` | Filtros existem na API para reuso; UI de filtro permanece em `/nodes` |
| Bump semver API/web | Entrega aditiva; versões mantidas |
| Smoke dedicado automatizado `dashboard/fleet` | Validado manualmente via curl autenticado |
| Alteração de ingestão/agente/package | Fora do escopo da fase |

---

## Impacto

| Área | Impacto |
|------|---------|
| API | Novo endpoint; summary com cache RBAC-scoped |
| Banco | Nenhum |
| UI | Dashboard enriquecido |
| Package/agente | Nenhum |
| Operação | Redeploy API/web necessário |

---

## RBAC e auditoria

- Permissão existente: `firewalls.view`
- Escopo por cliente via `AccessPolicyService` (mesmo padrão de `/nodes`)
- Sem novas permissões; sem ações mutáveis — **sem auditoria adicional**

---

## Rollback

1. Frontend: reverter página `/dashboard` para consumir apenas `summary` + KPIs antigos
2. API: endpoint `/fleet` pode permanecer inerte; `summary` continua funcional
3. Cache scoped do summary é melhoria compatível — não exige rollback

---

## Testes executados

| Teste | Resultado |
|-------|-----------|
| `npm run build` (API) | OK |
| `npm run build` (web) | OK |
| `node --test apps/api/test/fleet-aggregation.test.mjs` | OK (5/5) |
| `node --test apps/api/test/notification-rule-matcher.test.mjs` | OK (3/3) |
| `curl` autenticado `GET /api/v1/dashboard/fleet` | OK — KPIs + matrizes |
| `docker compose build api web && up -d` | OK — containers healthy |
| `scripts/smoke-frontend-assets.sh` | OK |

---

## Evidências operacionais

Exemplo de resposta (superadmin, frota real, 2026-07-02):

- 57 firewalls no escopo
- 19% backup em dia; 58% package desatualizado vs `0.4.7`
- Matriz pfSense: predominância `2.8.1` (49 nodes)

---

## Próximo passo

**Fase 3 — Tags, grupos e criticidade** (`docs/117`, seção 10): tags livres, grupos ad-hoc, criticidade/SLA por node, filtros no inventário.

Operacional paralelo: continuar rollout package `0.4.7` monitorando drift pela matriz de package e coluna **Pacote** em `/nodes`.
