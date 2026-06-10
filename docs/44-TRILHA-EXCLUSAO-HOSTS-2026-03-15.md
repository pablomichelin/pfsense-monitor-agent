# Trilha de Exclusão de Hosts — Monitor-Pfsense

**Data:** 2026-03-15  
**Status:** Implementada e documentada  
**Versões:** Painel 0.1.5, API 0.1.1, Package 0.2.0 (inalterado)

---

## 1. Resumo executivo

Trilha **nova** para permitir exclusão de hosts (nodes) já cadastrados no sistema. Escopo: exclusão individual, exclusão em lote, confirmação obrigatória, RBAC admin/superadmin, auditoria persistente e validação.

---

## 2. Requisitos atendidos

| Requisito | Status |
|-----------|--------|
| Exclusão individual de host | ✅ |
| Exclusão em lote | ✅ |
| Confirmação obrigatória antes da remoção | ✅ |
| RBAC admin/superadmin | ✅ |
| Auditoria (actor, target_id, target_name, node_uid, mode, ids, timestamp) | ✅ |
| Documentação | ✅ |
| Validação | ✅ |

---

## 3. Escopo implementado

### 3.1 API

- **DELETE** `/api/v1/admin/nodes/:id` — exclusão individual
- **POST** `/api/v1/admin/nodes/delete-batch` — exclusão em lote atômica (body: `{ ids: string[] }`)

Comportamento do lote:
- Validação de todos os IDs antes de qualquer exclusão
- Transação: auditoria + deleteMany
- Tudo ou nada (atômico)

### 3.2 Auditoria

Registros em `audit_logs` com:
- `action`: `admin.node.delete`
- `target_type`: `node`
- `target_id`: id do node (individual) ou primeiro id (batch)
- `metadata_json`:
  - **single:** `{ mode: "single", node_uid, target_name }`
  - **batch:** `{ mode: "batch", ids: [...], node_uids: [...], target_names: [...] }`

A auditoria **não** tem FK para Node, portanto persiste após a exclusão em cascata.

### 3.3 Frontend

- **Inventário (/nodes):**
  - Checkboxes por linha (admin/superadmin)
  - "Selecionar todos"
  - Botão "Excluir selecionados (N)"
  - Botão "Excluir" por linha
  - Modal de confirmação individual (host, node_uid)
  - Modal de confirmação em lote (quantidade, lista de hosts)

- **Detalhe do node (/nodes/[id]):**
  - Botão "Excluir host" (admin/superadmin)
  - Modal de confirmação (host, node_uid)

- Mensagens de feedback: `deleted=1`, `deleted_batch=N`, `delete_error=...`

---

## 4. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `apps/api/src/admin/admin.controller.ts` | DELETE nodes/:id, POST nodes/delete-batch |
| `apps/api/src/admin/admin.service.ts` | deleteNode, deleteNodesBatch |
| `apps/api/src/admin/dto/delete-nodes-batch.dto.ts` | **Novo** |
| `apps/api/package.json` | versão 0.1.0 → 0.1.1 |
| `apps/web/app/nodes/page.tsx` | NodesTableWithDelete, feedback, canDelete |
| `apps/web/app/nodes/[id]/page.tsx` | DeleteNodeButton |
| `apps/web/components/delete-node-button.tsx` | **Novo** |
| `apps/web/components/nodes-table-with-delete.tsx` | **Novo** |
| `apps/web/lib/api.ts` | deleteNode, deleteNodesBatch, method DELETE |
| `apps/web/lib/admin.ts` | deleteNodeAction, deleteNodesBatchAction |
| `apps/web/package.json` | versão 0.1.4 → 0.1.5 |
| `apps/web/app/layout.tsx` | footer v0.1.5 |

---

## 5. Validação

### 5.1 Exclusão individual

1. Login como admin/superadmin
2. Acessar `/nodes`
3. Clicar em "Excluir" em uma linha OU abrir o detalhe e clicar em "Excluir host"
4. Confirmar no modal (verificar host e node_uid)
5. Host deve sumir do inventário; mensagem "Host excluído com sucesso"
6. Verificar em `/audit` que existe evento `admin.node.delete` com mode=single

### 5.2 Exclusão em lote

1. Login como admin/superadmin
2. Acessar `/nodes`
3. Selecionar 2+ hosts
4. Clicar em "Excluir selecionados (N)"
5. Confirmar no modal (verificar quantidade e lista)
6. Hosts devem sumir; mensagem "N host(s) excluídos com sucesso"
7. Verificar em `/audit` evento `admin.node.delete` com mode=batch, ids, node_uids

### 5.3 RBAC

1. Login como operator ou readonly
2. Acessar `/nodes` — não devem aparecer checkboxes nem botão Excluir
3. Acessar `/nodes/[id]` — não deve aparecer "Excluir host"
4. Tentativa direta de `DELETE /api/v1/admin/nodes/:id` ou `POST .../delete-batch` deve retornar 403

### 5.4 Atualização do inventário

Após exclusão, a lista de firewalls deve refletir a remoção imediatamente (redirect com revalidação).

### 5.5 Não regressão

- Cadastro, bootstrap, dashboard e demais fluxos inalterados
- **smoke-admin-operations:** Passo [13/13] adicionado para validar exclusão individual. Se o smoke falhar em passos anteriores (ex.: rekey), trata-se de falha pré-existente documentada em doc 43. A validação manual conforme 5.1–5.4 permanece recomendada.

---

## 6. Comandos de build e deploy

```bash
docker compose build api web
docker compose up -d api web
```

---

## 7. O que NÃO foi implementado (escopo explícito)

- Soft delete
- Restauração de hosts excluídos
- Filtro de excluídos
- Confirmação por digitação do node_uid

---

## 8. Referências

- `docs/43-ENCERRAMENTO-TRILHA-HOMOLOGACAO-ALINHAMENTO-PACKAGE-2026-03-15.md` — trilha anterior
- `CORTEX.md` — regras do projeto
- `00_inicio.md` — ponto de continuidade
