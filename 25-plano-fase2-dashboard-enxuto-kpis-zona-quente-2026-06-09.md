# 25. Plano de execução — Fase 2: Dashboard enxuto (KPIs + zona quente)

Data: `2026-06-09`  
Status: `encerrado` — ver `docs/88-ENCERRAMENTO-ROADMAP-UX-FASE0-FASE8-2026-06-09.md`  
Próximo passo operacional: `docs/81-TRILHA-FRONTEND-FASE2-DASHBOARD-ENXUTO-2026-06-09.md`

## Documentos relacionados

| Documento | Papel |
|-----------|--------|
| `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md` | Plano mestre UX; Fase 2 na seção "Próximas fases" |
| `docs/80-ENTREGA-FRONTEND-FASE0-FASE1-LAYOUT-2026-06-09.md` | Entrega Fase 0+1 (shell intacto) |
| `docs/SISTEMA-VISUAL-PAINEL.md` | Tokens e padrões visuais |
| `docs/45-DASHBOARD-OPERACIONAL-LISTA-SERVIDORES-2026-03-15.md` | Histórico lista operacional |
| `docs/46-DESPOLUICAO-VISUAL-DASHBOARD-OPERACIONAL-2026-03-15.md` | Despoluição anterior |

## Objetivo desta trilha

Transformar `/dashboard` em visão **enxuta e operacional**: **KPIs + zona quente**, adotando o design system da Fase 0, **sem** alterar shell global, backend ou outras páginas operacionais.

## Versões alvo ao encerrar

| Componente | Versão atual | Versão alvo | Tipo de bump |
|------------|--------------|-------------|--------------|
| API | `0.2.5` | `0.2.5` | **Sem alteração** |
| Painel web | `0.2.9` | `0.3.0` | **minor** — remove tabela operacional; inventário completo passa a `/nodes` |

Entrega documental: `docs/81-ENTREGA-FRONTEND-FASE2-DASHBOARD-ENXUTO-2026-06-09.md`

---

## Escopo autorizado

### KPIs

- Refatorar cards inline (`SummaryCard` / `glass-panel`) para `Card` do design system
- Indicadores visuais alinhados: dot de status (online/degraded/offline) ou `Badge` (alertas, versões)
- Grid responsivo: 4 colunas (cliente) / 5 colunas (operador) em xl
- Remover stats redundantes do `PageHero` (Firewalls / Alertas já nos KPIs)

### Zona quente

- Envolver em `PageSection` com título, descrição e CTA `Button` → `/nodes?status=offline`
- Empty state via `Alert` success (PT-BR)
- `HotZoneExpandableList`: `StatusBadge`, `Button`, `Badge` para severidade de alertas

### Inventário completo

- **Remover** tabela "Lista operacional" (~11 colunas) do dashboard
- Substituir por bloco CTA claro → `/nodes` (Firewalls no menu)
- Remover query params `sort_by` / `sort_order` do dashboard

### Preservar

- `RealtimeRefresh` no aside do hero (não mover para header)
- Diferenças perfil `client` vs operador (`isClientRole`)
- APIs: `getDashboardSummary()`, `getNodesList()`, `getSession()` — sem contrato novo
- Shell Fase 1: sidebar, header, breadcrumbs, `app/layout.tsx`

---

## Fora de escopo (proibido)

- Alterar sidebar, header, breadcrumbs, layout global
- Backend, API, middleware, server actions
- Páginas `/nodes`, `/nodes/[id]`, alertas, admin, bootstrap, auditoria
- Rota `/backups` ou menu Backups
- Adoção global DataTable/StatusBadge em todas as pages (Fase 8)
- Quebrar monitoramento, heartbeat ou backup

---

## Arquivos previstos

| Arquivo | Ação |
|---------|------|
| `apps/web/app/dashboard/page.tsx` | Refatoração principal |
| `apps/web/components/dashboard/kpi-card.tsx` | **Novo** — card KPI reutilizável |
| `apps/web/components/dashboard/dashboard-kpi-grid.tsx` | **Novo** — grid de KPIs |
| `apps/web/components/hot-zone-expandable-list.tsx` | Alinhar design system |
| `apps/web/package.json` | Bump `0.3.0` |
| Índices + histórico | Atualizar versões |

**Intocados:** `apps/api/**`, `app/layout.tsx`, `app-sidebar`, `app-header`, `middleware.ts`, demais pages.

---

## Critérios de aceite

- [ ] `/dashboard` carrega (401 → login; client e operador ok)
- [ ] KPIs legíveis com `Card` / indicadores do design system
- [ ] Zona quente: offline/degraded, expandir alertas, links detalhe/inventário
- [ ] `RealtimeRefresh` na página
- [ ] Sem tabela operacional — CTA para `/nodes`
- [ ] Shell Fase 1 intacto
- [ ] Build web OK + containers atualizados
- [ ] Docs e versão `0.3.0` no rodapé

---

## Decisões fechadas

1. **Versão `0.3.0` (minor):** fluxo visível muda — lista completa só em `/nodes`.
2. **PageHero mantido** no dashboard (eyebrow/título/descrição + aside refresh); stats inline removidos por redundância.
3. **KPI "Versões pfSense":** mantém contagem de versões distintas (dados de `getNodesList`).
4. **Matriz de versão:** não reintroduzir nesta fase (já removida em entregas anteriores).

---

## Próximas fases (fora desta entrega)

| Fase | Conteúdo |
|------|----------|
| 3 | Firewalls inventário (coluna backup/alertas) |
| 4 | Detalhe firewall em abas |
| 5 | Página Backups frota + menu |
| 6 | Conta separada; polimento PT-BR |
| 7 | Auditoria filtros amigáveis |
| 8 | Adoção design system nas pages restantes |

---

## Histórico deste documento

| Data | Evento |
|------|--------|
| 2026-06-09 | Plano Fase 2 aprovado; escopo dashboard enxuto fechado |
