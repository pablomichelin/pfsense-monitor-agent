# 80 — Entrega front-end Fase 0 + Fase 1 (layout e navegação)

**Data:** 2026-06-09  
**Versão painel:** `0.2.9` (hotfix layout)  
**API:** `0.2.5` (sem alteração)  
**Plano:** `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md`  
**Trilha:** `docs/79-TRILHA-FRONTEND-FASE0-FASE1-LAYOUT-NAVEGACAO-2026-06-09.md`

---

## 1. Resumo

Implementada a fundação visual (Fase 0) e a nova estrutura de navegação com sidebar colapsável, header enxuto e breadcrumbs (Fase 1). Nenhuma alteração em backend, middleware, dashboard, firewalls, alertas ou conteúdo admin.

---

## 2. Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `apps/web/lib/cn.ts` | Helper de classes CSS |
| `apps/web/lib/nav-utils.ts` | `getActiveHref` extraído da nav antiga |
| `apps/web/components/ui/button.tsx` | Botão com variantes e loading |
| `apps/web/components/ui/badge.tsx` | Badge semântico |
| `apps/web/components/ui/status-badge.tsx` | Status firewall/backup PT-BR |
| `apps/web/components/ui/alert.tsx` | Alertas inline |
| `apps/web/components/ui/card.tsx` | Wrapper glass-panel |
| `apps/web/components/ui/page-section.tsx` | Seção com título/ações |
| `apps/web/components/ui/index.ts` | Barrel export |
| `apps/web/components/app-sidebar.tsx` | Sidebar colapsável |
| `apps/web/components/app-header.tsx` | Header com toggle, user, sair |
| `apps/web/components/breadcrumbs.tsx` | Trilha de navegação |
| `apps/web/components/app-shell-layout.tsx` | Shell sidebar + coluna principal |

---

## 3. Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `apps/web/app/globals.css` | Tokens `--sidebar-width`, `--sidebar-width-collapsed`, `--header-height`; classes `.app-layout`, `.app-sidebar`, `.app-main-column`, `.app-header-bar` |
| `apps/web/lib/route-policy.ts` | Grupo `account`; labels PT-BR; sessão movida para Conta |
| `apps/web/app/layout.tsx` | Shell sidebar + header; login sem sidebar |
| `apps/web/components/app-nav.tsx` | Depreciado; reexporta `getActiveHref` |
| `apps/web/app/login/page.tsx` | Piloto `Button` + `Alert` |
| `apps/web/package.json` | Versão `0.2.8` |

---

## 4. Componentes UI (Fase 0)

- **Button:** `primary` \| `secondary` \| `ghost` \| `danger` \| `danger-outline`; tamanhos `sm` \| `md`; `loading`, `disabled`
- **Badge:** `neutral` \| `info` \| `success` \| `warning` \| `danger`
- **StatusBadge:** `online`, `offline`, `degraded`, `maintenance`, `backup-*` com labels PT-BR
- **Alert:** `success` \| `error` \| `warning` \| `info`
- **Card:** wrapper `glass-panel rounded-xl p-5`
- **PageSection:** `title`, `description?`, `actions?`, `children`

---

## 5. Mudanças visuais (Fase 1)

- Nav horizontal removida do header
- Sidebar 240px expandida / 64px colapsada (persistência `localStorage` `sidebar-collapsed`)
- Header fixo ~56px: toggle menu, breadcrumbs, email, Sair
- Grupos PT-BR: **Operação**, **Administração**, **Conta**
- Tema dark/cyber/glass preservado

---

## 6. Sidebar × permissões

Lógica de `permissions.includes(...)` **inalterada**. Reorganização apenas:

| Grupo | Itens |
|-------|-------|
| Operação | Dashboard, Firewalls, Alertas*, Instalação* |
| Administração | Cadastro*, Clientes*, Usuários*, Permissões*, Auditoria* |
| Conta | Minha conta, Sessões (ambos `/sessions`) |

\* Condicionados às mesmas permissões de antes.

**Backups:** não incluído (Fase 5).

---

## 7. Breadcrumbs implementados

| Rota | Trilha |
|------|--------|
| `/dashboard` | Operação › Dashboard |
| `/nodes` | Operação › Firewalls |
| `/nodes/[id]` | Operação › Firewalls › Detalhe do firewall |
| `/alerts` | Operação › Alertas |
| `/bootstrap` | Operação › Instalação |
| `/admin` | Administração › Cadastro |
| `/admin/clientes` | Administração › Clientes |
| `/admin/usuarios` | Administração › Usuários |
| `/admin/permissoes` | Administração › Permissões |
| `/audit` | Governança › Auditoria |
| `/sessions` | Conta › Sessões |
| `/login` | Sem breadcrumb (layout sem sidebar) |

---

## 8. Como validar no navegador

1. Acessar painel autenticado — sidebar visível com grupos
2. Colapsar/expandir sidebar (ícone no header ou rodapé da sidebar)
3. Navegar `/nodes/[id]` — Firewalls ativo, breadcrumb com “Detalhe do firewall”
4. Perfil sem `users.view` — Usuários/Permissões ausentes
5. Logout via header ou sidebar
6. Login — layout sem sidebar; botão `Button` primary
7. Rodapé exibe `v0.2.8`

---

## 9. Riscos residuais

| Risco | Mitigação |
|-------|-----------|
| Duplicata Minha conta / Sessões | Documentado; separar em Fase 6 |
| Hydration sidebar | Estado colapsado aplicado após mount |
| Layout shift ≤1366px | Default colapsado quando sem `localStorage` |

---

## 10. Deferidos (Fase 2+)

- Dashboard enxuto (Fase 2)
- Inventário firewalls com colunas backup (Fase 3)
- Detalhe em abas (Fase 4)
- Página Backups frota + menu (Fase 5)
- Conta separada de Sessões (Fase 6)
- Adoção StatusBadge/DataTable nas pages (Fase 8)

---

## 11. Build e deploy

```bash
cd apps/web && npm run build   # OK
cd /Dados/Monitor-Pfsense && docker compose up -d --build
```

---

## 12. Testes manuais (checklist)

- [ ] Superadmin — todos os grupos visíveis
- [ ] Admin sem `users.view` — sem Usuários/Permissões
- [ ] Client — sem Administração
- [ ] Active state `/nodes/[id]`, `/admin/usuarios`
- [ ] 1366×768 — sidebar colapsada, sem scroll horizontal
- [ ] 1920×1080 — layout equilibrado

---

## 13. Hotfix 0.2.9 (2026-06-09)

**Sintoma:** sidebar visível; área principal vazia (sem header, breadcrumbs ou conteúdo).

**Causa:** `.glass-panel { width: 100% }` vinha depois de `.app-sidebar` em `globals.css` e a sidebar ocupava 100% da largura do flex row; `overflow-x-hidden` no shell cortava `.app-main-column`.

**Correção:** reordenar regras — `.app-sidebar` / `.app-sidebar--collapsed` após `.glass-panel`.
