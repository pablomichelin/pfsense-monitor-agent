# Arquitetura do Controlador Ubuntu

## Objetivo desta camada

O controlador central recebe eventos dos pfSense, consolida o estado operacional de cada firewall e publica isso em um painel web.

## Visao de alto nivel

```text
pfSense agente 1 ----\
pfSense agente 2 ----- HTTPS ---> Cloudflare ---> ISPConfig 192.168.100.253 ---> Monitor-Pfsense 192.168.100.244:8088
pfSense agente N ----/                                                             \
                                                                                    \--> gateway interno ---> API NestJS ---> PostgreSQL
                                                                                                       \
                                                                                                        \--> Next.js + SSE
```

## Restricao de coexistencia com Zabbix

O host alvo atual ja executa Zabbix. Isso impoe uma regra arquitetural:

- o Monitor-Pfsense nao pode assumir controle do frontend HTTP principal do host
- o Monitor-Pfsense nao pode reutilizar portas do ecossistema Zabbix
- o Monitor-Pfsense nao pode substituir Apache, MySQL ou servicos do Zabbix

Decisao operacional padrao para este host:

- rodar o Monitor-Pfsense em portas altas dedicadas no MVP
- evitar qualquer bind em `80`, `443`, `10050`, `10051`, `10052`, `10053` e `3306`
- manter banco do projeto isolado do MySQL do Zabbix
- publicar externamente o projeto apenas via `192.168.100.253`
- manter o `192.168.100.244` como origem interna do sistema

## Topologia de publicacao decidida

Decisao fechada para o MVP:

- dominio publico unico: `https://pfs-monitor.systemup.inf.br`
- DNS gerenciado pela Cloudflare
- proxy reverso externo no `ISPConfig` em `192.168.100.253`
- certificado TLS gerenciado no `ISPConfig`
- origem interna do projeto em `http://192.168.100.244:8088`

Regra operacional:

- os pfSense clientes nao acessam o `192.168.100.244` diretamente pela internet
- os pfSense clientes acessam sempre o dominio publico

## Componentes principais

### 1. Nginx

Responsabilidades:

- encaminhar trafego para API e frontend
- aplicar limites basicos de request
- expor logs de acesso
- servir como gateway interno do projeto, se essa camada for mantida no `244`

Restricao neste host:

- nao substituir o `apache2` atual do Zabbix
- se houver `nginx` do projeto, ele deve usar portas diferentes das reservadas ao Zabbix

Observacao:

- o termino TLS publico do MVP acontece no `ISPConfig` em `192.168.100.253`, nao no `192.168.100.244`

### 2. API NestJS

Responsabilidades:

- receber heartbeat dos agentes
- validar autenticacao e assinatura
- normalizar payload
- atualizar inventario e estado corrente
- abrir, atualizar e resolver alertas
- fornecer API para o painel web
- publicar eventos para atualizacao em tempo quase real

### 3. PostgreSQL

Responsabilidades:

- persistir configuracoes
- armazenar inventario de clientes, sites e firewalls
- guardar ultimo estado e historico
- manter trilha de auditoria

Restricao neste host:

- o banco do projeto nao deve reutilizar a instancia `mysql` do Zabbix
- a porta do banco do projeto nao deve ser exposta publicamente

### 4. Frontend Next.js

Responsabilidades:

- painel principal
- telas de inventario
- detalhe do firewall
- central de alertas
- telas administrativas

### 5. Realtime

Escolha recomendada para v1:

- `SSE` para feed de eventos do painel

Evolucao futura:

- `WebSocket` se houver necessidade de interacao bidirecional

Regras operacionais para `SSE` no MVP:

- manter o stream no mesmo dominio do painel
- autenticar o stream com a mesma sessao humana server-side
- desabilitar buffering no proxy reverso do caminho do stream
- permitir conexoes HTTP long-lived entre `ISPConfig`, `Next.js` e `NestJS`
- tratar reconexao no frontend sem depender de `localStorage`

## Responsabilidades do controlador

- consolidar o estado de multiplos firewalls
- calcular saude do no
- definir `online`, `offline`, `degraded` ou `maintenance`
- preservar historico operacional minimo
- servir como ponto central de observabilidade

## Limites de responsabilidade

O controlador nao deve, no inicio:

- executar comandos remotos arbitrarios no pfSense
- aplicar mudancas de configuracao em lote
- servir como bastion ou tunel de administracao

## Estrategia de status do no

Estado calculado a partir de:

- ultimo heartbeat recebido
- status de servicos criticos
- status de gateways
- modo de manutencao, quando existir

Regra inicial:

- `online`: heartbeat dentro da janela e sem falhas graves
- `degraded`: heartbeat recente com falha de servico ou gateway
- `offline`: heartbeat ausente acima da janela
- `maintenance`: manutencao marcada manualmente

## Modelo multi-tenant

O projeto deve nascer preparado para:

- um controlador atender varios clientes
- cada cliente ter varios sites
- cada site ter um ou mais firewalls

Isolamento logico minimo:

- filtros por cliente e site
- tokens por firewall
- auditoria por usuario

## Escalabilidade

No MVP, uma unica instancia da API e suficiente.

Caminho de evolucao:

- separar `api`, `web` e `worker`
- adicionar Redis para fila
- separar base transacional de armazenamento analitico

## Observabilidade do proprio controlador

O controlador deve expor:

- healthcheck HTTP
- logs estruturados
- metricas tecnicas da aplicacao
- status de conexao com banco

## Estrutura logica recomendada do repositorio

Quando o codigo comecar:

```text
/apps
  /api
  /web
/packages
  /pfsense-agent
  /pfsense-package
/infra
  /docker
  /nginx
  /scripts
/docs
```

## Decisao arquitetural principal

O `push` do pfSense para o controlador e a base da arquitetura. Isso evita acesso inbound aos clientes e reduz a superficie de ataque.

## Decisao arquitetural complementar para este host

Se surgir qualquer conflito entre simplicidade do projeto e preservacao do Zabbix, prevalece a preservacao do Zabbix.

## Decisoes fechadas desta fase

- dominio publico do projeto: `https://pfs-monitor.systemup.inf.br`
- um unico dominio no MVP para painel e ingestao
- proxy e certificado no `192.168.100.253`
- origem do Monitor-Pfsense em `192.168.100.244:8088`
