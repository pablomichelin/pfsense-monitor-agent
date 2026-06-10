# 88. Encerramento — Roadmap UX front-end (Fases 0–8, plano 24)

Data de encerramento: `2026-06-09`  
Status: **roadmap encerrado**  
Plano mestre: `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md`

## Resumo executivo

O **roadmap UX plano 24** reestruturou o painel web em oito fases incrementais: fundação visual, shell de navegação, dashboard enxuto, inventário de firewalls, detalhe em abas, frota de backups, conta separada, auditoria com filtros amigáveis e adoção global do design system. Entregas preservaram RBAC, middleware, ingest do agente e contratos existentes da API — alterações de backend foram mínimas e retrocompatíveis.

Versões finais:

| Componente | Versão |
|------------|--------|
| API | `0.2.7` |
| Painel web | `1.0.0` |

## Contexto pré-roadmap (docs 77–78)

Microtrilhas imediatamente anteriores ao plano 24, fora da numeração de fases 0–8:

| Doc | Versão | Entrega principal |
|-----|--------|-------------------|
| `docs/77-ENTREGA-POS-RBAC-UX-LAYOUT-2026-06-09.md` | painel `0.2.5` | Escopo multi-coluna; shell responsivo |
| `docs/78-ENTREGA-GESTAO-PERFIS-PERMISSOES-2026-06-09.md` | API `0.2.5`, painel `0.2.6` | Matriz de permissões editável; perfis customizados |

## Fases entregues (0–8)

| Fase | Trilha | Entrega | Painel | API | Entrega principal |
|------|--------|---------|--------|-----|-------------------|
| 0 + 1 | [`docs/79`](79-TRILHA-FRONTEND-FASE0-FASE1-LAYOUT-NAVEGACAO-2026-06-09.md) | [`docs/80`](80-ENTREGA-FRONTEND-FASE0-FASE1-LAYOUT-2026-06-09.md) | `0.2.9` | `0.2.5` | Design tokens; sidebar, header, breadcrumbs; `components/ui/` |
| 2 | [`docs/81`](81-TRILHA-FRONTEND-FASE2-DASHBOARD-ENXUTO-2026-06-09.md) | [`docs/81`](81-ENTREGA-FRONTEND-FASE2-DASHBOARD-ENXUTO-2026-06-09.md) | `0.3.0` | `0.2.5` | Dashboard enxuto; KPIs; zona quente |
| 3 | [`docs/82`](82-TRILHA-FRONTEND-FASE3-FIREWALLS-INVENTARIO-2026-06-09.md) | [`docs/82`](82-ENTREGA-FRONTEND-FASE3-FIREWALLS-INVENTARIO-2026-06-09.md) | `0.4.0` | `0.2.6` | Inventário `/nodes`; backup e alertas; filtros |
| 4 | [`docs/83`](83-TRILHA-FRONTEND-FASE4-DETALHE-FIREWALL-ABAS-2026-06-09.md) | [`docs/83`](83-ENTREGA-FRONTEND-FASE4-DETALHE-FIREWALL-ABAS-2026-06-09.md) | `0.5.0` | `0.2.6` | Detalhe `/nodes/[id]` em abas operacionais |
| 5 | [`docs/84`](84-TRILHA-FRONTEND-FASE5-BACKUPS-FROTA-MENU-2026-06-09.md) | [`docs/84`](84-ENTREGA-FRONTEND-FASE5-BACKUPS-FROTA-MENU-2026-06-09.md) | `0.6.0` | `0.2.6` | Página `/backups`; item no menu Operação |
| 6 | [`docs/85`](85-TRILHA-FRONTEND-FASE6-CONTA-SEPARADA-POLIMENTO-PTBR-2026-06-09.md) | [`docs/85`](85-ENTREGA-FRONTEND-FASE6-CONTA-SEPARADA-POLIMENTO-PTBR-2026-06-09.md) | `0.7.0` | `0.2.6` | Rota `/conta`; polimento PT-BR |
| 7 | [`docs/86`](86-TRILHA-FRONTEND-FASE7-AUDITORIA-FILTROS-AMIGAVEIS-2026-06-09.md) | [`docs/86`](86-ENTREGA-FRONTEND-FASE7-AUDITORIA-FILTROS-AMIGAVEIS-2026-06-09.md) | `0.8.0` | `0.2.7` | `/audit` com filtros amigáveis; query params opcionais na API |
| 8 | [`docs/87`](87-TRILHA-FRONTEND-FASE8-DESIGN-SYSTEM-PAGES-RESTANTES-2026-06-09.md) | [`docs/87`](87-ENTREGA-FRONTEND-FASE8-DESIGN-SYSTEM-PAGES-RESTANTES-2026-06-09.md) | `1.0.0` | `0.2.7` | Design system global; componente `DataTable` |

