# 81 — Entrega front-end Fase 2 (Dashboard enxuto)

**Data:** 2026-06-09  
**Versão painel:** `0.3.0`  
**API:** `0.2.5` (sem alteração)  
**Plano:** `25-plano-fase2-dashboard-enxuto-kpis-zona-quente-2026-06-09.md`  
**Trilha:** `docs/81-TRILHA-FRONTEND-FASE2-DASHBOARD-ENXUTO-2026-06-09.md`

---

## 1. Resumo

Dashboard `/dashboard` refatorado para visão enxuta: KPIs com design system, zona quente polida e CTA para inventário completo em `/nodes`. Tabela operacional (~11 colunas) removida. Shell Fase 1, API e demais páginas intactos.

---

## 2. Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `25-plano-fase2-dashboard-enxuto-kpis-zona-quente-2026-06-09.md` | Plano Fase 2 |
| `docs/81-TRILHA-FRONTEND-FASE2-DASHBOARD-ENXUTO-2026-06-09.md` | Trilha executável |
| `apps/web/components/dashboard/kpi-card.tsx` | Card KPI reutilizável |
| `apps/web/components/dashboard/dashboard-kpi-grid.tsx` | Grid responsivo de KPIs |

---

## 3. Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `apps/web/app/dashboard/page.tsx` | KPIs via design system; PageSection; zona quente; CTA inventário; tabela removida |
| `apps/web/components/hot-zone-expandable-list.tsx` | StatusBadge, Badge severidade PT-BR, labels PT-BR |
| `apps/web/package.json` | Versão `0.3.0` |

---

## 4. Mudanças visuais e de fluxo

- **PageHero:** mantido eyebrow/título/descrição + `RealtimeRefresh`; stats inline removidos (redundantes com KPIs)
- **KPIs:** `Card` + indicadores de status (dot) ou `Badge` (alertas, versões); label "Degradado" PT-BR
- **Zona quente:** `PageSection` + empty state `Alert` success; link "Ver inventário" → `/nodes?status=offline`
- **Inventário completo:** card CTA "Abrir firewalls" → `/nodes`
- **Removido:** tabela "Lista operacional", query params `sort_by`/`sort_order` no dashboard

---

## 5. Perfis

| Perfil | Comportamento |
|--------|---------------|
| Operador | 5 KPIs incluindo Alertas abertos |
| Client | 4 KPIs (sem Alertas abertos) |

---

## 6. Como validar

1. Acessar `/dashboard` autenticado — KPIs + zona quente + CTA inventário
2. Clicar "Abrir firewalls" — navega para `/nodes`
3. Zona quente vazia — mensagem verde de sucesso
4. Expandir nó na zona quente — alertas carregam; link "Abrir" → detalhe
5. Perfil client — sem KPI Alertas abertos
6. Rodapé exibe `v0.3.0`
7. Sidebar/header/breadcrumbs inalterados

---

## 7. Build e deploy

```bash
cd apps/web && npm run build
cd /opt/Monitor-Pfsense && docker compose up -d --build
```

---

## 8. Deferidos (Fase 3+)

- Inventário `/nodes` com colunas backup
- Detalhe firewall em abas
- Backups frota
