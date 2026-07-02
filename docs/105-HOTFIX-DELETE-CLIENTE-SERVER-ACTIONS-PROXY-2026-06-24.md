# Hotfix definitivo: Excluir cliente — Server Actions atrás do proxy

**Data:** 2026-06-24  
**Status:** Corrigido  
**Relacionado:** `docs/104-HOTFIX-DELETE-CLIENTE-UI-2026-06-24.md`

---

## Sintoma (persistente após doc 104)

Em `/admin/clientes`, ao clicar **Excluir cliente** e confirmar no modal:

- Modal podia abrir, mas a exclusão não concluía
- UI ficava sem feedback (modal fechava em silêncio ou parecia “travada” em **Processando...**)
- API `DELETE /api/v1/admin/clients/:id` respondia **200** quando chamada diretamente (curl)

O hotfix 104 corrigiu o padrão React (import da action, `redirect()`, botão fora do form), mas **não** o bloqueio do Next.js atrás do nginx.

## Causa raiz real

**Server Actions invocadas do client** (`await deleteClientAction(...)` em `ClientDeleteButton`) passam pelo nginx na porta **8088**.

O nginx enviava `Host` / `X-Forwarded-Host` com `$host` (hostname **sem porta**). O browser envia `Origin: http://127.0.0.1:8088` (com porta).

Next.js 15 rejeita a action:

```text
x-forwarded-host `127.0.0.1` does not match origin `127.0.0.1:8088`
Invalid Server Actions request. (digest 2521181590)
```

Formulários HTML com `action={updateClientAction}` **não** sofrem o mesmo bloqueio. A solução definitiva usa **form POST nativo** para delete (como Salvar), além de corrigir headers do proxy.

## Correção

| Arquivo | Mudança |
|---------|---------|
| `infra/nginx/default.conf` | `Host` e `X-Forwarded-Host` com `$http_host` (preserva `:8088`) |
| `infra/ispconfig/nginx.monitor-pfsense.conf` | Idem no edge `pfs-monitor.systemup.inf.br` |
| `apps/web/next.config.ts` | `experimental.serverActions.allowedOrigins` para hosts conhecidos |
| `apps/web/app/admin/clientes/page.tsx` | Form `<form action={deleteClientAction}>` no Server Component (como Salvar); `ClientDeleteButton` só abre modal e faz `requestSubmit` |
| `apps/web/components/client-delete-button.tsx` | Referencia form por `formId`; sem import de server action no client |

## Deploy

```bash
cd /Dados/Monitor-Pfsense
docker compose build web
docker compose up -d web nginx
# Edge ISPConfig (se aplicável): recarregar vhost com nginx.monitor-pfsense.conf
```

## Teste do usuário

1. **Ctrl+F5** em `/admin/clientes` (limpar JS em cache).
2. Escolha um cliente com **0 firewalls** (ex.: Andos Delapizza).
3. Clique **Excluir cliente** → modal **Excluir cliente** deve abrir.
4. Confirme **Excluir** → redirect com mensagem verde; cliente some da lista.
5. Se ainda falhar, o modal mostra erro em vermelho (não fecha em silêncio).

## Validação automatizada

Playwright (headless) após fix:

- Modal abre no clique
- Confirmação exclui cliente smoke via Server Action
- Logs web sem `Invalid Server Actions request`

---

## Atualização 2026-06-24 (correção definitiva — falha persistia após doc 104/105 originais)

### Sintoma confirmado pelo usuário

Mesmo após hard refresh, **Excluir cliente** (ex.: Andos Delapizza, 0 firewalls) continuava sem concluir.

### Diagnóstico (reprodução real via HTTP, sessão `superadmin`)

- API `DELETE /api/v1/admin/clients/:id` e o **server action invocado via RPC** (`text/plain` + header `Next-Action`) respondem **303 OK** atrás do nginx — proxy/origin **não** era o bloqueio (o `allowedOrigins` do `next.config.ts` já cobre os hosts).
- O padrão que falhava era específico: `<form className="hidden" action={deleteClientAction}>` renderizado no Server Component e disparado por `form.requestSubmit()` de um Client Component separado. Esse caminho (form oculto + `requestSubmit`) não disparava a action de forma confiável.
- A exclusão de **host** (`DeleteNodeButton`) sempre funcionou porque usa o padrão **RPC**: `await deleteNodeAction(id)` importado direto no client.

### Correção definitiva (alinhar ao padrão RPC comprovado)

| Arquivo | Mudança |
|---------|---------|
| `apps/web/lib/admin.ts` | `deleteClientAction(clientId: string, returnTo?)` — assinatura RPC (string), não mais `FormData` |
| `apps/web/components/client-delete-button.tsx` | Importa e chama `await deleteClientAction(clientId, returnTo)` direto (igual a `DeleteNodeButton`); sem `requestSubmit`/form oculto |
| `apps/web/app/admin/clientes/page.tsx` | Removido o `<form>` oculto de delete; `ClientDeleteButton` recebe `clientId`/`clientName`/`returnTo` |

### Validação end-to-end (via nginx :8088)

```text
POST /admin/clientes  Next-Action: 60f574...(deleteClientAction)
-> HTTP 303  x-action-redirect: /admin/clientes?...status=ok&message=Cliente%20excluido
clients(test) : 1 -> 0   # removido
Andos Delapizza: intacto
```

Cliente de teste descartável (`ZZ Delete Repro Test`) criado e excluído na validação; **Andos Delapizza preservado** para o usuário excluir pela UI.
