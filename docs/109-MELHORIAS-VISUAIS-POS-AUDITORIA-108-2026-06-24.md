# Melhorias visuais pós-auditoria 108

**Data:** 2026-06-24  
**Versão web:** 1.4.1  
**Referência:** [108-AUDITORIA-VISUAL-STITCH-2026-06-24.md](./108-AUDITORIA-VISUAL-STITCH-2026-06-24.md)  
**Hotfix preservado:** [106-HOTFIX-ADMIN-NAV-MODAL-PORTAL-2026-06-24.md](./106-HOTFIX-ADMIN-NAV-MODAL-PORTAL-2026-06-24.md)

---

## Sumário executivo

Implementação das três fases de melhorias visuais identificadas na auditoria Stitch 108: quick wins de copy/tokens, padronização admin (h-11, space-y-8, PT-BR) e backlog viável (paginação clientes, bootstrap, KPI, e2e smoke, matriz permissões).

**Hotfix 106 intacto:** `ConfirmDialog` continua com portal em `document.body` e `z-[100]`; `app-shell-layout.tsx` mantém `key={pathname}` em `<main>`; `admin/layout.tsx` pass-through preservado.

---

## Fase 1 — Quick wins (15/15)

| # | Item | Status |
|---|------|--------|
| 1 | Autenticação em `/login` | ✅ |
| 2 | Copy modal excluir cliente (acentos + é) | ✅ |
| 3 | Labels PT status em `/admin/clientes` via `statusLabel()` | ✅ |
| 4 | `tracking-wider` em `app-sidebar.tsx` | ✅ |
| 5 | `tracking-wider` em matriz permissões | ✅ |
| 6 | `delete-node-button` → `rounded-lg` + variant danger | ✅ |
| 7 | Pill backup → `rounded-md` | ✅ |
| 8 | MFA badge → `rounded-md` | ✅ |
| 9 | Atalhos admin → h-11 | ✅ |
| 10 | Filtros `/alerts` e `/audit` → h-11 | ✅ |
| 11 | Hero stats `/nodes/[id]` → label PT | ✅ |
| 12 | `/admin/clientes` → `space-y-8` | ✅ |
| 13 | Labels visíveis inputs clientes | ✅ |
| 14 | Exceções `rounded-full` documentadas | ✅ |
| 15 | `--app-max-w` doc → 80rem | ✅ |

---

## Fase 2 — Padronização admin

| Item | Status |
|------|--------|
| Altura h-11 em botões (`Button` md) e inputs admin | ✅ |
| `space-y-8` em páginas `/admin/*` | ✅ |
| Revisão PT-BR (cadastro, usuários, permissões, modais) | ✅ |
| Estilos compartilhados `lib/admin-nav-styles.ts` | ✅ |

---

## Fase 3 — Backlog (implementado nesta sessão)

| Item | Status | Notas |
|------|--------|-------|
| Paginação client-side admin clientes | ✅ | `AdminClientsList` — 10 por página + "Mostrar mais" |
| Bootstrap simplificação | ✅ | `space-y-8`, filtros h-11, botões consistentes |
| Matriz permissões toggles `rounded-md` | ✅ | table + editor |
| Testes visuais Playwright | ✅ parcial | `apps/web/e2e/` — estrutura + smoke login/dashboard |
| KPI dashboard sem badge redundante | ✅ | dots de status em vez de badge repetindo label |
| Responsividade mobile sidebar | ⏸ validado código | overlay existente; sem ajustes adicionais necessários |
| Stitch sync trimestral | 📋 backlog | mencionar apenas — não executado |

---

## Arquivos alterados

### Novos
- `apps/web/lib/admin-nav-styles.ts`
- `apps/web/components/admin-clients-list.tsx`
- `apps/web/e2e/routes.ts`
- `apps/web/e2e/README.md`
- `apps/web/e2e/visual-smoke.spec.mjs`
- `docs/109-MELHORIAS-VISUAIS-POS-AUDITORIA-108-2026-06-24.md`

### Modificados
- `apps/web/package.json` (1.4.1)
- `apps/web/app/login/page.tsx`
- `apps/web/app/admin/page.tsx`
- `apps/web/app/admin/clientes/page.tsx`
- `apps/web/app/admin/usuarios/page.tsx`
- `apps/web/app/admin/permissoes/page.tsx`
- `apps/web/app/alerts/page.tsx`
- `apps/web/app/audit/page.tsx`
- `apps/web/app/bootstrap/page.tsx`
- `apps/web/app/nodes/[id]/page.tsx`
- `apps/web/app/conta/mfa-section.tsx`
- `apps/web/components/app-sidebar.tsx`
- `apps/web/components/client-delete-button.tsx`
- `apps/web/components/delete-node-button.tsx`
- `apps/web/components/node-config-backups-section.tsx`
- `apps/web/components/permissions-matrix-table.tsx`
- `apps/web/components/permissions-matrix-editor.tsx`
- `apps/web/components/admin-cadastro-cards.tsx`
- `apps/web/components/admin-usuarios-tabs.tsx`
- `apps/web/components/role-scope-fields.tsx`
- `apps/web/components/client-scope-picker.tsx`
- `apps/web/components/dashboard/kpi-card.tsx`
- `apps/web/components/dashboard/dashboard-kpi-grid.tsx`
- `apps/web/components/ui/button.tsx`
- `apps/web/lib/node-detail-helpers.ts`
- `docs/SISTEMA-VISUAL-PAINEL.md`
- `CORTEX.md`

### Não alterados (hotfix 106)
- `apps/web/components/confirm-dialog.tsx` — portal + z-[100] preservados
- `apps/web/components/app-shell-layout.tsx` — `key={pathname}` preservado
- `apps/web/app/admin/layout.tsx` — pass-through preservado

---

## Deploy

```bash
cd /Dados/Monitor-Pfsense
cd apps/web && npm run build
docker compose build web
docker compose up -d web
```

---

## Pendências

1. Expandir e2e para 16 rotas completas (incl. `/nodes/[id]` com fixture)
2. Integrar pipeline CI de screenshots
3. Validação mobile em dispositivo real (<768px)
4. Stitch sync trimestral (backlog operacional)

---

## Validação

- `npm run build` — OK (apps/web)
- `docker compose build web` — OK
- `docker compose up -d web` — OK
