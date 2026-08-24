# 169 — Tema claro completo do painel

**Data:** 2026-08-20  
**Versão:** painel **1.11.0** (API e package inalterados)

## Objetivo

Oferecer tema claro operacional (SystemUp NOC) com alternância Claro / Escuro / Sistema, sem alterar contratos, RBAC, sessão ou comportamento das telas. O tema escuro permanece visualmente equivalente.

## O que entrou

- Tokens semânticos em `apps/web/app/globals.css` (`data-theme="dark" | "light"`).
- Paletas `slate` / `cyan` / `emerald` / `amber` / `rose` / `panel` mapeadas a canais CSS no Tailwind.
- `ThemeProvider` + `ThemeToggle` (radiogroup acessível) no header autenticado e no header do login.
- Script anti-FOUC no `<head>` (`mp-theme-preference`); padrão sem chave = escuro; Sistema respeita `prefers-color-scheme`.
- Design system (`Button`, `Badge`, `Alert`, `Card`, `DataTable`, `PageSection`, `StatusBadge`) e chrome (shell, sidebar, header, footer, login) nos tokens.
- Overlay de modal via `.theme-overlay` (não usa `bg-slate-950/80`).
- `docs/SISTEMA-VISUAL-PAINEL.md` atualizado para os dois temas.

## Sem alteração de contrato

- Nenhuma rota, Server Action, permissão, cookie de sessão ou texto de negócio.
- `localStorage` existente (`sidebar-collapsed`) intocado; só a chave visual `mp-theme-preference`.

## Validação

- `cd apps/web && npm run build`
- Deploy: `docker compose up -d --build`
- Inspeção humana recomendada nas rotas `/login`, `/dashboard`, `/nodes`, detalhe, `/backups`, `/alerts`, `/admin`, `/admin/tecnicos`, `/audit`, `/conta` nos dois temas.
