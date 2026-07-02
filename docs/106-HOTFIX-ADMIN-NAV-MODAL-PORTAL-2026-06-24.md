# Hotfix: modal de exclusão off-screen + navegação admin

**Data:** 2026-06-24  
**Status:** Corrigido  
**Versão painel:** 1.4.0 (web rebuild necessário)

---

## Sintomas

1. Em `/admin/clientes` com listagem longa, o modal **Excluir cliente** escurecia a tela mas o botão **Excluir** ficava fora do viewport (y negativo).
2. Navegação client-side entre rotas `/admin/*` (ex.: usuarios → clientes) não atualizava a URL; rotas fora de admin funcionavam.

## Causa raiz

1. `ConfirmDialog` usava `position: fixed` dentro de `Card` com `glass-panel` (`backdrop-filter`), criando containing block; com card ~8000px o modal ficava deslocado.
2. Segmento `/admin` sem `layout.tsx` próprio + `<main>` persistente no shell impedia remount correto em soft navigation entre páginas admin.

## Correção

| Arquivo | Mudança |
|---------|---------|
| `apps/web/components/confirm-dialog.tsx` | Portal para `document.body`, `z-[100]`, guard SSR |
| `apps/web/components/delete-node-button.tsx` | Migrado para `ConfirmDialog` (mesmo fix de portal) |
| `apps/web/app/admin/layout.tsx` | Layout pass-through do segmento admin |
| `apps/web/components/app-shell-layout.tsx` | `key={pathname}` em `<main>` |
| `apps/web/components/client-delete-button.tsx` | Tratamento de erro com `isRedirectError` |

## Deploy

```bash
cd /Dados/Monitor-Pfsense
docker compose build web
docker compose up -d web
```

## Validação

```bash
node scripts/repro-modal-position.mjs
node scripts/repro-nav-final.mjs
```
