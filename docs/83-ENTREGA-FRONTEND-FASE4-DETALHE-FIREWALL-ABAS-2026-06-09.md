# 83 — Entrega front-end Fase 4 (Detalhe firewall em abas)

**Data:** 2026-06-09  
**Versão painel:** `0.5.0`  
**API:** `0.2.6` (sem alteração)  
**Plano:** `27-plano-fase4-detalhe-firewall-abas-2026-06-09.md`  
**Trilha:** `docs/83-TRILHA-FRONTEND-FASE4-DETALHE-FIREWALL-ABAS-2026-06-09.md`

---

## 1. Resumo

Página `/nodes/[id]` refatorada de scroll longo para **abas operacionais**, com design system (`PageSection`, `Card`, `Alert`, `Button`, `Badge`, `StatusBadge`). Todas as funcionalidades anteriores preservadas (métricas, serviços, interfaces, maintenance, backups, alertas, bootstrap, edição).

---

## 2. Abas implementadas

| Aba | Query `?tab=` | Conteúdo |
|-----|---------------|----------|
| Visão geral | `overview` (padrão) | Identidade, interfaces, maintenance mode |
| Métricas | `metrics` | CPU, memória, disco, uptime + serviços VPN |
| Alertas | `alerts` | Alertas recentes (oculta para perfil `client`) |
| Backup | `backup` | `NodeConfigBackupsSection` |
| Configuração | `config` | Editar cadastro + instalar agente / bootstrap |

A troca de aba atualiza `?tab=` na URL preservando parâmetros de bootstrap (`heartbeat_mode`, `config_backup_enabled`, overrides).

---

## 3. Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `27-plano-fase4-detalhe-firewall-abas-2026-06-09.md` | Plano Fase 4 |
| `docs/83-TRILHA-FRONTEND-FASE4-DETALHE-FIREWALL-ABAS-2026-06-09.md` | Trilha executável |
| `apps/web/lib/node-detail-helpers.ts` | Helpers e `buildNodeDetailsHref` com `tab` |
| `apps/web/components/nodes/node-detail-ui.tsx` | Metric, BootstrapField, CommandBlock |
| `apps/web/components/nodes/node-detail-tabs.tsx` | Navegação client-side |
| `apps/web/components/nodes/node-detail-overview-tab.tsx` | Aba visão geral |
| `apps/web/components/nodes/node-detail-metrics-tab.tsx` | Aba métricas + serviços |
| `apps/web/components/nodes/node-detail-alerts-tab.tsx` | Aba alertas |
| `apps/web/components/nodes/node-detail-backup-tab.tsx` | Aba backup |
| `apps/web/components/nodes/node-detail-config-tab.tsx` | Aba configuração |

---

## 4. Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `apps/web/app/nodes/[id]/page.tsx` | PageHero + abas; flash com `Alert` |
| `apps/web/package.json` | Versão `0.5.0` |

---

## 5. Perfis

| Perfil | Comportamento |
|--------|---------------|
| Operador | Abas conforme permissão (`firewalls.update`, `bootstrap.view`, etc.) |
| Client | Sem aba Alertas; Config só se bootstrap permitido |

---

## 6. Como validar

1. Abrir `/nodes/[id]` — abas visíveis abaixo do hero
2. Clicar Métricas — CPU/memória/disco e serviços
3. Clicar Backup — solicitar/download backup funciona
4. `?tab=alerts` — aba Alertas direto na URL
5. Perfil `client` — sem aba Alertas
6. Maintenance mode na aba Visão geral
7. Bootstrap na aba Configuração — links heartbeat/backup preservam query
8. Rodapé exibe `v0.5.0`

---

## 7. Build e deploy

```bash
cd apps/web && npm run build
cd /Dados/Monitor-Pfsense && docker compose up -d --build
```

---

## 8. Deferidos (Fase 5+)

- Página Backups frota agregada + item no menu
- Polimento PT-BR global (Fase 6)
- Design system em admin/audit (Fase 8)
