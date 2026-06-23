# 84 — Entrega front-end Fase 5 (Backups frota + menu)

**Data:** 2026-06-09  
**Versão painel:** `0.6.0`  
**API:** `0.2.6` (sem alteração)  
**Plano:** `28-plano-fase5-backups-frota-menu-2026-06-09.md`  
**Trilha:** `docs/84-TRILHA-FRONTEND-FASE5-BACKUPS-FROTA-MENU-2026-06-09.md`

---

## 1. Resumo

Nova página **`/backups`** com visão frota de backups `config.xml`, item **Backups** no menu Operação e proteção de rota via `backups.view`. Dados reutilizam `GET /api/v1/nodes` (campos `backup_status` e `latest_backup_received_at` da Fase 3). Backup por nó em `/nodes/[id]?tab=backup` preservado.

---

## 2. Estratégia de API

| Decisão | Detalhe |
|---------|---------|
| Sem novo endpoint | `GET /api/v1/nodes` já agrega status de backup por firewall |
| KPIs e filtros backup | Calculados no front (`backup-fleet-helpers.ts`) |
| Permissão da rota | `backups.view` |
| Dados da listagem | `firewalls.view` (implícito para perfis com `backups.view`) |

---

## 3. Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `28-plano-fase5-backups-frota-menu-2026-06-09.md` | Plano Fase 5 |
| `docs/84-TRILHA-FRONTEND-FASE5-BACKUPS-FROTA-MENU-2026-06-09.md` | Trilha executável |
| `apps/web/app/backups/page.tsx` | Página frota |
| `apps/web/components/backups/backups-fleet-table.tsx` | Tabela frota |
| `apps/web/lib/backup-fleet-helpers.ts` | KPIs, filtro e ordenação |

---

## 4. Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `apps/web/lib/route-policy.ts` | Menu Backups + regra `/backups` |
| `apps/web/components/breadcrumbs.tsx` | Breadcrumb Operação › Backups |
| `apps/web/package.json` | Versão `0.6.0` |

---

## 5. Menu e permissões

| Elemento | Permissão |
|----------|-----------|
| Item Backups (Operação) | `backups.view` |
| Rota `/backups` | `backups.view` |
| Solicitar backup | permanece em detalhe (`backups.run`) |
| Download | permanece em detalhe (`backups.download`) |

---

## 6. Como validar

1. Login com perfil que tenha `backups.view` — item **Backups** no menu Operação
2. Abrir `/backups` — KPIs e tabela carregam
3. Filtrar por status backup (ex.: Atrasado) — listagem filtra
4. Clicar **Ver backup** — abre `/nodes/[id]?tab=backup`
5. Perfil sem `backups.view` — redirect para `/dashboard`
6. Rodapé exibe `v0.6.0`

---

## 7. Build e deploy

```bash
cd apps/web && npm run build
cd /Dados/Monitor-Pfsense && docker compose up -d --build
```

---

## 8. Deferidos (Fase 6+)

- Endpoint agregado dedicado (`GET /api/v1/backups/fleet`)
- Polimento PT-BR global (Fase 6)
- Design system em admin/audit (Fase 8)
