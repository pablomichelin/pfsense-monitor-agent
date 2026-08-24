# 172 — Saúde do box vs IPsec, create de técnico no 2.7.x e endurecimento de comandos

**Data:** 2026-08-23  
**Versões:** API **0.10.9** · painel **1.11.3** · package pfSense **0.5.11**

## Problema

Diagnóstico da frota (57 firewalls) mostrou três falhas operacionais distintas, todas parecendo “erro do portal”:

1. Cinco nodes **degraded** com heartbeat fresco — um túnel IPsec `stopped` (peer down ou road warrior ocioso) pintava o firewall inteiro de âmbar e gerava alerta `critical`.
2. Create do técnico `erick` falhou em três hosts **pfSense CE 2.7.x** com `password hash missing after apply`. O helper `local_user_set_password()` dessa série não devolve hash no wrapper `{'item': $user}` validado no Plus 26.03 / CE 2.8.1.
3. Senha do follow-up de provisionamento ficava em `config_backup_now.payload_json` e podia vazar no histórico (`firewalls.view`). Comando expirado não marcava a conta do técnico como `failed`.

## O que mudou

### API 0.10.9

- Túnel `ipsec:*` **não degrada** o status do node (defesa para agentes antigos sem `impact_on_status`).
- Alerta de IPsec passa a **warning**, não critical. O heartbeat atualiza a severidade dos alertas já abertos.
- Histórico de comandos usa `scrubSensitiveCommandPayload` (senha no topo e em `follow_up_technician_provision`).
- Expire de comando marca conta de técnico `failed` e remove a senha do payload de backup.
- WARN no controlador se um comando fica `pending` por mais de 90s (dois heartbeats).
- `SYSTEM_VERSION` alinhado a **0.10.9**.

### Package 0.5.11

- IPsec reportado com `impact_on_status=optional`.
- `apply_local_user_password()`: tenta wrapper 2.8+/Plus, depois array direto 2.7.x, depois bcrypt local.
- Dispatch de comandos deixa de ir para `/dev/null` — falhas aparecem no log do agente.

### Painel 1.11.3

- Versão mínima de agente na UI de técnicos: **0.5.4** (igual à API).
- Mensagens PT-BR para comando expirado e falha de hash no 2.7.x.

## Uso operacional

1. Após o deploy da API, o próximo heartbeat já tira o **degraded** falso dos nodes cujo único problema era IPsec. Alertas de túnel continuam em `/alerts` como warning.
2. Atualizar a frota (em especial Acrel 0.5.9 e os 2.7.x: FM Distribuidora, Inova, Acrel) para package **0.5.11** via upgrade remoto em `/nodes`.
3. Reprovisionar o técnico `erick` nesses três firewalls depois do upgrade.
4. Offline reais (CGH Lageado, Ronnau) não mudam com este patch — investigar WAN/DNS/TLS no pfSense.

## Arquivos principais

- `apps/api/src/nodes/node-status.util.ts`
- `apps/api/src/commands/command-orchestrator.service.ts`
- `apps/api/src/node-commands/node-commands.service.ts`
- `apps/api/src/technicians/technician-accounts.util.ts`
- `packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/manage_local_user.php`
- `packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh`
