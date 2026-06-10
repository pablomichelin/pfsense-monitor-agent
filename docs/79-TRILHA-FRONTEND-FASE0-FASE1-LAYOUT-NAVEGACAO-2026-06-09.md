# Trilha executável — Front-end Fase 0 + Fase 1 (layout e navegação)

**Data:** 2026-06-09  
**Status:** pronta para execução  
**Plano mestre:** `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md`  
**Matriz RBAC (referência):** `23-matriz-permissoes-e-escopo-rbac-2026-06-09.md`

## Objetivo

Checklist operacional para implementar fundação UI + sidebar/header/breadcrumbs **sem** mexer em Dashboard, Firewalls, detalhe, backup ou backend.

## Versão alvo

- Painel web: `0.2.7` → `0.2.8` (patch)
- API: sem bump

---

## Pré-voo (antes de codar)

- [ ] Ler `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md` completo
- [ ] Confirmar painel em `0.2.7` (`apps/web/package.json`)
- [ ] `git status` — working tree limpo ou branch dedicada
- [ ] Stack local ou docker acessível para validação final

---

## Bloco A — Fase 0: `components/ui/`

### A1. Tokens (`globals.css` / `tailwind.config.ts`)

- [ ] `--sidebar-width`, `--sidebar-width-collapsed`, `--header-height`
- [ ] Classe utilitária `.app-layout` (flex row) se necessário
- [ ] Não remover tokens existentes (`--app-shell-width`, etc.)

### A2. Button

- [ ] Criar `components/ui/button.tsx`
- [ ] Variantes: primary, secondary, ghost, danger, danger-outline
- [ ] Tamanhos: sm, md
- [ ] Props: `loading`, `disabled`, `type`, `className`
- [ ] Usar `cn()` helper ou concat simples (sem dependência nova pesada)

### A3. Badge + StatusBadge

- [ ] `badge.tsx` — neutral, info, success, warning, danger
- [ ] `status-badge.tsx` — domínios firewall + backup; labels PT-BR

### A4. Alert + Card + PageSection

- [ ] `alert.tsx` — success, error, warning, info
- [ ] `card.tsx` — glass-panel padronizado
- [ ] `page-section.tsx` — title, description, actions slot

### A5. Build intermediário

```bash
cd apps/web && npm run build
```

- [ ] Build sem erro

---

## Bloco B — Fase 1: layout

### B1. `route-policy.ts`

- [ ] Adicionar tipo `NavGroup.id`: `'operation' | 'administration' | 'account'`
- [ ] Labels PT-BR: Operação, Administração, Conta; Instalação; Usuários; Permissões
- [ ] Mover item sessão/conta para grupo `account`
- [ ] **Não** alterar condições `permissions.includes(...)`
- [ ] **Não** adicionar item Backups

### B2. Sidebar (`app-sidebar.tsx`)

- [ ] Client component; recebe `groups: NavGroup[]`
- [ ] Toggle colapsar/expandir; persistência `localStorage` opcional (`sidebar-collapsed`)
- [ ] Item ativo: mesma lógica `getActiveHref` de `app-nav.tsx`
- [ ] Estilo: borda esquerda cyan quando ativo; ícones SVG inline simples (opcional)
- [ ] Grupos com label mono uppercase
- [ ] Sair no rodapé da sidebar (form logout) — opcional se já no header

### B3. Header (`app-header.tsx`)

- [ ] Botão toggle sidebar
- [ ] Slot breadcrumbs
- [ ] Email usuário truncado
- [ ] Botão Sair (form `logoutAction`)

### B4. Breadcrumbs (`breadcrumbs.tsx`)

- [ ] Mapa pathname → segmentos (ver plano 24)
- [ ] `/nodes/[uuid]` → “Detalhe do firewall”
- [ ] Login: omitir ou mínimo

### B5. `layout.tsx`

- [ ] Remover nav horizontal (`AppNav` no header)
- [ ] Estrutura: sidebar + coluna (header + main + footer)
- [ ] Login: sem sidebar (session null)
- [ ] Manter fontes, footer versão, `glass-panel` no header

### B6. Limpeza

- [ ] `app-nav.tsx`: remover uso ou reexportar helpers para sidebar
- [ ] Verificar nenhuma referência quebrada

### B7. Piloto UI (opcional, baixo risco)

- [ ] `login/page.tsx` — botão submit via `Button` primary (opcional)
- [ ] Header logout via `Button` secondary/ghost

---

## Bloco C — Documentação e versionamento

- [ ] Bump `apps/web/package.json` → `0.2.8`
- [ ] `LEITURA-INICIAL.md` — bloco trilha UX Fase 0+1
- [ ] `00_inicio.md` — referência doc 24
- [ ] `docs/00-INDICE-OPERACIONAL.md`
- [ ] `docs/HISTORICO-E-LINHA-DO-TEMPO.md` — 1–3 bullets
- [ ] Criar `docs/80-ENTREGA-FRONTEND-FASE0-FASE1-LAYOUT-2026-06-09.md`

---

## Bloco D — Build e deploy

```bash
cd apps/web && npm run build
cd /opt/Monitor-Pfsense && docker compose up -d --build
```

- [ ] `/healthz` ok
- [ ] Painel carrega login e dashboard
- [ ] Rodapé mostra `v0.2.8`

---

## Testes manuais (marcar na entrega doc 80)

### Permissões

| Perfil | Operação | Admin | Conta |
|--------|----------|-------|-------|
| superadmin | todos itens | todos | sim |
| admin (sem users.view) | sim | sem Usuários/Permissões | sim |
| client | Dashboard, Firewalls | oculto | sim |

### Rotas active state

- [ ] `/dashboard` → Dashboard ativo
- [ ] `/nodes` e `/nodes/[id]` → Firewalls ativo
- [ ] `/admin/usuarios` → Usuários ativo
- [ ] `/sessions` → Minha conta ou Sessões ativo

### Resoluções

- [ ] 1366×768 — sidebar colapsada ok; sem scroll horizontal body
- [ ] 1920×1080 — layout equilibrado
- [ ] Ultrawide — conteúdo não “preso” indevidamente

### Regressão

- [ ] Dashboard carrega tabela (conteúdo inalterado)
- [ ] Detalhe firewall abre; backup section funciona
- [ ] Logout funciona
- [ ] Middleware redireciona sem permissão

---

## Relatório curto pós-implementação (template doc 80)

1. Arquivos alterados/criados  
2. Componentes UI criados  
3. Mudanças visuais  
4. Sidebar × permissões  
5. Breadcrumbs — mapa implementado  
6. Como validar no navegador  
7. Riscos residuais  
8. Deferidos para Fase 2+

---

## Fora de escopo — não fazer nesta trilha

- Dashboard, nodes, node detail, alerts, bootstrap, audit, admin page content
- Rota `/backups`
- Alteração API/middleware/server actions
- Refatorar páginas para StatusBadge/DataTable
