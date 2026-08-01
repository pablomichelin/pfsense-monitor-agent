# Sistema visual do painel Monitor-Pfsense

**Versão:** 0.1.3 (2026-08-01)  
**Referência:** Este documento define o padrão visual a ser mantido em novas telas e componentes.

---

## Princípio

O painel segue tema **dark navy/blue tech**, com aparência **premium, limpa e operacional**. Novos componentes devem respeitar o sistema abaixo para manter coesão visual.

---

## Tokens base

Definidos em `apps/web/app/globals.css`:

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

---

## Layout (shell real)

O shell autenticado **não** usa mais `max-w-7xl` + nav horizontal como container principal. O layout canônico é:

| Elemento | Especificação |
|----------|---------------|
| Shell | `.app-shell` — `width: var(--app-shell-width)`, `padding-inline: var(--app-gutter)` |
| Página | `.app-page` — largura total da área de conteúdo (ao lado da sidebar) |
| Sidebar | `15rem` expandida / `4rem` colapsada |
| Header | breadcrumbs + ações do usuário (não é mais a nav horizontal antiga) |
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
| Eyebrow | `font-mono text-[10px] uppercase tracking-wider text-cyan-400/90` |
| Botão secundário | `h-10 rounded-lg border border-slate-600/80` |
| Email usuário | `max-w-[12rem] truncate rounded-lg` |

---

## Cards e painéis

| Tipo | Classes |
|------|---------|
| Card genérico | `glass-panel rounded-xl p-6` |
| KPI card | `glass-panel min-h-28 rounded-xl p-6` |
| Label do KPI | `font-mono text-xs uppercase tracking-wider text-slate-500` |
| Valor do KPI | `font-display text-3xl font-semibold text-white` |

---

## Formulários

| Elemento | Classes |
|----------|---------|
| Input | `h-11 rounded-lg border border-slate-600/80 bg-panel-soft px-4` |
| Select | `h-11 rounded-lg border border-slate-600/80 bg-panel-soft px-4` |
| Botão primário | `h-11 rounded-lg bg-cyan-500 px-5` |
| Botão secundário | `h-11 rounded-lg border border-slate-600/80 px-5` |
| Label | `text-sm font-medium text-slate-300` |

---

## Badges / Chips

| Tipo | Classes |
|------|---------|
| Badge padrão | `rounded-md border px-2.5 py-0.5 font-mono text-xs` |
| Tones | `border-*-500/30 bg-*-500/10 text-*-200` (emerald, amber, rose, cyan) |

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
| Eyebrow | `font-mono text-xs uppercase tracking-wider text-cyan-400/90` |
| Título | `font-display text-2xl sm:text-3xl font-semibold text-white` |
| Descrição | `text-sm leading-relaxed text-slate-400` |
| Stats | `rounded-lg border px-4 py-2.5` + toneClass |

---

## Filtros

- Inventário (`/nodes`): barra compacta em `<details>` nativo; `open` por padrão só com filtro na URL; summary com contagem e chips curtos.
- Inputs/selects: `h-11 rounded-lg border border-slate-600/80`
- Gap entre campos: `xl:gap-4`
- Botão "Aplicar/Filtrar": `h-11 rounded-lg bg-cyan-500`

---

## Tabelas

- Primitivo: `DataTable` (`apps/web/components/ui/data-table.tsx`) com `dataTableHeadClassName` / `dataTableRowClassName`
- Container: `Card` + `overflow-x-auto` (via `DataTable`)
- Header: `border-b border-slate-800 bg-slate-950/40 text-slate-400`
- Células (densidade inventário P0): `px-3 py-2.5` (th e td)
- Nome de firewall (inventário): `text-sm font-medium text-white`
- Linhas: `border-b border-slate-900/80 hover:bg-slate-950/20`

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

- Entrega despoluição P0: `docs/162-ENTREGA-UX-DESPOLUICAO-P0-INVENTARIO-2026-08-01.md`
- Plano UX 161: `docs/161-PLANO-UX-DESPOLUICAO-PAINEL-OPERADOR-2026-08-01.md`
- Entrega refatoração: `docs/29-entrega-refatoracao-visual-2026-03-14.md`
- Auditoria original: `docs/28-auditoria-visual-refatoracao-2026-03-14.md`
