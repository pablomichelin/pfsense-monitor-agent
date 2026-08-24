# 167 — Backup automático antes do provisionamento de técnicos

**Data:** 2026-08-20  
**Versões:** API **0.10.7** · painel **1.10.13**

## Problema reportado

Operador provisionou técnico em lote após rodar backup em massa, mas vários firewalls ainda apareciam como **Ignorado** com mensagem *"Bloqueado — sem backup recente do config.xml"*. Isso impedia o fluxo operacional de criar usuários sem rodar backup manualmente antes em cada firewall.

## Solução

Nova opção **"Gerar backup automaticamente antes de provisionar"** (ligada por padrão) no lote de provisionamento em `/nodes`.

Quando um firewall não tem backup recente dentro da janela configurada (`TECHNICIAN_ACCOUNT_REQUIRE_BACKUP_MAX_AGE_HOURS`, padrão 7 dias):

1. Em vez de ignorar, enfileira `config_backup_now` com payload `follow_up_technician_provision`.
2. O resultado inicial do lote mostra **Backup enfileirado** (`backup_queued`).
3. Após o backup concluir com sucesso, o controlador enfileira automaticamente `local_user_create` ou `local_user_set_password` (upsert, mesma senha do lote).
4. A senha permanece no payload de follow-up até o backup concluir; depois é removida do payload do backup (scrub).

Com a opção **desligada**, o comportamento anterior é mantido: firewalls sem backup recente são ignorados.

## Alterações técnicas

### API 0.10.7

- Campo `backup_before_provision?: boolean` em `POST /technicians/batch-provision` (default `true`).
- `planBatchProvision()` separa nós sem backup em `backupQueue` quando a opção está ligada.
- Outcome `backup_queued` + contador `summary.backup_queued`.
- `TechnicianBackupFollowUpService` — follow-up após `config_backup_now` succeeded.
- `command-registry`: `config_backup_now` aceita payload com follow-up.

### Painel 1.10.13

- Checkbox na aba Provisionar (default marcado).
- Label **Backup enfileirado** no resultado do lote.
- Resumo do lote inclui contagem de backups enfileirados.

## Uso operacional

1. Selecionar firewalls na tabela de `/nodes`.
2. Aba **Provisionar** → escolher técnico e senha (recomendado informar senha manualmente).
3. Manter **Gerar backup automaticamente antes de provisionar** marcado.
4. Confirmar lote — firewalls sem backup recente aparecem como **Backup enfileirado**; após conclusão do backup, o provisionamento segue automaticamente.
5. Acompanhar status na tabela de resultados (comando de backup → comando de create/set_password).

## Arquivos alterados

- `apps/api/src/technicians/technician-backup-followup.service.ts` (novo)
- `apps/api/src/technicians/technician-accounts.util.ts`
- `apps/api/src/technicians/technicians.service.ts`
- `apps/api/src/technicians/dto/technicians.dto.ts`
- `apps/api/src/technicians/technicians.module.ts`
- `apps/api/src/node-commands/node-commands.service.ts`
- `apps/api/src/node-commands/node-commands.module.ts`
- `apps/api/src/commands/command-registry.ts`
- `apps/web/components/nodes/fleet-technician-management-panel.tsx`
- `apps/web/lib/api.ts`
- `apps/web/lib/technicians.ts`
