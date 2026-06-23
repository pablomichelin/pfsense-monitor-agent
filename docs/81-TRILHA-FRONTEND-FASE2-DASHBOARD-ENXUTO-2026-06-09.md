# Trilha executável — Front-end Fase 2 (Dashboard enxuto)

**Data:** 2026-06-09  
**Status:** pronta para execução  
**Plano mestre:** `25-plano-fase2-dashboard-enxuto-kpis-zona-quente-2026-06-09.md`  
**Entrega anterior:** `docs/80-ENTREGA-FRONTEND-FASE0-FASE1-LAYOUT-2026-06-09.md`

## Objetivo

Checklist para refatorar **somente** `/dashboard`: KPIs com design system, zona quente polida, remoção da tabela operacional e CTA para `/nodes` — **sem** shell, API ou outras páginas.

## Versão alvo

- Painel web: `0.2.9` → `0.3.0` (minor)
- API: sem bump

---

## Pré-voo

- [ ] Ler `25-plano-fase2-dashboard-enxuto-kpis-zona-quente-2026-06-09.md`
- [ ] Ler `apps/web/app/dashboard/page.tsx` atual
- [ ] Confirmar painel em `0.2.9`
- [ ] Shell Fase 1 funcionando (sidebar visível, conteúdo principal ok)

---

## Bloco A — Componentes dashboard

### A1. `kpi-card.tsx`

- [ ] Usar `Card` de `components/ui`
- [ ] Label mono uppercase; valor display 3xl
- [ ] Indicador: dot de status (online/degraded/offline) ou `Badge` (alertas/versões)

### A2. `dashboard-kpi-grid.tsx`

- [ ] Props: totais do summary, `isClientProfile`, contagem versões distintas
- [ ] Grid responsivo sm:2 lg:3 xl:4/5
- [ ] Ocultar "Alertas abertos" para perfil client

### A3. Build intermediário

```bash
cd apps/web && npm run build
```

---

## Bloco B — Página dashboard

### B1. Hero simplificado

- [ ] Manter `PageHero` com eyebrow/título/descrição PT-BR
- [ ] Remover `stats` redundantes (Firewalls, Alertas)
- [ ] Manter `RealtimeRefresh` no `aside`

### B2. KPIs + zona quente

- [ ] `PageSection` "Indicadores" + `DashboardKpiGrid`
- [ ] `PageSection` "Zona quente" + `Button` secondary → `/nodes?status=offline`
- [ ] Empty state `Alert` success

### B3. Remover lista operacional

- [ ] Excluir tabela e helpers `buildSortHref`, `sort_by`/`sort_order`
- [ ] Remover imports `formatPercent`, `formatUptime` se não usados
- [ ] Manter `getNodesList` para zona quente e KPI versões (sem sort na URL)

### B4. CTA inventário

- [ ] Card ou `PageSection` com link primário → `/nodes`
- [ ] Texto claro: inventário completo fica em Firewalls

---

## Bloco C — Zona quente (client)

### C1. `hot-zone-expandable-list.tsx`

- [ ] `StatusBadge` no lugar de dot + texto capitalize
- [ ] Link "Abrir" → `Button` variant ghost size sm (ou Link estilizado consistente)
- [ ] Severidade alertas → `Badge` PT-BR (Crítico, Aviso, Info)
- [ ] Labels PT-BR: "Último heartbeat", "Alertas"

---

## Bloco D — Versionamento e docs

- [ ] `apps/web/package.json` → `0.3.0`
- [ ] `docs/00-INDICE-OPERACIONAL.md`, `00_inicio.md`, `LEITURA-INICIAL.md`
- [ ] `docs/HISTORICO-E-LINHA-DO-TEMPO.md`
- [ ] `docs/81-ENTREGA-FRONTEND-FASE2-DASHBOARD-ENXUTO-2026-06-09.md`

---

## Bloco E — Build e deploy

```bash
cd apps/web && npm run build
cd /Dados/Monitor-Pfsense && docker compose up -d --build
```

- [ ] Rodapé exibe `v0.3.0`
- [ ] Dashboard sem scroll horizontal em 1366×768

---

## Testes manuais

- [ ] Superadmin: KPIs, zona quente, CTA `/nodes`, `/nodes/[id]`
- [ ] Perfil client: sem KPI Alertas abertos
- [ ] Zona quente vazia: mensagem success
- [ ] RealtimeRefresh visível no hero
- [ ] Shell intacto (sidebar, breadcrumbs)

---

## Deferidos (Fase 3+)

- Inventário `/nodes` com colunas backup
- Detalhe em abas
- Backups frota
