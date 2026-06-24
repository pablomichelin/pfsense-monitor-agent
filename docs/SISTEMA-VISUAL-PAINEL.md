# Sistema visual do painel Monitor-Pfsense

**Versão:** 0.1.2 (2026-06-24)  
**Referência:** Este documento define o padrão visual a ser mantido em novas telas e componentes.

---

## Princípio

O painel segue tema **dark navy/blue tech**, com aparência **premium, limpa e operacional**. Novos componentes devem respeitar o sistema abaixo para manter coesão visual.

---

## Tokens base

Definidos em `apps/web/app/globals.css`:

| Token | Valor | Uso |
|-------|-------|-----|
| `--app-max-w` | 80rem | Largura máxima da aplicação |
| `--section-gap` | 2rem | Espaço vertical entre seções |
| `--card-radius` | 1rem | Border radius dos cards |
| `--card-padding` | 1.5rem | Padding interno dos cards |
| `--input-h` | 2.75rem | Altura de input/select/botão |
| `--nav-h` | 2.5rem | Altura dos itens de navegação |
| `--label-tracking` | 0.08em | Tracking dos labels |

---

## Layout

| Elemento | Classes Tailwind |
|----------|------------------|
| Container principal | `max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8` |
| Container login | `max-w-4xl mx-auto` |
| Gap entre seções | `space-y-8` |
| Grid de conteúdo | `grid gap-6` (ou `gap-4` para KPIs) |

---

## Header / Navbar

| Elemento | Especificação |
|----------|---------------|
| Header | `glass-panel rounded-xl px-6 py-3` |
| Branding | Uma linha: `SystemUp NOC · Monitor-Pfsense` |
| Eyebrow | `font-mono text-[10px] uppercase tracking-wider text-cyan-400/90` |
| Título | `font-display text-lg font-semibold tracking-tight text-slate-50` |
| Item de nav | `h-10 rounded-lg min-w-[5.5rem] px-4` |
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

- Form container: `glass-panel rounded-xl p-6`
- Inputs/selects: `h-11 rounded-lg border border-slate-600/80`
- Gap entre campos: `xl:gap-4`
- Botão "Aplicar/Filtrar": `h-11 rounded-lg bg-cyan-500`

---

## Tabelas

- Container: `glass-panel overflow-hidden rounded-xl`
- Header: `border-b border-slate-800 bg-slate-950/40 text-slate-400`
- Células: `px-4 py-4` (th e td)
- Linhas: `border-b border-slate-900/80 hover:bg-slate-950/20`

---

## Entrega

Após alterações visuais no frontend:

1. `cd apps/web && npm run build`
2. `docker compose build web`
3. `docker compose up -d web`

Sem bind mount; o container usa a imagem rebuildada.

---

## Referências

- Entrega refatoração: `docs/29-entrega-refatoracao-visual-2026-03-14.md`
- Auditoria original: `docs/28-auditoria-visual-refatoracao-2026-03-14.md`
