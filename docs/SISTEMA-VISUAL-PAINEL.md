# Sistema visual do painel Monitor-Pfsense

**Versão:** 0.2.0 (2026-08-20)  
**Referência:** Este documento define o padrão visual a ser mantido em novas telas e componentes.

---

## Princípio

O painel é um NOC operacional SystemUp, **premium, limpo e técnico**. Há dois temas visuais equivalentes em hierarquia, densidade e semântica:

| Tema | Direção |
|------|---------|
| **Escuro** (padrão) | Navy/blue tech — o visual original do produto. Deve permanecer equivalente após qualquer refatoração. |
| **Claro** | Cinza-azulado sóbrio — não infantil, sem branco puro em toda a tela, sem excesso de sombra. |

A fonte de verdade do tema resolvido é o atributo `data-theme="dark" | "light"` no `<html>`. Não espalhar classes `dark:` pela base.

---

## Preferência Claro / Escuro / Sistema

Controle acessível no header (área do usuário) e no header público do login.

| Modo | Comportamento |
|------|----------------|
| **Claro** | Força `data-theme="light"` |
| **Escuro** | Força `data-theme="dark"` |
| **Sistema** | Segue `prefers-color-scheme` e reage a mudanças do SO |

- Persistência: somente `localStorage` na chave `mp-theme-preference` (`light` \| `dark` \| `system`).
- Não altera autenticação, cookies de sessão, `sidebar-collapsed` nem dados de tela.
- Sem preferência gravada, o padrão é **escuro** (preserva o visual atual da frota).
- Script mínimo no `<head>` (`THEME_INIT_SCRIPT` em `apps/web/lib/theme.ts`) aplica o tema **antes da pintura**, evitando flash do tema incorreto.
- `ThemeProvider` hidrata o seletor sem mismatch; o `<html>` usa `suppressHydrationWarning`.
- `prefers-reduced-motion` continua desligando transições e `scroll-behavior`.

O seletor é um `radiogroup` com `aria-label="Tema da interface"`, `aria-checked` visível, Tab no item selecionado e setas / Home / End.

---

## Tokens semânticos

Definidos em `apps/web/app/globals.css` e mapeados em `apps/web/tailwind.config.ts`.

### Layout (independentes de tema)

| Token | Valor | Uso |
|-------|-------|-----|
| `--app-shell-width` | `min(96vw, 1280px)` (escala em breakpoints maiores) | Largura do shell autenticado |
| `--app-gutter` | `1.5rem` (menor em viewports estreitas) | Padding horizontal do shell |
| `--sidebar-width` | `15rem` | Largura da sidebar expandida |
| `--sidebar-width-collapsed` | `4rem` | Largura da sidebar colapsada |
| `--app-max-w` | `80rem` | Token legado / superfícies que ainda referenciam max-width |
| `--section-gap` | `2rem` | Espaço vertical entre seções |
| `--card-radius` | `1rem` | Border radius dos cards |
| `--card-padding` | `1.5rem` | Padding interno dos cards |
| `--input-h` | `2.75rem` | Altura de input/select/botão |
| `--nav-h` | `2.5rem` | Altura dos itens de navegação |
| `--label-tracking` | `0.08em` | Tracking dos labels |
| `--header-height` | `3.5rem` | Altura do header |

### Cor (canais RGB ou valor completo)

| Token / utility | Uso |
|-----------------|-----|
| `--color-canvas` / `bg-canvas` | Fundo da aplicação |
| `--html-bg`, `--body-bg`, `--body-glow`, `--bg-grid` | Decoração (gradiente + grid) |
| `--color-surface` / `bg-surface` | Superfície padrão |
| `--color-surface-soft` / `bg-surface-soft` | Inputs, chips, hover suave |
| `--color-surface-elevated` / `bg-surface-elevated` | Modal, diálogo |
| `--surface-glass` | `.glass-panel` |
| `--color-border` / `border-border` | Borda padrão |
| `--color-border-strong` / `border-border-strong` | Borda mais marcada |
| `--color-fg` / `text-fg` | Texto principal |
| `--color-fg-muted` / `text-fg-muted` | Texto secundário |
| `--color-fg-subtle` / `text-fg-subtle` | Labels, placeholders |
| `--color-primary` / `bg-primary` `text-primary` | Acento SystemUp (ciano) |
| `--color-primary-hover` / `bg-primary-hover` | Hover do acento |
| `--color-on-primary` / `text-on-primary` | Texto sobre botão primário |
| `--color-focus-ring` | Anel de foco |
| `--color-table-head` / `bg-table-head` | Cabeçalho de tabela |
| `--color-table-row` / `bg-table-row` | Linha |
| `--color-table-hover` / `bg-table-hover` | Hover de linha |
| `--color-sidebar` / `--color-header` | Chrome do shell |
| `--color-nav-hover` / `bg-nav-hover` | Hover de navegação |
| `success` / `warning` / `danger` / `info` / `neutral` | Semântica (`-fg`, `-muted`, `-border`) |
| `--overlay-scrim` / `.theme-overlay` | Scrim de modal (não usar `bg-slate-950/80`) |

