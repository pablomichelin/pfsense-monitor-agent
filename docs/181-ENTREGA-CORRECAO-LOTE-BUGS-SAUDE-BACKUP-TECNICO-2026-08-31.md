# 181 — Correção do lote de bugs (saúde, backup, técnico, nginx)

**Data:** 2026-08-31  
**Versões:** API **0.11.1** · painel **1.12.6** · package pfSense **0.5.17**

## Problema

Varredura operacional (frota 57, todos em 0.5.16) encontrou falhas reais, não só de UX:

1. **15 boxes degradados** com heartbeat fresco — gateways IPv6 (`DHCP6`/`SLAAC`) e VPN com 100% loss derrubavam o status do node.
2. **Gate de backup** do técnico só aceitava `stored`; inventário já aceitava `duplicate`. Agente em on-change não evidenciava “XML igual, cópia já no controlador”.
3. **Re-provision / retry** de técnico: upsert não resetava `status`; UI tratava `active`/`failed` antigo como resultado deste lote. Resultado tardio só era aceito para `pfsense_upgrade`. Follow-up pós-backup podia enfileirar create/senha duas vezes se a API reiniciasse.
4. **Nginx 502** após recreate de api/web — `proxy_pass` apontava para upstream estático resolvido no start.
5. **dpinger sempre `not_installed`** — `pgrep` com âncora `$` não casa processo com argumentos.
6. **Preset do inventário** filtrava só as 200 primeiras linhas no cliente.

## Solução

| Área | O que mudou |
|---|---|
| Gateways | IPv6/VPN não degradam o node (nome + `impact_on_status=optional`). Alerta vira warning. `WANGW` IPv4 continua crítico. |
| Backup | Gate e inventário: `stored` **ou** `duplicate`. Heartbeat envia SHA + `last_checked_at`; se o SHA bate com a cópia no controlador, isso conta como frescura. |
| Técnico | Upsert de lote reseta status para `pending_*`. UI só trata `active`/`failed` depois do backup deste lote. Late result aceita `local_user_*` e `config_backup_now`. Follow-up é claimed com `FOR UPDATE` antes de enfileirar. |
| Nginx | `proxy_pass` via variável + hostname Docker (`api:8088` / `web:3000`) + resolver 127.0.0.11. |
| dpinger | Padrão `pgrep` sem `$` rígido (`dpinger([ /]|$)`). Package **0.5.17**. |
| Preset | Filtro na API; inventário pede até 1000 nodes. |

## O que ainda depende da frota

- **dpinger running** e evidência de backup sem upload: publicar **0.5.17** nos boxes (artefato no controlador, SHA `4228268d…`).
- Contas Erick em `failed` (Acrel Chapeco, FM, Inova, 20/08): retry de provisionamento — o status stale é resetado no enqueue.
- `WANGW` IPv4 down continua degradando o node (esperado).

## Arquivos

- `apps/api/src/nodes/node-status.util.ts`
- `apps/api/src/nodes/backup-policy.util.ts`
- `apps/api/src/technicians/technicians.service.ts`
- `apps/api/src/technicians/technician-backup-followup.service.ts`
- `apps/api/src/node-commands/node-commands.service.ts`
- `apps/web/components/nodes/fleet-technician-management-panel.tsx`
- `apps/web/app/nodes/page.tsx`
- `infra/nginx/default.conf`
- `packages/pfsense-package/` (0.5.17)
