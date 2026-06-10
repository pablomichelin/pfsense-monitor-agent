# Auditoria visual e técnica — Refatoração UI (2026-03-14)

## 1. Estrutura atual do frontend

- **Stack:** Next.js 15 (App Router), React 19, Tailwind CSS
- **Fontes:** Space Grotesk (display), IBM Plex Mono (labels/dados)
- **Layout base:** `layout.tsx` — container `max-w-7xl`, `px-4 py-6 sm:px-6 lg:px-8`; header + main + footer
- **Deploy:** Docker — `web.Dockerfile` faz build estático (`npm run build`), standalone output; **sem bind mount** — mudanças exigem `docker compose build web` + `up -d`
- **Componentes reutilizados:** AppNav, PageHero, RealtimeRefresh, AdvancedSection, CopyButton
- **Páginas:** login, dashboard, nodes, alerts, bootstrap, sessions, admin, audit

## 2. Tokens visuais existentes

- **Cores:** panel.bg/soft/card/line; signal (online, degraded, offline, maintenance, unknown); slate, cyan, emerald, amber, rose
- **glass-panel:** gradiente, borda slate, sombra, backdrop-filter
- **status-dot:** 0.75rem, border-radius full, box-shadow
- **background:** html/body com gradientes radiais; grid 32px

## 3. Problemas identificados

| Área | Problema |
|------|----------|
| **Header** | Branding em 3 linhas (eyebrow + título + subtítulo) ocupa espaço; nav e email em flex-wrap quebram mal; sensação de “barra improvisada” |
| **Hierarquia** | Sem distinção clara entre hero, KPIs e conteúdo secundário; stats do hero competem com cards |
| **Grid** | max-w-7xl ok; gaps variam (4, 6); falta ritmo vertical consistente |
| **Tipografia** | tracking 0.2em/0.28em em labels; inconsistency; eyebrow muito espaçado |
| **Cards** | Mistura rounded-2xl/rounded-3xl; padding p-5/p-6 inconsistente; alerts usa rounded-3xl e tracking diferente |
| **Inputs/botões** | Altura implícita (py-3, py-2.5); sem sistema explícito |
| **Tabelas** | OK em estrutura; th min-w ajudam; mas badges podem espremer |
| **Login** | Duas colunas iguais; bloco institucional grande; falta composição premium |
| **Nav** | min-w-[7rem] em links; em telas médias 6 itens podem quebrar em 2 linhas de forma desordenada |
| **Entrega** | Docker não rebuilda automaticamente; ciclo deve incluir `docker compose build web` e `up -d` |

## 4. O que pode ser reaproveitado

- Tema dark/blue (panel, signal, glass-panel)
- Fontes Space Grotesk e IBM Plex Mono
- PageHero como estrutura (ajustar tipografia e densidade)
- Badges de status (tones)
- RealtimeRefresh, AdvancedSection (manter)
- Estrutura de rotas e dados (não mexer)

## 5. Decisões de sistema visual ✅ Aplicadas

Implementado em 2026-03-14. Ver `docs/29-entrega-refatoracao-visual-2026-03-14.md` e `docs/SISTEMA-VISUAL-PAINEL.md`.

Aplicar:

- **Container:** max-w-6xl (conteúdo mais focado) ou manter 7xl
- **Section gap:** 8 (2rem) uniforme
- **Card:** padding 6, radius xl (1rem), glass-panel
- **KPI card:** min-h-28 (7rem), mesmo padding e radius
- **Input/select/button:** h-11, rounded-lg
- **Nav link:** h-10, px-4, rounded-lg (não pill)
- **Label/eyebrow:** text-xs uppercase tracking-wider (0.05em), opacity-70
- **Header:** branding em 1–2 linhas compactas; nav em linha horizontal; área usuário alinhada
