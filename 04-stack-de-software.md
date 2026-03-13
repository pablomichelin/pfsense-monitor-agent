# Stack de Software

## Diretriz geral

A stack escolhida precisa equilibrar:

- simplicidade operacional
- velocidade de entrega
- facilidade de manutencao
- compatibilidade com Docker Compose
- futuro suporte a multi-tenant e alertas
- coexistencia segura com o Zabbix ja instalado no host

## Stack principal do controlador

### Backend

- `NestJS`
- `TypeScript`
- `Fastify` como adapter HTTP
- `Prisma` como ORM inicial

Motivo:

- boa organizacao por modulos
- tipagem forte
- facil evolucao para filas, eventos e autenticacao

### Banco de dados

- `PostgreSQL`

Motivo:

- solido para dados relacionais
- bom suporte a indices, JSON e auditoria
- simples de operar no inicio

Restricao neste host:

- nao usar o `MySQL` do Zabbix como banco do projeto
- nao alterar parametros do `MySQL` do host em nome do Monitor-Pfsense

### Frontend

- `Next.js`
- `TypeScript`
- `App Router`

Motivo:

- bom equilibrio entre SSR, rotas protegidas e UI administrativa
- facilita dashboards internos com server rendering e streaming

### Realtime

- `SSE` no MVP

Motivo:

- mais simples que WebSocket para atualizacao de dashboard
- suficiente para push de mudancas de status

### Proxy reverso

- `Nginx`

Motivo:

- TLS, roteamento e rate limit simples
- facil operacao em host unico

Restricao neste host:

- o `Nginx` do projeto nao deve substituir o `Apache` usado pelo Zabbix
- no MVP, preferir publicar o stack em portas altas dedicadas

### Conteinerizacao

- `Docker Engine`
- `Docker Compose`

Motivo:

- deploy repetivel
- onboarding simples
- rollback mais previsivel

## Stack do agente no pfSense

### GUI do pacote

- `PHP`
- XML do framework de packages do pfSense

### Coleta local

- shell script controlado
- chamadas a utilitarios nativos do pfSense

### Envio de dados

- `curl` via HTTPS

## Ferramentas de qualidade recomendadas

- `ESLint`
- `Prettier`
- testes unitarios no backend
- testes de integracao da API
- testes E2E basicos no painel

## Politica de versoes

- usar `Semantic Versioning` para o produto
- manter versao global de release e versoes tecnicas por componente quando necessario
- fixar versoes maiores no codigo
- usar somente imagem base suportada e atualizada
- atualizar dependencias por janela controlada

Regra adicional:

- a interface deve exibir a versao real do build
- o produto deve exibir a assinatura `Desenvolvido por Systemup` com link para `https://www.systemup.inf.br`

## Dependencias opcionais para fases futuras

- `Redis` para fila e cache
- `BullMQ` para jobs internos
- `OpenTelemetry` para tracing
- `Prometheus` e `Grafana` para observabilidade do controlador
- `OIDC` para login corporativo

## Alternativas consideradas

### Backend em Python

Vantagem:

- curva rapida para APIs simples

Motivo para nao escolher agora:

- a stack proposta pelo projeto ja converge melhor para `NestJS` e `TypeScript`

### Polling HTTP no painel

Vantagem:

- mais simples de implementar

Motivo para nao escolher agora:

- desperdicaria requests para um dashboard de status

### Agente baseado em SNMP apenas

Vantagem:

- menor codigo proprio no pfSense

Motivo para nao escolher agora:

- nao resolve a pagina local no pfSense nem a identidade do projeto

## Regra pratica

Nao adicionar nova dependencia sem responder:

- resolve um problema real do MVP?
- reduz trabalho total de manutencao?
- melhora seguranca ou observabilidade?
