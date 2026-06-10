# 24. Plano de execução — Fase 0 + Fase 1: fundação UI e layout com sidebar

Data: `2026-06-09`  
Status: `encerrado` — ver `docs/88-ENCERRAMENTO-ROADMAP-UX-FASE0-FASE8-2026-06-09.md`  
Próximo passo operacional: `docs/79-TRILHA-FRONTEND-FASE0-FASE1-LAYOUT-NAVEGACAO-2026-06-09.md`

## Documentos relacionados

| Documento | Papel |
|-----------|--------|
| `22-plano-mestre-rbac-usuarios-permissoes-escopo-2026-06-09.md` | RBAC e governança (encerrado) |
| `23-matriz-permissoes-e-escopo-rbac-2026-06-09.md` | Matriz role × permissão × escopo |
| `docs/77-ENTREGA-POS-RBAC-UX-LAYOUT-2026-06-09.md` | Entrega anterior de shell fluido e escopo |
| Relatório/wireframes UX (chat 2026-06-09) | Diagnóstico front-end + proposta visual aprovada |

## Objetivo desta trilha

Implementar **somente** a fundação visual (Fase 0) e a nova estrutura de navegação (Fase 1) do painel web Monitor-PfSense / SystemUp NOC, preparando evoluções futuras **sem alterar** fluxos críticos de monitoramento, backup, APIs ou regras de negócio.

## Versões alvo ao encerrar a implementação

| Componente | Versão atual | Versão alvo | Tipo de bump |
|------------|--------------|-------------|--------------|
| API | `0.2.5` | `0.2.5` | **Sem alteração** |
| Painel web | `0.2.7` | `0.2.8` | **patch** — layout/navegação, sem contrato API |

Entrega documental esperada: `docs/80-ENTREGA-FRONTEND-FASE0-FASE1-LAYOUT-2026-06-09.md` (criar ao concluir código).

---

## Escopo autorizado

### Fase 0 — Fundação visual mínima

Criar em `apps/web/components/ui/`:

- `button.tsx`
- `badge.tsx`
- `status-badge.tsx`
- `alert.tsx`
- `page-section.tsx`
- `card.tsx` (wrapper fino sobre `glass-panel`)
- `tooltip.tsx` (opcional — `title` nativo ou wrapper mínimo)

Ajustar tokens se necessário em:

- `apps/web/app/globals.css`
- `apps/web/tailwind.config.ts`

**Uso imediato na Fase 0/1:** aplicar componentes no **layout global** (header, sidebar, breadcrumbs) e, se seguro, em **Login** e **Sessions** como piloto — **sem refatorar** Dashboard, Firewalls, detalhe, admin, alertas, bootstrap, auditoria.

### Fase 1 — Layout e navegação

- Sidebar lateral colapsável
- Header superior enxuto
- Breadcrumbs
- Grupos visuais: **Operação**, **Administração**, **Conta**
- Labels PT-BR no menu
- Estado ativo evidente
- Permissões: mesma lógica de `buildNavGroups` / `hasPermission` / `middleware.ts` / `route-policy.ts`
- Header: usuário logado + sair

---

## Fora de escopo (proibido nesta etapa)

- Backend, APIs, server actions, regras de permissão
- Alteração de Dashboard (`app/dashboard/page.tsx`)
- Alteração de Firewalls (`app/nodes/page.tsx`)
- Alteração de detalhe do firewall (`app/nodes/[id]/page.tsx`)
- Nova página funcional de Backups ou chamada a API inexistente
- Refatoração de Usuários, Permissões, Clientes, Auditoria (exceto herdar layout)
- Remoção de funcionalidades (ex.: manter `/admin` Cadastro)
- Renomear campos de formulários
- Mover `RealtimeRefresh` para header global (depende de `renderedAt` por página)

---

## Decisões fechadas

### 1. Backups no menu

- **Não existe** rota `/backups` hoje.
- **Decisão:** **não exibir** item Backups no menu nesta fase.
- Documentar em `docs/80` e neste plano que Backups entra na **Fase 5** (visão frota), após endpoint agregado ou estratégia front definida.

### 2. Cadastro (`/admin`)

