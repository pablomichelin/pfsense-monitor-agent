# 164 — Exclusão real do cadastro de técnicos

**Data:** 2026-08-01  
**Versões:** API **`0.10.4`** · painel **`1.10.10`** · package sem alteração

## Motivo

Ao “excluir” um técnico, o sistema fazia soft-delete (`status = revoked`). A matriz em `/admin/tecnicos` listava todos e os removidos continuavam aparecendo como **Removido do cadastro**.

## Comportamento novo

1. `DELETE /api/v1/technicians/:id` **apaga de verdade** o registro no PostgreSQL (e as linhas de `technician_node_accounts` ligadas).
2. **Não** remove o usuário nos pfSense — offboarding nos firewalls continua na aba Excluir/Revogar.
3. Listagem `GET /api/v1/technicians` passa a retornar só **ativos** por padrão (`?status=all` ou `?status=revoked` se precisar).
4. Matriz `/admin/tecnicos` carrega apenas ativos.
5. Limpeza operacional: técnicos já soft-deletados (Hotspot / Osmarildo) foram removidos do banco nesta entrega.

Auditoria: ação `technician.registry_delete` (substitui o efeito prático de `technician.registry_revoke`).

## UI

- Botão **Excluir do cadastro** com texto esclarecendo que some da matriz/listas.