Paletas `slate`, `cyan`, `emerald`, `amber`, `rose` e `panel` também são canais CSS: no escuro coincidem com o Tailwind original; no claro, tons estruturais (slate alto = superfície clara; `*-100/200/300` de status = texto escuro com contraste AA).

**Não** remapear `white`/`black` globais: `bg-white` permanece branco real (ex.: QR de MFA). Títulos usam `text-fg`.

---

## Contraste e acessibilidade

- Texto e controles devem atingir **WCAG AA** nos dois temas.
- Primária no claro é ciano mais escuro (`#0e7490`) com `on-primary` claro.
- Estados semânticos **não dependem só da cor**: badge + rótulo + (quando couber) `status-dot`.
- Foco visível: anel ciano em `button`/`a`/`input`/`select`/`textarea` (`:focus-visible`).
- Inputs desabilitados: `opacity` + `cursor-not-allowed`.

### Semântica de estado (inequívoca nos dois temas)

| Estado | Cor |
|--------|-----|
| online / sucesso | verde (`success`, `signal-online`) |
| degradado / alerta | âmbar (`warning`, `signal-degraded`) |
| offline / erro / perigo | vermelho/rose (`danger`, `signal-offline`) |
| manutenção / info | azul/ciano (`info`, `signal-maintenance`) |
| desconhecido / neutro | cinza (`neutral`, `signal-unknown`) |

---

## Layout (shell real)

O shell autenticado **não** usa mais `max-w-7xl` + nav horizontal como container principal. O layout canônico é:

| Elemento | Especificação |
|----------|---------------|
| Shell | `.app-shell` — `width: var(--app-shell-width)`, `padding-inline: var(--app-gutter)` |
| Página | `.app-page` — largura total da área de conteúdo (ao lado da sidebar) |
| Sidebar | `15rem` expandida / `4rem` colapsada |
| Header | breadcrumbs + seletor de tema + ações do usuário |
| Gap entre seções | `space-y-8` |
| Grid de conteúdo | `grid gap-6` (ou `gap-4` para KPIs) |
| Container login | `max-w-4xl mx-auto` |

Em viewport de 1440px, após sidebar + gutters, restam ~1152px de conteúdo útil — tabelas densas devem caber sem scroll horizontal nesse alvo.

---

## Header

| Elemento | Especificação |
|----------|---------------|
| Header | `glass-panel` / barra do shell com breadcrumbs |
| Branding | Sidebar / identidade SystemUp NOC · Monitor-Pfsense |
| Eyebrow | `font-mono text-[10px] uppercase tracking-wider text-primary` |
| Botão secundário | `h-10 rounded-lg border border-border` |
| Email usuário | `max-w-[12rem] truncate rounded-lg` |
| Tema | `ThemeToggle` à esquerda do email |

---

## Cards e painéis

| Tipo | Classes |
|------|---------|
| Card genérico | `glass-panel rounded-xl p-6` |
| KPI card | `glass-panel min-h-28 rounded-xl p-6` |
| Label do KPI | `font-mono text-xs uppercase tracking-wider text-fg-subtle` |
| Valor do KPI | `font-display text-3xl font-semibold text-fg` |

---

## Formulários

| Elemento | Classes |
|----------|---------|
| Input | `h-11 rounded-lg border border-border bg-surface-soft px-4` (`formInputClassName`) |
| Select | `h-11 rounded-lg border border-border bg-surface-soft px-4` |
| Botão primário | `Button` variant `primary` — `bg-primary text-on-primary` |
| Botão secundário | `Button` variant `secondary` — `border-border bg-surface-soft` |
| Label | `text-sm font-medium text-fg-muted` |

