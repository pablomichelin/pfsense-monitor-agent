# Trilha executável — Front-end Fase 5 (Backups frota + menu)

**Data:** 2026-06-09  
**Status:** concluída  
**Plano mestre:** `28-plano-fase5-backups-frota-menu-2026-06-09.md`  
**Entrega anterior:** `docs/83-ENTREGA-FRONTEND-FASE4-DETALHE-FIREWALL-ABAS-2026-06-09.md`

## Objetivo

Checklist para criar **somente** `/backups`, item de menu e proteção de rota — **sem** alterar API ou detalhe por nó.

## Versão alvo

- Painel web: `0.5.0` → `0.6.0` (minor)
- API: `0.2.6` (sem alteração — reutiliza `GET /nodes`)

---

## Pré-voo

- [x] Ler `28-plano-fase5-backups-frota-menu-2026-06-09.md`
- [x] Confirmar `backup_status` em `GET /api/v1/nodes`
- [x] Confirmar permissão `backups.view` na matriz RBAC

---

## Bloco A — Helpers e tabela

- [x] `lib/backup-fleet-helpers.ts` — KPIs, filtro e ordenação
- [x] `components/backups/backups-fleet-table.tsx` — listagem frota

---

## Bloco B — Página e navegação

- [x] `app/backups/page.tsx` — PageHero + filtros + tabela
- [x] `route-policy.ts` — menu Backups + regra `/backups`
- [x] `breadcrumbs.tsx` — Operação › Backups

---

## Bloco C — Documentação e versão

- [x] Bump `apps/web/package.json` → `0.6.0`
- [x] Índices + histórico
- [x] `docs/84-ENTREGA-...`
- [x] Build + deploy

```bash
cd apps/web && npm run build
cd /opt/Monitor-Pfsense && docker compose up -d --build
```

---

## Deferidos (Fase 6+)

- Endpoint agregado de backups frota
- Polimento PT-BR global
- Design system em admin/audit
