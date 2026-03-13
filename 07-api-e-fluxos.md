# API e Fluxos

## Principios da API

- versionamento por URL
- JSON como formato principal
- autenticacao forte para agentes e usuarios
- respostas previsiveis
- logs e rastreabilidade por request

## Base path

`/api/v1`

## Endpoint publico decidido

Dominio unico do projeto no MVP:

- `https://pfs-monitor.systemup.inf.br`

Fluxo de acesso externo:

- Cloudflare
- `ISPConfig` em `192.168.100.253`
- origem interna em `http://192.168.100.244:8088`

Decisao desta fase:

- nao separar subdominio exclusivo de ingestao no MVP
- painel e agentes usam o mesmo dominio base

## Fluxos principais

### 1. Heartbeat do agente

Fluxo:

1. o agente coleta estado local
2. gera payload JSON
3. assina o payload
4. envia para `POST https://pfs-monitor.systemup.inf.br/api/v1/ingest/heartbeat`
5. a API valida autenticacao e persistencia
6. a API recalcula status do node e alertas
7. o painel recebe evento em tempo quase real

### 2. Teste de conexao do agente

Fluxo:

1. o administrador aciona teste na GUI local do pfSense
2. o agente chama `POST https://pfs-monitor.systemup.inf.br/api/v1/ingest/test-connection`
3. a API valida `node_uid`, janela de tempo e assinatura HMAC
4. a resposta retorna `ok` sem persistir heartbeat operacional

### 3. Leitura do dashboard

Fluxo:

1. o operador abre o painel
2. o frontend carrega resumo e lista de nodes
3. o frontend assina `GET /api/v1/dashboard/events`
4. o `Next.js` usa um proxy interno para manter o stream no mesmo dominio do painel
5. mudancas de status disparam refresh server-side da UI

### 4. Ciclo de alerta

Fluxo:

1. heartbeat ausente ou servico parado gera alerta
2. alerta fica `open`
3. operador pode `ack`
4. ao normalizar o estado, alerta vai para `resolved`

## Endpoints iniciais do agente

### POST /api/v1/ingest/heartbeat

Uso:

- endpoint principal de ingestao

Headers decididos:

- `X-Node-Uid`
- `X-Timestamp`
- `X-Signature`
- `Content-Type: application/json`

Regra de assinatura:

- `HMAC-SHA256(node_secret, timestamp + "\\n" + raw_body)`

Resposta de sucesso:

```json
{
  "ok": true,
  "server_time": "2026-03-11T14:00:00Z",
  "node_status": "online"
}
```

Exemplo de chamada operacional:

```bash
./scripts/test-agent-connection.sh node_abc123 segredodoagent
```

Campos obrigatorios:

- `schema_version`
- `heartbeat_id`
- `sent_at`
- `node_uid`
- `hostname`
- `customer_code`
- `pfsense_version`
- `services[]`
- `gateways[]`
- `uptime_sec`

Campos recomendados:

- `site_name`
- `wan_ip_reported`
- `mgmt_ip`
- `cpu_percent`
- `memory_percent`
- `disk_percent`
- `agent_version`
- `notices[]`

Payload de referencia:

```json
{
  "schema_version": "1",
  "heartbeat_id": "hb_20260311_001",
  "sent_at": "2026-03-11T14:00:00Z",
  "node_uid": "node_9f1d6a52fceb4f1fb00f1b2ee6c6cb0f",
  "site_name": "Filial SP",
  "hostname": "fw-cliente-a",
  "customer_code": "CLIENTEA",
  "mgmt_ip": "10.0.0.1",
  "wan_ip_reported": "200.10.10.10",
  "pfsense_version": "2.x",
  "agent_version": "1.0.0",
  "uptime_sec": 86400,
  "cpu_percent": 20,
  "memory_percent": 48,
  "disk_percent": 61,
  "gateways": [
    {"name": "WAN_DHCP", "status": "online", "latency_ms": 18, "loss_percent": 0}
  ],
  "services": [
    {"name": "unbound", "status": "running"},
    {"name": "openvpn", "status": "stopped"}
  ],
  "notices": []
}
```

