# 149 — Correção gestão de técnicos (getUserEntry + payload agente) — package 0.5.1

Data: `2026-07-31`

Status: **corrigido e validado no lab 254**

## Versões

| Componente | Versão |
|------------|--------|
| API | `0.8.2` |
| Painel web | `1.6.0` (sem mudança de código) |
| Package pfSense | `0.5.1` |

## Problemas corrigidos

### 1. `manage_local_user.php` — wrapper `getUserEntry()` (pfSense 2.7+ / Plus)

No Plus 26.03.1, `getUserEntry()` retorna `['idx' => N, 'item' => $user]`. O script tratava o wrapper como usuário → `local_user_set()` falhava silenciosamente e `disabled` não persistia no `config.xml`.

**Correção:** desempacotar `idx`/`item`, atualizar via `config_set_path('system/user/{idx}', ...)`, depois `local_user_set()` + `write_config()`.

### 2. API — payload enviado ao agente

`toAgentCommandPayload()` enviava chave `username`; o agente espera `pfsense_username`.

**Correção:** API `0.8.1`+ envia `pfsense_username` (incluído nesta entrega em `0.8.2`).

### 3. Agente — dispatch `local_user_disable`

- `stderr` do PHP era descartado (`2>/dev/null`) → erro genérico `local user action failed`
- Fallback de path do payload (`cmd-payload-{id}.json`)
- `build_local_users_json()` passou a usar `php -f` e `pfsense_config_path()`

## Validação lab 254 (`systemupfw.system.up`)

1. Flags API: `TECHNICIAN_ACCOUNTS_ENABLED=true`, `TECHNICIAN_ACCOUNT_DISABLE_ENABLED=true`
2. Flag agente: `MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED=1`
3. Hotfix arquivos `0.5.1` no firewall
4. Batch revoke `disable` usuário `hotspot` → comando `succeeded`
5. Snapshot atualizado: `"hotspot": {"disabled": true}`

## Deploy produção

1. `docker compose up -d --build` (API `0.8.2` já aplicada neste host)
2. Habilitar flags na API (piloto) conforme `docs/148-...md`
3. Upgrade package remoto para **0.5.1** nos firewalls piloto (`minAgentVersion` continua `0.5.0`; recomendado `0.5.1` para revogação)

## Arquivos principais

- `packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/manage_local_user.php`
- `packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh`
- `apps/api/src/node-commands/node-commands.service.ts`
