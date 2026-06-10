# Refatoracao: snapshot operacional sem historico de telemetria

**Data:** 2026-03-19

## Contexto

Decisao operacional do produto:

- o `Zabbix` continua como fonte de **retencao historica**
- o `Monitor-Pfsense` passa a focar em **estado atual**, alertas e visualizacao operacional
- portanto, o controlador **nao precisa** persistir um historico continuo de `heartbeats`

## Objetivo tecnico

Reduzir lentidao e I/O desnecessario transformando o heartbeat em **atualizacao de snapshot atual** do firewall, em vez de gravacao de telemetria historica.

## Plano tecnico

1. Adicionar ao `Node` os campos necessarios para representar o ultimo snapshot operacional:
   - ultimo heartbeat
   - metricas atuais
   - schema/customer code
   - interfaces atuais
2. Fazer `backfill` a partir do ultimo registro existente em `heartbeats`, para nao perder a visualizacao atual apos o deploy.
3. Alterar o ingest para:
   - atualizar `nodes`
   - atualizar `node_service_status`
   - atualizar `node_gateway_status`
   - **parar de criar** um registro em `heartbeats` a cada ciclo
4. Alterar o painel e a API de leitura para consumir o snapshot salvo em `nodes`, sem consultar `heartbeats` para dashboard/listagem/detalhe.
5. Reduzir escrita auxiliar:
   - throttle de `lastSeenAt` da sessao humana
   - menos realtime em telas administrativas
   - rotacao de logs Docker
6. Manter `heartbeats` apenas como tabela legada temporaria ate a limpeza operacional.
7. Versionar um script explicito para purge da tabela legada.

## Implementado nesta rodada

### 1. Snapshot atual no model `Node`

Adicionados campos no `Node`:

- `last_heartbeat_id`
- `last_heartbeat_sent_at`
- `last_latency_ms`
- `uptime_seconds`
- `cpu_percent`
- `memory_percent`
- `disk_percent`
- `schema_version`
- `customer_code`
- `network_interfaces_json`

Arquivos:

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260319113000_operational_snapshot_node_fields/`

### 2. Backfill automatico do ultimo heartbeat

A migration popula os novos campos do `Node` com o ultimo heartbeat existente por firewall (`DISTINCT ON node_id`), preservando a visualizacao atual imediatamente apos o deploy.

### 3. Ingest sem historico continuo

O endpoint `POST /api/v1/ingest/heartbeat` agora:

- detecta duplicidade pelo `last_heartbeat_id` do `Node`
- atualiza o snapshot no `Node`
- continua atualizando `node_service_status` e `node_gateway_status`
- **nao grava mais** uma linha nova em `heartbeats` por heartbeat aceito

Resultado:

- o banco deixa de crescer continuamente por telemetria repetitiva
- o custo de I/O do ingest cai bastante

### 4. Leitura do painel via snapshot

As rotas de leitura de nodes deixaram de depender da tabela `heartbeats` para:

- CPU
- memoria
- disco
- uptime
- identificacao do ultimo heartbeat
- interfaces do firewall

Agora esses dados saem diretamente do `Node`.

### 5. Reducao de escrita auxiliar

Tambem foram aplicados estes ajustes:

- `AuthService.validateSession()` agora atualiza `lastSeenAt` so quando a sessao esta sem toque recente (janela de 5 minutos)
- `admin` e `bootstrap` deixaram de abrir `RealtimeRefresh`, reduzindo refresh server-side desnecessario
- `compose.yaml` recebeu rotacao de logs Docker (`max-size` / `max-file`)
- logs de heartbeat `online` foram rebaixados de `log` para `debug`

### 6. Script de limpeza da tabela legada

Novo script versionado:

- `scripts/purge-heartbeats.sh`

Ele permite:

- `--dry-run`
- `--older-than-hours N`
- `--all`
- `--vacuum`

## Operacao recomendada apos deploy

1. Rebuild/deploy da stack:

```bash
cd /opt/Monitor-Pfsense
docker compose up -d --build
```

2. Conferir que novos heartbeats nao estao mais crescendo na tabela:

```bash
docker compose exec -T db psql -U monitor_pfsense -d monitor_pfsense -c "SELECT count(*) FROM heartbeats;"
```

3. Fazer dry-run da limpeza:

```bash
cd /opt/Monitor-Pfsense
./scripts/purge-heartbeats.sh --all --dry-run
```

4. Executar a limpeza real quando aprovado:

```bash
cd /opt/Monitor-Pfsense
./scripts/purge-heartbeats.sh --all --vacuum
```

## Estado final esperado

Depois desta trilha:

- `Monitor-Pfsense` fica orientado a **estado atual**
- `Zabbix` continua sendo a camada de **historico**
- o banco do controlador para de crescer por heartbeat continuo
- dashboard, inventario e detalhe passam a ler snapshot atual com menos custo

## Proximos passos sugeridos

1. Remover dependencias restantes de `force-dynamic` onde nao houver necessidade operacional.
2. Paginar `alerts` e consolidar `/admin/usuarios` para eliminar o padrao N+1.
3. Opcionalmente remover a tabela `heartbeats` do produto numa trilha futura, depois de uma rodada estavel sem uso.