Limites e regras:

- tamanho maximo do payload: `64 KB`
- heartbeat representa estado atual, nao fila historica infinita
- se houver falha de envio, o agente preserva apenas o snapshot mais recente

### POST /api/v1/ingest/test-connection

Uso:

- validar configuracao sem gravar estado operacional completo
- nao aceita corpo; usa apenas headers assinados

Headers:

- `X-Node-Uid`
- `X-Timestamp`
- `X-Signature`

Resposta de sucesso:

```json
{
  "ok": true,
  "message": "connection validated",
  "server_time": "2026-03-11T14:00:00Z",
  "node_status": "online",
  "node_uid_status": "active"
}
```

## Endpoints iniciais do painel

### GET /api/v1/dashboard/summary

Retorna:

- total de nodes
- online
- offline
- degraded
- alerts abertos

Protecao desta fase:

- exigir sessao humana server-side valida
- cookie seguro emitido pelo `NestJS`

### GET /api/v1/nodes

Filtros sugeridos:

- `client_id`
- `site_id`
- `status`
- `search`

Protecao desta fase:

- exigir sessao humana server-side valida
- cookie seguro emitido pelo `NestJS`

### GET /api/v1/nodes/:id

Retorna:

- identificacao
- ultimo heartbeat
- servicos
- gateways
- alertas recentes

Protecao desta fase:

- exigir sessao humana server-side valida
- cookie seguro emitido pelo `NestJS`

## Endpoints iniciais de autenticacao humana

### POST /api/v1/auth/login

Uso:

- autenticar operador humano no MVP
- emitir cookie de sessao server-side

Payload inicial:

```json
{
  "email": "admin@systemup.inf.br",
  "password": "********"
}
```

### GET /api/v1/auth/me

Uso:

- validar sessao atual do operador
- retornar tambem `session.id` para governanca de sessoes humanas

### POST /api/v1/auth/logout

Uso:

- revogar a sessao atual

### GET /api/v1/auth/sessions

Uso:

- listar sessoes humanas da conta autenticada
- identificar a sessao atual
- apoiar governanca minima de acesso humano no MVP

Retorna:

- `id`
- `current`
- `created_at`
- `last_seen_at`
- `expires_at`
- `revoked_at`
- `ip_address`
- `user_agent`

### POST /api/v1/auth/sessions/:id/revoke

Uso:

- revogar outra sessao ativa da mesma conta humana
- encerrar acesso de navegador ou terminal antigo sem afetar a sessao atual

Regras:

- a sessao atual nao pode se auto-revogar por este endpoint
- para encerrar a sessao atual, usar `POST /api/v1/auth/logout`

## Endpoints administrativos iniciais

### POST /api/v1/admin/clients

Uso:

- cadastrar cliente inicial do inventario

### POST /api/v1/admin/sites

Uso:

- cadastrar site vinculado a um cliente

### POST /api/v1/admin/nodes

Uso:

- cadastrar node inicial
- emitir `node_secret` individual no bootstrap

### POST /api/v1/admin/nodes/:id/rekey

Uso:

- rotacionar `node_secret` de um node

### GET /api/v1/admin/nodes/:id/bootstrap-command

Uso:

- montar o comando one-shot para `Diagnostics > Command Prompt`
- reutilizar o `node_secret` ativo do node
- apontar para o artefato versionado do agente quando `AGENT_BOOTSTRAP_RELEASE_BASE_URL` estiver configurado
- aceitar `?release_base_url=` para override operacional antes da publicacao final da release

Protecao desta fase:

- exigir sessao humana server-side valida
- exigir `X-CSRF-Token` nas rotas mutaveis autenticadas por cookie

### GET /api/v1/alerts

Filtros sugeridos:

- `status`
- `severity`
- `client_id`
- `site_id`