- Permanece no grupo **Administração** para quem tem `clients.create`.
- Label PT-BR: **Cadastro** (provisionamento: cliente, firewall, usuário, token).
- Não renomear rota nesta fase.

### 3. Grupo Conta — Minha conta vs Sessões

- Existe apenas a rota `/sessions` (título da página: “Minha conta”).
- **Fase 1:**
  - Item **Minha conta** → `/sessions`
  - Item **Sessões** → `/sessions` (mesma rota; breadcrumb pode usar segmento “Sessões” quando pathname `/sessions`)
  - **Sair:** no header (form `logoutAction`) e opcionalmente repetido no rodapé da sidebar
- **Fase 6 (futuro):** separar `/conta` (perfil/senha) de `/sessions`.

### 4. RealtimeRefresh

- Permanece **nas páginas** que já o renderizam (Dashboard, Nodes, Alerts, Node detail).
- Header **não** exibe indicador global nesta fase (evita fetch extra ou props inválidas).

### 5. `buildNavGroups`

- **Pode** ser estendido para terceiro grupo `account` e labels PT-BR.
- **Não pode** alterar arrays de permissões que gateiam cada item.
- **Não pode** remover itens existentes (apenas reorganizar grupos e rótulos).

---

## Arquitetura de layout alvo

```
┌─────────────────────────────────────────────────────────────────────────┐
│ HEADER (fixo ~56px)                                                      │
│ [≡ sidebar]  Breadcrumbs…                    user@email  [Sair]         │
├──────────────┬──────────────────────────────────────────────────────────┤
│ SIDEBAR      │ MAIN (app-page)                                           │
│ 240px / 64px │  {children} — páginas existentes intactas               │
│ colapsável   │                                                           │
│              │                                                           │
│ OPERAÇÃO     │                                                           │
│ ADMIN        │                                                           │
│ CONTA        │                                                           │
└──────────────┴──────────────────────────────────────────────────────────┘
│ Footer versão (mantido)                                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### CSS / comportamento sidebar

| Estado | Largura | Comportamento |
|--------|---------|---------------|
| Expandida | `240px` | Ícone + label + badge opcional |
| Colapsada | `64px` | Ícone + `title` tooltip |
| ≤1366px | Colapsada por padrão | Toggle expande overlay ou push |
| ≥1920px | Expandida por padrão | Ajuste via `localStorage` opcional |

Variáveis sugeridas em `globals.css`:

```css
--sidebar-width: 15rem;
--sidebar-width-collapsed: 4rem;
--header-height: 3.5rem;
```

Layout shell: `flex` row (sidebar + coluna main); main `min-w-0 flex-1`; preservar `overflow-x-hidden` no root.

---

## Mapa de navegação (permissões inalteradas)

### Grupo Operação

| Label UI | href | Permissão / regra atual |
|----------|------|-------------------------|
| Dashboard | `/dashboard` | Sempre (autenticado) |
| Firewalls | `/nodes` | Sempre |
| Alertas | `/alerts` | `alerts.view` |
| Instalação | `/bootstrap` | `bootstrap.view` |

### Grupo Administração

| Label UI | href | Permissão / regra atual |
|----------|------|-------------------------|
| Cadastro | `/admin` | `clients.create` |
| Clientes | `/admin/clientes` | `clients.view` |
| Usuários | `/admin/usuarios` | `users.view` |
| Permissões | `/admin/permissoes` | `users.view` |
| Auditoria | `/audit` | `audit.view` |

### Grupo Conta

| Label UI | href | Permissão |
|----------|------|-----------|
| Minha conta | `/sessions` | Sempre |
| Sessões | `/sessions` | Sempre |
| Sair | `logoutAction` (form) | Sempre — sidebar opcional |

### Perfil `client`

- Mesma lógica: vê Operação reduzida (sem Alertas/Instalação se sem permissão); **sem** Administração; Conta intacta.

---

## Breadcrumbs — especificação

Componente: `apps/web/components/breadcrumbs.tsx` (client ou server com pathname).

Fonte de verdade: `usePathname()` + mapa estático de segmentos.

### Mapa de rotas → trilha

| pathname | Breadcrumb |
|----------|------------|
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
| `/login` | *(sem breadcrumb ou só “Entrar”)* |

Regras:

- Último segmento não é link; anteriores são `<Link>`.
- Separador: `›` com `text-slate-500`.
- Fallback nome firewall: **Detalhe do firewall** (sem fetch de API nesta fase).
- Login: layout sem sidebar (sessão ausente).

---

## Design system mínimo — contrato dos componentes

### Button (`components/ui/button.tsx`)

| Prop | Valores |
|------|---------|
| `variant` | `primary` \| `secondary` \| `ghost` \| `danger` \| `danger-outline` |
| `size` | `sm` \| `md` |
| `loading` | boolean — spinner + disabled |
| `disabled` | boolean |

Classes base alinhadas ao tema: primary = `bg-cyan-500 text-slate-950`; danger = rose borders.

### Badge

`neutral` \| `info` \| `success` \| `warning` \| `danger`

### StatusBadge

Domínios: `online` \| `offline` \| `degraded` \| `maintenance` \| `backup-ok` \| `backup-late` \| `backup-failed` \| `backup-never`

Labels PT-BR internos. Usar cores `signal.*` do Tailwind.

### Alert

`success` \| `error` \| `warning` \| `info` — substituível gradualmente em fases futuras.

### PageSection

Props: `title`, `description?`, `actions?` (ReactNode), `children`.

### Card

Wrapper: `glass-panel rounded-xl p-5` padronizado.

---

## Ordem de implementação (chat dedicado)

Executar **sequencialmente**; validar build entre blocos.

### Bloco A — Fase 0 base (≈1ª metade do chat)

1. Tokens CSS (`--sidebar-width`, `--header-height`, utilitários layout)
2. `components/ui/button.tsx`
3. `components/ui/badge.tsx`
4. `components/ui/status-badge.tsx`
5. `components/ui/alert.tsx`
6. `components/ui/card.tsx`
7. `components/ui/page-section.tsx`
8. `components/ui/index.ts` (barrel export opcional)
9. `npm run build` em `apps/web`

### Bloco B — Fase 1 layout (≈2ª metade)

1. Estender `NavGroup` em `route-policy.ts`: id `account`, labels PT-BR, mover “Minha conta” para Conta
2. `components/app-sidebar.tsx` (client — toggle + nav)
3. `components/app-header.tsx` (client — toggle, breadcrumbs slot, user, logout)
4. `components/breadcrumbs.tsx`
5. Refatorar `app/layout.tsx` — sidebar + header; remover `AppNav` horizontal do header
6. Deprecar ou adaptar `components/app-nav.tsx` (lógica active → sidebar)
7. Ajustar `globals.css` / classes shell
8. Piloto opcional: usar `Button` em Login logout/header apenas
9. Bump `apps/web/package.json` → `0.2.8`
10. Atualizar índices + `docs/HISTORICO-E-LINHA-DO-TEMPO.md`
11. Criar `docs/80-ENTREGA-...`
12. `npm run build` + `docker compose up -d --build` na raiz

---

## Arquivos impactados (previsão)

### Novos

| Arquivo |
|---------|
| `apps/web/components/ui/button.tsx` |
| `apps/web/components/ui/badge.tsx` |
| `apps/web/components/ui/status-badge.tsx` |
| `apps/web/components/ui/alert.tsx` |
| `apps/web/components/ui/card.tsx` |
| `apps/web/components/ui/page-section.tsx` |
| `apps/web/components/ui/tooltip.tsx` (opcional) |
| `apps/web/components/app-sidebar.tsx` |
| `apps/web/components/app-header.tsx` |
| `apps/web/components/breadcrumbs.tsx` |
| `docs/80-ENTREGA-FRONTEND-FASE0-FASE1-LAYOUT-2026-06-09.md` |

### Alterados

| Arquivo | Natureza da mudança |
|---------|---------------------|
| `apps/web/app/layout.tsx` | Estrutura shell sidebar+header |
| `apps/web/app/globals.css` | Tokens sidebar/header |
| `apps/web/tailwind.config.ts` | Se novos tokens |
| `apps/web/lib/route-policy.ts` | Grupo Conta + labels PT-BR apenas |
| `apps/web/components/app-nav.tsx` | Removido do layout ou refatorado |
| `apps/web/package.json` | Versão `0.2.8` |
| `LEITURA-INICIAL.md`, `00_inicio.md`, `docs/00-INDICE-OPERACIONAL.md`, `docs/HISTORICO-E-LINHA-DO-TEMPO.md` | Referência trilha |

### Intocados (validar diff)

- `apps/api/**`
- `apps/web/app/dashboard/**`
- `apps/web/app/nodes/**`
- `apps/web/app/alerts/**`
- `apps/web/app/bootstrap/**`
- `apps/web/app/admin/**` (conteúdo das pages)
- `apps/web/app/audit/**`
- `apps/web/middleware.ts` (salvo se impossível — preferir não tocar)
- `apps/web/lib/admin*.ts`, `auth.ts`, `api.ts`

---

## Critérios de aceite

- [x] Header horizontal antigo substituído por header limpo + sidebar
- [x] Sidebar agrupada: Operação, Administração, Conta
- [x] Itens respeitam mesmas permissões que antes
- [x] Item ativo correto em `/nodes/[id]`, `/admin/usuarios`, etc.
- [x] Breadcrumbs nas rotas principais listadas acima
- [x] Componentes UI básicos existem em `components/ui/`
- [x] Sem scroll horizontal na página inteira (1366px)
- [x] Tema dark/cyber/glass preservado
- [x] Build web ok; containers sobem após deploy
- [x] Painel `0.2.8` no rodapé
- [x] Monitoramento e backup sem alteração de código de negócio

---

## Testes manuais obrigatórios

### Superadmin

- Vê Operação + Administração + Conta completos
- Navega: Dashboard, Firewalls, Alertas, Instalação, Cadastro, Clientes, Usuários, Permissões, Auditoria, Sessões
- Active state correto; breadcrumbs coerentes

### Administrador / Técnico (simular permissões reduzidas)

- Itens admin ausentes sem permissão
- Firewalls e Dashboard acessíveis conforme escopo

### Cliente (`client`)

- Sem grupo Administração
- Dashboard/Firewalls conforme escopo

### Resoluções

1366×768 · 1440×900 · 1920×1080 · 2560×1080 (ultrawide)

Checklist visual:

- Header uma linha
- Sidebar não cobre conteúdo permanentemente em desktop
- Tabelas existentes ainda com scroll interno ok

---

## Riscos conhecidos

| Risco | Mitigação |
|-------|-----------|
| Regressão menu/permissão | Diff mínimo em `buildNavGroups`; testar 3 perfis |
| Layout shift em tabelas | `main` com `min-w-0`; sidebar colapsável default em 1366 |
| Hydration mismatch sidebar | Estado colapsado em `useEffect` ou `localStorage` após mount |
| Duplicata Minha conta/Sessões | Documentado; resolver Fase 6 |
| `app-nav.tsx` órfão | Remover import ou manter export para testes |

---

## Próximas fases (fora desta entrega)

| Fase | Conteúdo |
|------|----------|
| 2 | Dashboard enxuto (KPIs + zona quente) |
| 3 | Firewalls inventário (coluna backup/alertas) |
| 4 | Detalhe firewall em abas |
| 5 | Página Backups frota + menu |
| 6 | Usuários lista/drawer; Conta separada; polimento PT-BR |
| 7 | Auditoria filtros amigáveis |
| 8 | Adoção do design system nas pages restantes |

---

## Prompt sugerido para o chat de implementação

Copiar no chat limpo:

```
Implementar Fase 0 + Fase 1 conforme:
- 24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md
- docs/79-TRILHA-FRONTEND-FASE0-FASE1-LAYOUT-NAVEGACAO-2026-06-09.md

Regras: sem backend/API/server actions; sem alterar dashboard/nodes/alerts/admin pages content;
sem rota /backups; bump painel 0.2.8; build + docker compose ao final.
Ordem: Bloco A (ui/) → Bloco B (sidebar/header/breadcrumbs/layout).
```

---

## Histórico deste documento

| Data | Evento |
|------|--------|
| 2026-06-09 | Plano aprovado após wireframes UX; escopo Fase 0+1 fechado |
| 2026-06-10 | Roadmap UX fases 0–8 encerrado; encerramento formal em `docs/88` |
