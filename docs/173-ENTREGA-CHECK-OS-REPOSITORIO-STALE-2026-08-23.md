# 173 — pfSense “bugado” que não vê atualização do próprio OS

**Data:** 2026-08-23  
**Versões:** API **0.10.10** · painel **1.11.4** · package pfSense **0.5.12**

## Problema

A frota reportava `pfsense_update_available = false` inclusive em CE **2.7.x** e **2.8.0**, que deveriam ver 2.8.1 se o `pkg` estivesse fresco. O portal então bloqueava o upgrade (`no pfSense update available`).

Causa: o agente rodava só `pfSense-upgrade -c` (lê metadados locais) e cacheava o falso “Your system is up to date” por 6 h. O `-u` (refresh dos repositórios) só acontecia depois que o portal já autorizava o upgrade — um impasse.

## O que mudou

### Package 0.5.12

- Antes do `-c`, o helper limpa lock órfão de `pfSense-upgrade` e roda `pfSense-upgrade -d -u`.
- Se o `-u` falhar, grava erro (não cacheia “atualizado”).
- Cache `v5` invalida o resultado antigo no primeiro ciclo após o upgrade do package.
- A checagem pesada roda **depois** do heartbeat, para não estourar o HTTP.
- Honra `force_update_check` na resposta do heartbeat (com throttle de 10 min).

### API 0.10.10

- Coluna `nodes.pfsense_update_force_check_at`.
- `POST /api/v1/nodes/:id/pfsense-upgrade/refresh-check` (permissão `pfsense.upgrade.run`).
- Heartbeat devolve `force_update_check: true` enquanto o pedido estiver pendente (até 24 h ou até `checked_at` ser mais novo).
- Status do upgrade inclui `refresh_check_supported`, `force_check_pending`.

### Painel 1.11.4

- Botão **Atualizar verificação** no card de upgrade do OS.
- Aviso quando a versão instalada é 2.7.x / 2.8.0 e a checagem diz “atualizado”.

## Uso operacional

1. Publicar o package **0.5.12** e atualizar a frota pelo upgrade remoto em `/nodes`.
2. No firewall já em 0.5.12: **Atualizar verificação** no detalhe do node (aba overview / card pfSense OS). O próximo heartbeat (~30 s) renova os repos; o seguinte envia o resultado.
3. Se `update_available` virar `true`, o botão **Atualizar pfSense** libera (gates de HA, backup e agente mínimo continuam).
4. Workaround imediato em box antigo (SSH / Diagnostics → Command Prompt):

```text
pfSense-upgrade -d -u
/usr/local/libexec/monitor-pfsense-agent/check_pfsense_update_available.sh force-check
```

5. CE 2.7 → 2.8 pode exigir o firmware branch correto no próprio pfSense (System → Update). Plus (26.x) e CE 2.9.0 “atualizado” pode ser verdadeiro.

## Arquivos principais

- `packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/check_pfsense_update_available.sh`
- `packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh`
- `apps/api/src/pfsense-upgrade/pfsense-upgrade.service.ts`
- `apps/api/src/ingest/ingest.service.ts`
- `apps/web/components/node-pfsense-upgrade-section.tsx`
- `apps/api/prisma/migrations/20260823220000_pfsense_update_force_check/migration.sql`
