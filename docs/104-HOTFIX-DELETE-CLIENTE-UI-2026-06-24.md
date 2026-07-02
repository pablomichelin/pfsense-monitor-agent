# Hotfix: exclusão de cliente travava na UI

**Data:** 2026-06-24  
**Status:** Corrigido (complemento ao doc 104 — causa adicional de proxy + form no client)
**Versão painel:** 1.4.0 (web rebuild necessário)

---

## Sintoma

Em `/admin/clientes`, ao clicar **Excluir cliente** em clientes smoke (0 firewalls), a tela não respondia: modal não abria ou ficava em **Processando...** sem concluir. A API `DELETE /api/v1/admin/clients/:id` respondia em ~25 ms quando chamada diretamente.

## Causa raiz

Bug **somente no frontend** (Next.js), não na API:

1. **`ClientDeleteButton`** passava a server action como prop (`deleteClientAction={...}`) em vez de importá-la no client component — padrão inconsistente com `DeleteNodeButton` e `AdminUsuariosTabs`, que importam actions diretamente.
2. Uso de **`startTransition(async () => ...)`** — anti-padrão React; a transição não aguarda a Promise, deixando loading/redirect inconsistentes.
3. **`deleteClientAction`** retornava `{ ok, redirectUrl }` + `router.push` manual, em vez de **`redirect()`** como `deleteUserAction` (padrão que já funciona).
4. Botão **Excluir** ficava **dentro** do `<form action={updateClientAction}>` — risco de conflito de eventos entre salvar e excluir.

## Correção

| Arquivo | Mudança |
|---------|---------|
| `apps/web/components/client-delete-button.tsx` | Import direto de `deleteClientAction`; `useState(loading)`; mesmo fluxo de `AdminUsuariosTabs` |
| `apps/web/lib/admin.ts` | `deleteClientAction` usa `redirect()` em sucesso/erro |
| `apps/web/app/admin/clientes/page.tsx` | Form de edição separado; botão Salvar com `form={id}`; delete fora do form |
| `scripts/purge-smoke-test-data.sh` | Inclui códigos `ADM-*-U` (resíduo do smoke admin) |

## Deploy

Hotfix 104 + **105** (proxy + form no Server Component). Rebuild web e reload nginx:

```bash
cd /Dados/Monitor-Pfsense
docker compose build web
docker compose up -d web nginx
```

Ver `docs/105-HOTFIX-DELETE-CLIENTE-SERVER-ACTIONS-PROXY-2026-06-24.md`.

## Como excluir clientes com segurança

1. Abra **Administração → Clientes** (`/admin/clientes`).
2. Verifique **0 firewalls** na linha do cliente (ou remova hosts em **Inventário** antes).
3. Clique **Excluir cliente** → confirme no modal.
4. A página recarrega com mensagem de sucesso; o cliente some da listagem.
5. Clientes com 1+ firewalls **não** exibem o botão — só a mensagem para remover firewalls primeiro.
6. Resíduos de smoke test: `./scripts/purge-smoke-test-data.sh` (não remove clientes reais).

## Teste rápido

```bash
# API (requer login bootstrap)
curl -skS -b cookies.txt -H "x-csrf-token: ..." -X DELETE \
  http://127.0.0.1:8088/api/v1/admin/clients/<uuid>
```