Planos por fase: `25-plano-fase2-…` a `31-plano-fase8-…` na raiz do repositório.

## Artefatos principais no código

- `apps/web/components/ui/` — design system (`Button`, `Badge`, `Alert`, `Card`, `PageSection`, `StatusBadge`, `DataTable`)
- `apps/web/components/app-shell-layout.tsx` — shell sidebar + header (Fase 1)
- `apps/web/middleware.ts` + `apps/web/lib/route-policy.ts` — proteção de rotas (RBAC; estendido nas fases 5–6)
- `apps/web/app/dashboard/`, `nodes/`, `backups/`, `conta/`, `audit/` — páginas refatoradas por fase
- `apps/api/src/admin/audit/` — filtros opcionais em `GET /api/v1/admin/audit` (Fase 7)


## Resultados de testes (`2026-06-10`)

| Teste | Resultado |
|-------|-----------|
| `GET /healthz` (8088) | OK — HTTP 200 |
| `GET /login` | OK — HTTP 200; rodapé `1.0.0` |
| Rotas autenticadas sem cookie | OK — HTTP 307 |
| `smoke-frontend-assets.sh` | OK |
| `smoke-agent-release.sh` | OK |
| `smoke-realtime-refresh.sh` | OK |
| `smoke-auth-sessions.sh` | OK após alinhar strings PT-BR |
| `smoke-bootstrap-flow.sh` | **Bloqueado** — `PACKAGE_RELEASE_VERSION=0.2.0` no `.env.api` vs artefato `0.2.34` no `package_command` (ajustar env operacional ou smoke) |
| `smoke-admin-operations.sh` | OK após alinhar strings da página `/audit` (Fase 7) |
| `smoke-rbac-roles.sh` | OK |
| `smoke-rbac-node-detail.sh` | **Falha** — operator `403 node out of scope` (dados/escopo do lab; revisar fixture do smoke) |
| `scripts/run-smoke-suite.sh` (completa) | **Parcial** — falha em bootstrap enquanto versão do package no env divergir |
| `SYSTEM_VERSION` | `.env.api.example` → `0.2.7`; host recriado (`docker compose up -d --force-recreate api`); `/healthz` reporta `0.2.7` |

## Validação (encerramento)

```bash
cd apps/web && npm run build
docker compose ps   # api, web, db, nginx healthy
```

Checklist Fase 8: ver `docs/87-ENTREGA-FRONTEND-FASE8-DESIGN-SYSTEM-PAGES-RESTANTES-2026-06-09.md` §6 (itens marcados `[x]`).

Smokes RBAC e operacionais permanecem referência: `scripts/run-smoke-suite.sh`.

## Não reabrir sem decisão explícita

Este roadmap está **encerrado**. Correções pontuais de UX ou bugs são permitidas; **não** reexecutar fases 0–8 nem redesenhar o shell/design system sem novo plano mestre e trilha própria.

## Próximas trilhas sugeridas (independentes)

1. Homologação / expansão em novos firewalls
2. Fase B serviços — `21-evolucao-servicos-e-fase-b-2026-03-13.md`
3. Fase G RBAC (opcional) — apenas com decisão explícita do produto
4. Nova trilha UX — somente com plano novo (fora do plano 24)
