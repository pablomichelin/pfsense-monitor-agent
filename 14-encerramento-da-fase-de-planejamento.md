# Encerramento da Fase de Planejamento

## Objetivo deste documento

Formalizar o encerramento da fase de planejamento e documentacao do projeto Monitor-Pfsense.

Este documento existe para:

- registrar que a fase documental foi concluida
- listar o que ficou decidido
- listar o que foi entregue
- delimitar o que continua em aberto
- autorizar a transicao para a fase de implementacao

## Data de encerramento

Referencia de encerramento:

- `2026-03-11`

## Status da fase

Resultado:

- `concluida`

Pronto para:

- `Fase 1 - MVP do controlador`

## Objetivos da fase que foram cumpridos

- definir a arquitetura geral do produto
- definir a topologia de publicacao
- definir o fluxo de comunicacao dos pfSense
- definir o escopo do MVP
- definir a stack do controlador
- definir a direcao do frontend
- definir regras de seguranca
- definir regras de coexistencia com o Zabbix
- estruturar documentacao viva para continuidade em novos chats

## Decisoes consolidadas

### Arquitetura

- controlador central em Ubuntu 24
- agente leve dentro de cada pfSense
- fluxo `push` do pfSense para o controlador
- `heartbeat` a cada `30s`
- pacote proprio do pfSense como destino final
- bootstrap transitorio por release versionada e controlada

### Publicacao

- dominio publico do MVP: `https://pfs-monitor.systemup.inf.br`
- Cloudflare na frente do dominio
- `ISPConfig` em `192.168.100.253` como proxy reverso e ponto de TLS
- origem interna do projeto em `192.168.100.244:8088`

### Controlador

- backend: `NestJS`
- banco: `PostgreSQL`
- frontend: `Next.js`
- gateway: `Nginx`
- deploy: `Docker Compose`
- realtime: `SSE` no MVP
- autenticacao humana inicial centralizada no `NestJS`

### Frontend

- `Next.js App Router`
- `TypeScript strict`
- `Tailwind CSS`
- `shadcn/ui`
- `TanStack Table`
- `Recharts`
- tema `dark-first`
- sessao server-side com cookie seguro

### Seguranca

- HTTPS obrigatorio
- `node_uid` estavel por firewall
- `node_secret` unico por firewall
- assinatura HMAC para heartbeat real
- MFA obrigatorio para administradores
- `Argon2id` para senhas
- CSRF para rotas mutaveis com cookie
- RBAC no backend como fonte final de autorizacao

### Coexistencia com o host atual

- nunca estragar ou alterar algo do Zabbix Server
- nao reutilizar portas do ecossistema Zabbix
- nao mexer em `apache2`, `mysql`, `zabbix-server` ou `zabbix-agent` por conveniencia do projeto

### Matriz inicial de suporte

- `pfSense CE 2.8.1`: homologacao oficial inicial
- `pfSense CE 2.8.0`: compatibilidade `best-effort`
- `pfSense 2.7.x` e anteriores: fora do escopo inicial

## Entregaveis da fase

Documentos produzidos:

- `00-README.md`
- `01-objetivo-e-escopo.md`
- `02-prerequisitos-de-infraestrutura.md`
- `03-arquitetura-do-controlador-ubuntu.md`
- `04-stack-de-software.md`
- `05-seguranca-e-endurecimento.md`
- `06-modelo-de-dados-inicial.md`
- `07-api-e-fluxos.md`
- `08-painel-web-e-telas.md`
- `09-instalacao-base-ubuntu-24.md`
- `10-deploy-com-docker-compose.md`
- `11-monitoramento-backup-e-operacao.md`
- `12-roadmap-de-fases.md`
- `13-frontend-ui-ux-e-seguranca.md`
- `CORTEX.md`
- `LEITURA-INICIAL.md`
- `PLANO.md`

## Itens em aberto que nao bloqueiam a implementacao

- formato final do bootstrap no pfSense
- detalhes finais de expiracao de sessao
- limiares exatos de perda e latencia para gateway `degraded`

## O que nao deve ser reaberto sem motivo forte

- fluxo `push`
- dominio publico do MVP
- heartbeat de `30s`
- topologia `253 -> 244:8088`
- stack principal do controlador
- regra de coexistencia com o Zabbix

## Criterio de saida da fase

Esta fase pode ser considerada encerrada porque:

- a arquitetura esta definida
- o MVP esta delimitado
- a stack esta definida
- as regras de seguranca estao registradas
- a UX principal foi especificada
- o contexto pode ser retomado por `LEITURA-INICIAL.md`
- a memoria de projeto foi consolidada em `CORTEX.md`

## Proxima fase autorizada

Proxima fase:

- `Fase 1 - MVP do controlador`

Primeiras entregas esperadas:

1. scaffold do backend `NestJS`
2. esquema inicial do `PostgreSQL`
3. endpoint `POST /api/v1/ingest/heartbeat`
4. painel inicial com `Login`, `Dashboard`, `Firewalls` e `Alertas`

## Observacao historica posterior

Em `2026-03-12`, a fase autorizada por este documento ja foi executada no escopo atual do MVP do controlador e aparece como concluida em `LEITURA-INICIAL.md`.

Com isso, este arquivo permanece como registro historico do encerramento da fase documental, nao como fonte do estado atual de implementacao.

## Regra de transicao

Ao iniciar a implementacao:

- nao redesenhar o que ja esta fechado sem necessidade real
- registrar mudancas estruturais na documentacao
- atualizar `LEITURA-INICIAL.md` ao fim de cada iteracao relevante
