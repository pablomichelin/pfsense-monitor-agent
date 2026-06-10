# Trilha: Deleção Real de Clientes e Saneamento da Listagem

**Data:** 2026-03-15  
**Status:** Implementado  
**Versões:** Painel 0.1.16, API 0.1.6, Package 0.2.0 (inalterado)

---

## 1. Objetivo

Implementar deleção real de clientes e saneamento da listagem de clientes órfãos/antigos. A tela `/admin/clientes` ainda exibia muitos clientes antigos (ex.: "Admin Smoke Updated ...") com 0 firewalls e status active, sem ação para removê-los.

Regra: a tela deve permitir **deletar** cliente; se tiver 0 firewalls, delete direto com confirmação; se tiver 1+ firewalls, bloquear com mensagem clara. Após deletar, o cliente deve sumir da listagem operacional.

---

## 2. O que foi implementado

### 2.1 Backend

- **Endpoint:** `DELETE /api/v1/admin/clients/:id`
- **AdminService.deleteClient(clientId, actorId?, actorIp?):**
  - Valida existência do cliente.
  - Conta firewalls (nodes) associados via sites.
  - Se `nodeCount > 0`: lança `ConflictException` com mensagem:  
    `Cliente possui N firewall(s) vinculado(s). Remova os firewalls antes de excluir o cliente.`
  - Se `nodeCount === 0`: registra auditoria (`admin.client.delete`), deleta o cliente com `prisma.client.delete`. O cascade do Prisma remove os sites do cliente (sites sem nodes).
  - Retorna `{ ok: true, client_id }`.
- **AdminController:** rota `@Delete('clients/:id')` chamando `deleteClient`.

### 2.2 Frontend

- **API:** `deleteClient(id)` em `lib/api.ts` (DELETE sem body, csrfProtected).
- **Server action:** `deleteClientAction(formData)` em `lib/admin.ts`: chama `deleteClient`, revalida `/admin`, `/admin/clientes`, `/nodes`, `/dashboard`, `/bootstrap`, redireciona com `section=client-delete` e `status`/`message`.
- **Página /admin/clientes:**
  - Por cliente com **0 firewalls:** botão **"Deletar cliente"** (componente `ClientDeleteButton`).
  - Confirmação antes de excluir: `Excluir o cliente "NOME"? Nao sera possivel desfazer.`
  - Por cliente com **1+ firewalls:** texto *"Remova os firewalls antes de excluir o cliente."* (sem botão de deletar).
  - Mensagem de sucesso/erro após redirect via `AdminSectionMessage` com `section="client-delete"`.
- **Componente ClientDeleteButton** (`components/client-delete-button.tsx`): client component com botão que chama `deleteClientAction` com `FormData` (client_id, returnTo), confirmação e estado de pending.

### 2.3 Listagem

- getFilters continua retornando apenas clientes ativos; clientes deletados são removidos do banco e deixam de aparecer.

---

## 3. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `apps/api/src/admin/admin.service.ts` | `deleteClient()` com validação de node count, auditoria e delete. |
| `apps/api/src/admin/admin.controller.ts` | `@Delete('clients/:id')` e chamada a `deleteClient`. |
| `apps/web/lib/api.ts` | `deleteClient(id)`. |
| `apps/web/lib/admin.ts` | `deleteClientAction(formData)` e redirect com section=client-delete. |
| `apps/web/app/admin/clientes/page.tsx` | Botão Deletar (0 firewalls), texto bloqueio (1+), `ClientDeleteButton`, `AdminSectionMessage` client-delete. |
| `apps/web/components/client-delete-button.tsx` | **Novo** — botão com confirmação e chamada à server action. |
| `apps/web/package.json` | 0.1.15 → 0.1.16. |
| `apps/api/package.json` | 0.1.5 → 0.1.6. |
| `apps/web/app/layout.tsx` | Footer v0.1.16. |

---

## 4. Versões

| Componente | Versão |
|------------|--------|
| **Painel** | 0.1.15 → **0.1.16** |
| **API** | 0.1.5 → **0.1.6** |
| **Package pfSense** | 0.2.0 (inalterado) |

---

## 5. Validação recomendada

1. **Cliente com 0 firewalls:** Criar um cliente de teste sem firewall (ou usar um existente com 0 firewalls). Clicar em "Deletar cliente", confirmar. O cliente deve sumir da listagem e a mensagem de sucesso deve aparecer.
2. **Cliente com 1+ firewalls:** Verificar que não há botão "Deletar cliente" e que aparece o texto "Remova os firewalls antes de excluir o cliente."
3. **Erro controlado (opcional):** Se no futuro houver outro caminho que chame o DELETE para cliente com firewalls, a API deve retornar 409 com a mensagem sobre firewalls vinculados.

---

## 6. Referências

- `docs/57-TRILHA-SEMANTICA-DELECAO-E-SANEAMENTO-DADOS-2026-03-15.md`
- `00_inicio.md`, `LEITURA-INICIAL.md`, `CORTEX.md`, `00-README.md`
