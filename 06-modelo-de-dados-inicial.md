# Modelo de Dados Inicial

## Objetivo

O modelo inicial precisa suportar inventario, ultimo estado, historico minimo e alertas.

## Entidades principais

### clients

Representa a organizacao atendida.

Campos sugeridos:

- `id`
- `name`
- `code`
- `status`
- `created_at`
- `updated_at`

### sites

Representa uma unidade, filial ou localidade do cliente.

Campos sugeridos:

- `id`
- `client_id`
- `name`
- `code`
- `city`
- `state`
- `timezone`
- `status`
- `created_at`
- `updated_at`

### nodes

Representa um firewall pfSense monitorado.

Campos sugeridos:

- `id`
- `site_id`
- `node_uid`
- `node_uid_status`
- `hostname`
- `display_name`
- `management_ip`
- `wan_ip`
- `pfsense_version`
- `agent_version`
- `ha_role`
- `last_boot_at`
- `last_seen_at`
- `status`
- `maintenance_mode`
- `created_at`
- `updated_at`

Observacao:

- `node_uid` deve ser estavel e unico por firewall
- o `node_uid` nasce no primeiro bootstrap do agente
- o `node_uid` nao deve derivar de IP, MAC, hostname ou nome do cliente
- formato recomendado: `node_` + UUIDv4 ou bytes aleatorios fortes em representacao segura
- o servidor deve detectar duplicidade de `node_uid` e marcar conflito operacional

### node_credentials

Representa o segredo tecnico do no para autenticacao de heartbeat.

Campos sugeridos:

- `id`
- `node_id`
- `secret_hint`
- `secret_hash`
- `secret_encrypted`
- `status`
- `rotated_at`
- `last_used_at`
- `created_at`
- `revoked_at`

Observacao:

- para validar `HMAC` sem armazenar segredo em texto puro, o controlador pode manter `secret_hash` para referencia e `secret_encrypted` para uso operacional com chave mestra fora do repositorio

### agent_tokens

Representa tokens auxiliares ou de bootstrap quando necessarios.

Campos sugeridos:

- `id`
- `node_id`
- `token_hint`
- `token_hash`
- `status`
- `expires_at`
- `last_used_at`
- `created_at`
- `revoked_at`

### heartbeats

Historico bruto de heartbeat.

Campos sugeridos:

- `id`
- `node_id`
- `received_at`
- `sent_at`
- `heartbeat_id`
- `latency_ms`
- `pfsense_version`
- `agent_version`
- `management_ip`
- `wan_ip`
- `uptime_seconds`
- `cpu_percent`
- `memory_percent`
- `disk_percent`
- `gateway_summary`
- `schema_version`
- `customer_code`
- `payload_json`

### node_service_status

Ultimo estado conhecido por servico.

Campos sugeridos:

- `id`
- `node_id`
- `service_name`
- `status`
- `message`
- `observed_at`
- `updated_at`

### node_gateway_status

Ultimo estado conhecido de gateways.

Campos sugeridos:

- `id`
- `node_id`
- `gateway_name`
- `status`
- `loss_percent`
- `latency_ms`
- `observed_at`
- `updated_at`

### alerts

Representa alertas abertos ou resolvidos.

Campos sugeridos:

- `id`
- `node_id`
- `fingerprint`
- `type`
- `severity`
- `title`
- `description`
- `status`
- `opened_at`
- `acknowledged_at`
- `acknowledged_by`
- `resolved_at`
- `resolution_note`

### audit_logs

Trilha de auditoria do sistema.

Campos sugeridos:

- `id`
- `actor_type`
- `actor_id`
- `action`
- `target_type`
- `target_id`
- `ip_address`
- `metadata_json`
- `created_at`

## Relacionamentos

- `client` 1:N `site`
- `site` 1:N `node`
- `node` 1:N `heartbeat`
- `node` 1:N `node_credential`
- `node` 1:N `node_service_status`
- `node` 1:N `node_gateway_status`
- `node` 1:N `alert`
- `node` 1:N `agent_token`

## Enums iniciais

### node_status

- `online`
- `degraded`
- `offline`
- `maintenance`
- `unknown`

### service_status

- `running`
- `stopped`
- `degraded`
- `unknown`
- `not_installed`

### alert_status

- `open`
- `acknowledged`
- `resolved`

### alert_type

- `heartbeat_missing`
- `service_down`
- `gateway_down`
- `version_change`
- `agent_error`
- `node_uid_conflict`
- `clock_skew`
- `auth_failure_repeated`

### alert_severity

- `critical`
- `warning`
- `info`

### node_uid_status

- `active`
- `conflict`
- `retired`

### gateway_status

- `online`
- `degraded`
- `down`
- `unknown`

## Indices recomendados

- `nodes(node_uid)` unico
- `nodes(site_id, status)`
- `heartbeats(node_id, received_at desc)`
- `node_service_status(node_id, service_name)` unico
- `node_gateway_status(node_id, gateway_name)` unico
- `alerts(fingerprint)` unico
- `alerts(node_id, status, severity)`
- `audit_logs(created_at desc)`
- `heartbeats(heartbeat_id)` unico

## Politica de retencao inicial

- `heartbeats` brutos: 30 dias
- `rollup` de 5 ou 15 minutos: 180 dias
- `rollup` diario: 400 dias
- `events`: 180 dias
- `audit_logs`: 400 dias no minimo
- `alerts`: retencao integral enquanto o produto estiver em operacao

## Estrategia de historico

No inicio:

- manter ultimo estado em tabelas de estado corrente
- manter heartbeat bruto para auditoria e analise curta

Fase posterior:

- criar agregacoes por hora e por dia para reduzir volume

## Decisoes de identidade do no

- o agente persiste o `node_uid` na configuracao do pacote e em arquivo local de espelho
- o backend gera e vincula um `node_secret` por no
- em caso de clone ou restore com `node_uid` duplicado, o backend marca `conflict` e exige `rekey` ou `rebootstrap`
