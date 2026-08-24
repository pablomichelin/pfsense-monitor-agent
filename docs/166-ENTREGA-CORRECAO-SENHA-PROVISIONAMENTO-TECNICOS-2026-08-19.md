# 166 — Correção: senha no provisionamento de técnicos

**Data:** 2026-08-19  
**Versões:** API **0.10.6** · painel **1.10.12** · package **0.5.9**

## Problema reportado

Operador provisionou o técnico **erick** em lote. Comandos retornaram `succeeded`, mas a senha informada (manual ou gerada) não funcionava no login pfSense.

## Causas identificadas

1. **Vários lotes com senhas diferentes** — cada execução com campo de senha vazio gera uma senha nova (`resolveTechnicianPassword`). O operador via só a senha do último lote; firewalls provisionados em lotes anteriores ficaram com outra senha.

2. **“Usuário já existe” não atualizava senha** — reexecução do provisionamento ignorava firewalls onde `erick` já existia, em vez de sincronizar a senha.

3. **Reconciliação quebrada no lote** — `batch-provision` não enviava `account_id` no payload; contas ficavam eternamente em `pending_create` mesmo com comando `succeeded`.

4. **Reentrega de comando sem senha** — após `picked_up`, o controlador remove a senha do `payload_json`; reentregar no heartbeat podia sobrescrever o arquivo 0600 do agente sem senha (race).

5. **Validação insuficiente no agente** — sucesso reportado mesmo se o hash não fosse aplicável (`password_verify`).

## Correções

### API 0.10.6

- **Upsert no lote:** se o usuário já existe no snapshot → enfileira `local_user_set_password` com a mesma senha; senão → `local_user_create`.
- **`account_id` no payload** de lote (create e reset) + reconciliação por `technician_id` + `node_id` como fallback.
- **Não reentregar** comandos `local_user_*` em status `picked_up` (senha já removida do DB).
- **Senha obrigatória** em `validateLocalUserCreatePayload` / `validateLocalUserSetPasswordPayload`.
- **`minAgentVersion` default `0.5.4`** (fix histórico do wrapper `local_user_set_password`).

### Package 0.5.9

- **`assert_password_hash_valid()`** após `apply_local_user_password()` — falha se hash ausente, estrutura `item` aninhada ou `password_verify` falhar.
- **Agente:** não sobrescreve `cmd-payload-*.json` se o arquivo existente tem senha e a reentrega não traz senha.

### Painel 1.10.12

- Texto explicando: uma senha por lote; campo vazio gera senha nova; re-provisionar atualiza senha em usuários existentes.

## Ação operacional para o caso erick

1. Publicar package **0.5.9** na frota (`scripts/release-pfsense-package.sh` + upgrade em lote).
2. No painel, **Provisionar** de novo o **erick** em todos os firewalls desejados, **informando a senha desejada** (não deixar vazio).
3. Anotar a senha exibida uma vez ao final do lote — é a válida em todos os firewalls enfileirados.

## Arquivos alterados

- `apps/api/src/technicians/technicians.service.ts`
- `apps/api/src/technicians/technician-accounts.util.ts`
- `apps/api/src/node-commands/node-commands.service.ts`
- `apps/api/src/config/app-config.ts`
- `packages/pfsense-package/.../manage_local_user.php`
- `packages/pfsense-package/.../monitor-pfsense-agent.sh`
- `apps/web/components/nodes/fleet-technician-management-panel.tsx`