---

## Badges / Chips

| Tipo | Classes |
|------|---------|
| Badge padrão | `rounded-md border px-2.5 py-0.5 font-mono text-xs` |
| Tones | `Badge` variants `success` / `warning` / `danger` / `info` / `neutral` (tokens `-muted` / `-border` / `-fg`) |

**Não usar** `rounded-full` em badges; preferir `rounded-md`.

### Exceções permitidas para `rounded-full`

| Uso | Exemplo |
|-----|---------|
| Indicador de status (dot) | `.status-dot`, pills com dot interno |
| Spinner de loading | botões, telas de loading |
| Elementos circulares funcionais | avatares, ícones circulares (se aplicável) |

Qualquer outro chip/badge de status ou toggle deve usar `rounded-md` ou `rounded-lg`.

---

## PageHero

| Elemento | Classes |
|----------|---------|
| Container | `glass-panel rounded-xl px-6 py-5 sm:py-6` |
| Eyebrow | `font-mono text-xs uppercase tracking-wider text-primary` |
| Título | `font-display text-2xl sm:text-3xl font-semibold text-fg` |
| Descrição | `text-sm leading-relaxed text-fg-muted` |
| Stats | `rounded-lg border px-4 py-2.5` + toneClass semântico |

---

## Filtros

- Inventário (`/nodes`): barra compacta em `<details>` nativo; `open` por padrão só com filtro na URL; summary com contagem e chips curtos.
- Inputs/selects: `h-11 rounded-lg border border-border`
- Gap entre campos: `xl:gap-4`
- Botão "Aplicar/Filtrar": `Button` primário (`h-11`)

---

## Tabelas

- Primitivo: `DataTable` (`apps/web/components/ui/data-table.tsx`) com `dataTableHeadClassName` / `dataTableRowClassName`
- Container: `Card` + `overflow-x-auto` (via `DataTable`)
- Header: `border-b border-border bg-table-head/70 text-fg-muted`
- Células (densidade inventário P0): `px-3 py-2.5` (th e td)
- Nome de firewall (inventário): `text-sm font-medium text-fg`
- Linhas: `border-b border-border/80 hover:bg-table-hover/60`
- Scroll horizontal preservado; cabeçalho distinguível nos dois temas.

### Colunas canônicas do inventário (`/nodes`)

| Coluna | Notas |
|--------|-------|
| Seleção (checkbox) | Quando há ações de lote permitidas |
| Status | `StatusBadge` |
| Firewall | Nome + badge de criticidade só se `critical`; `InstallationBadge` só se agente não ativo; hostname no `title` |
| Local | Cliente / site |
| Versão pfSense | Mantida (ordena com `sort_by=version`) |
| Pacote | Versão do agente / alvo |
| Último contato | Idade relativa |
| Backup | Badge + idade |
| Alertas | Ausente no perfil `client` |
| Acesso | Botão-ícone ~2.5rem (`remote_access_url`) |

Fora da tabela (sem coluna dedicada): Tags (filtro permanece), Criticidade padrão/lab, Instalação com agente ativo.

Alvo de largura: soma dos `min-w`/`w-` do `<thead>` ≤ 72rem (P0 medido: 61rem com checkbox + alertas).

---

## Entrega

Após alterações visuais no frontend:

1. `cd apps/web && npm run build`
2. Na raiz: `docker compose up -d --build`

Sem bind mount; o container usa a imagem rebuildada. Ver também `.cursor/rules/build-and-deploy.mdc` e `versioning.mdc`.

---

## Referências

- Entrega tema claro: `docs/169-ENTREGA-TEMA-CLARO-PAINEL-2026-08-20.md`
- Entrega despoluição P0: `docs/162-ENTREGA-UX-DESPOLUICAO-P0-INVENTARIO-2026-08-01.md`
- Plano UX 161: `docs/161-PLANO-UX-DESPOLUICAO-PAINEL-OPERADOR-2026-08-01.md`
- Entrega refatoração: `docs/29-entrega-refatoracao-visual-2026-03-14.md`
- Auditoria original: `docs/28-auditoria-visual-refatoracao-2026-03-14.md`
