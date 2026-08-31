# 180 — Densidade: menos espaço entre blocos do painel

**Data:** 2026-08-31  
**Versões:** API **0.11.0** (sem mudança) · painel **1.12.5**

## Problema

O inventário e as demais telas tinham muito ar vertical entre hero, atalhos, filtros, ações e tabela. O padrão era `space-y-8` (2rem) em quase todas as páginas.

## Solução

- Token `--section-gap`: **2rem → 0.75rem** (ajuste extra no mesmo dia: 1rem → 0.75rem).
- Wrappers de página passam a `space-y-section` (seguem o token).
- Shell autenticado: `pt-2 pb-3`.
- `PageSection`: título → conteúdo `space-y-2`.
- `PageHero`: `p-3 sm:p-4`.
- Header público: `mb-8` → `mb-4`.

Não altera cards internos, tabelas, RBAC nem API.

## Arquivos

- `apps/web/app/globals.css`
- `apps/web/components/app-shell-layout.tsx`
- `apps/web/components/ui/page-section.tsx`
- páginas e painéis que usavam `space-y-8` / `space-y-6` de seção
- `docs/SISTEMA-VISUAL-PAINEL.md`