### POST /api/v1/alerts/:id/ack

Uso:

- reconhecer alerta

### GET /api/v1/dashboard/events

Uso:

- `SSE` para atualizacao de painel
- stream autenticada por cookie de sessao humana
- envia eventos de refresh quando heartbeats entram ou quando o reconciliador altera status e alertas

### GET /api/v1/nodes/filters

Uso:

- retornar clientes e sites disponiveis para os filtros reais do inventario
- apoiar filtros por `client_id` e `site_id` no frontend

## Regras de validacao

- rejeitar requests sem `node_uid`
- rejeitar requests com `timestamp` fora da janela
- validar assinatura HMAC
- comparar `X-Node-Uid` com o `node_uid` do corpo
- limitar tamanho do payload
- validar campos obrigatorios
- detectar duplicidade de `node_uid`

## Erros esperados

- `400`: payload invalido
- `401`: identidade ou assinatura invalidas
- `403`: agente revogado
- `409`: conflito de identidade
- `429`: rate limit
- `500`: erro interno

## Janela inicial de heartbeat

Decisao atual:

- agente envia a cada `30s`
- `online`: ultimo heartbeat recebido em ate `90s`, autenticacao valida e sem falha critica aberta
- `degraded`: heartbeat entre `91s` e `300s`, ou servico critico em falha, ou gateway principal com perda ou latencia acima do limiar, ou retries locais acima do normal
- `offline`: mais de `300s` sem heartbeat

Observacao:

- no removido ou aposentado nao deve aparecer como `offline`; deve sair de operacao ou usar estado administrativo proprio

## Idempotencia e duplicidade

O backend deve tolerar:

- retry do mesmo heartbeat
- atraso de rede curto
- duplicidade eventual

Politica de retry do agente:

- `15s`
- `30s`
- `60s`
- `120s`
- `300s`
- depois manter `300s` ate recuperar conectividade

## Bootstrapping do agente

Fluxo operacional pretendido:

1. operador acessa `Diagnostics > Command Prompt`
2. executa bootstrap one-shot vindo de `GitHub Releases` versionado e controlado
3. o bootstrap instala o componente local
4. o componente passa a expor pagina local do projeto
5. o administrador conclui configuracao por GUI

Regra desta fase:

- bootstrap transitorio agora
- pacote proprio do pfSense como destino final
- nao depender de branch mutavel como origem de instalacao

Artefatos iniciais versionados:

- `packages/pfsense-agent/bootstrap/install.sh`
- `packages/pfsense-agent/bootstrap/install-from-release.sh`
- `packages/pfsense-agent/bootstrap/uninstall.sh`
- `packages/pfsense-agent/bootstrap/monitor_pfsense_agent.rc`
- `packages/pfsense-agent/bootstrap/monitor-pfsense-agent-loop.sh`

## Lista final de servicos do MVP

Monitorar no MVP:

- `unbound`
- `dhcpd`
- `openvpn`
- `ipsec`
- `wireguard`
- `ntpd`
- `dpinger` e estado de gateways

Regras:

- considerar obrigatorio apenas o que estiver habilitado e configurado no no
- `CARP/HA` entra como telemetria complementar, nao como criterio principal de saude do primeiro corte

## Severidade dos alertas

### Critical

- no offline
- todos os gateways monitorados down
- tunel obrigatorio `IPsec`, `OpenVPN` ou `WireGuard` down
- falha recorrente de autenticacao do agente
- `node_uid` duplicado
- heartbeat rejeitado por assinatura invalida de forma recorrente

### Warning

- no `degraded`
- `unbound` down
- `dhcpd` down
- `ntpd` down
- gateway com perda ou latencia alta
- versao fora da matriz homologada
- `clock skew` relevante entre pfSense e servidor

### Info

- no voltou a ficar online
- agente instalado
- agente atualizado
- versao do pfSense mudou
- configuracao do agente alterada
- IP publico do no mudou
