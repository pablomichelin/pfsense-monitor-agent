# Trilha executável — Front-end Fase 4 (Detalhe firewall em abas)

**Data:** 2026-06-09  
**Status:** concluída  
**Plano mestre:** `27-plano-fase4-detalhe-firewall-abas-2026-06-09.md`  
**Entrega anterior:** `docs/82-ENTREGA-FRONTEND-FASE3-FIREWALLS-INVENTARIO-2026-06-09.md`

## Objetivo

Checklist para refatorar **somente** `/nodes/[id]` em abas — **sem** shell, inventário, API ou admin.

## Versão alvo

- Painel web: `0.4.0` → `0.5.0` (minor)
- API: `0.2.6` (sem alteração)

---

## Pré-voo

- [x] Ler `27-plano-fase4-detalhe-firewall-abas-2026-06-09.md`
- [x] Ler `apps/web/app/nodes/[id]/page.tsx` completo
- [x] Confirmar seções atuais (métricas, serviços, interfaces, backup, alertas, bootstrap)

---

## Bloco A — Helpers e UI

- [ ] `lib/node-detail-helpers.ts` — funções extraídas + `buildNodeDetailsHref` com `tab`
- [ ] `components/nodes/node-detail-ui.tsx` — Metric, BootstrapField, CommandBlock
- [ ] `components/nodes/node-detail-tabs.tsx` — client + `?tab=` na URL

---

## Bloco B — Painéis de aba

- [ ] `node-detail-overview-tab.tsx` — interfaces + maintenance
- [ ] `node-detail-metrics-tab.tsx` — métricas + serviços
- [ ] `node-detail-alerts-tab.tsx` — alertas recentes
- [ ] `node-detail-backup-tab.tsx` — wrapper `NodeConfigBackupsSection`
- [ ] `node-detail-config-tab.tsx` — editar + bootstrap

---

## Bloco C — Página

- [ ] `page.tsx` — PageHero + Alert flash + NodeDetailTabs
- [ ] Suspense para `useSearchParams`
- [ ] Perfil client sem aba Alertas
- [ ] Build web

```bash
cd apps/web && npm run build
```

---

## Bloco D — Documentação e versão

- [ ] Bump `apps/web/package.json` → `0.5.0`
- [ ] Índices + histórico
- [ ] `docs/83-ENTREGA-...`
- [ ] Deploy

```bash
cd /opt/Monitor-Pfsense && docker compose up -d --build
```

---

## Deferidos (Fase 5+)

- Backups frota agregada
- Adoção completa design system em admin/audit
