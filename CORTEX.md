# CORTEX

## Finalidade

Este arquivo e a memoria estrategica e tecnica do projeto. Ele define as regras que devem orientar todas as decisoes de arquitetura, implementacao, operacao e documentacao.

Qualquer nova conversa, PR, task tecnica ou iteracao do produto deve respeitar este arquivo.

## Missao do projeto

Entregar uma plataforma propria para monitoramento centralizado de pfSense CE, com foco em:

- visibilidade operacional unificada
- baixa friccao de instalacao
- seguranca forte
- evolucao natural para pacote nativo do pfSense

## Visao de produto

O sistema sera composto por duas partes:

- controlador central em Ubuntu 24
- agente leve em cada pfSense

O controlador concentra ingestao, persistencia, painel e alertas.
O agente coleta estado local e envia heartbeat por HTTPS.

## Decisoes que sao permanentes ate segunda ordem

- o fluxo principal e `push` do pfSense para o controlador
- o MVP prioriza monitoramento, nao controle remoto
- o controlador roda inicialmente em host unico com Docker Compose
- a integracao nativa com o pfSense vira depois de o heartbeat estar validado
- o pacote do pfSense deve usar o framework oficial de packages
- este host tambem e um servidor Zabbix e o Zabbix tem prioridade operacional
- o dominio publico do MVP e `https://pfs-monitor.systemup.inf.br`
- o heartbeat do agente no MVP e de `30s`
- o projeto usa um unico dominio no MVP para painel e ingestao
- a autenticacao humana inicial do MVP fica centralizada no `NestJS`
- a primeira homologacao oficial do agente mira `pfSense CE 2.8.1`
- o projeto usa `Semantic Versioning`
- o painel deve exibir a versao do sistema e `Desenvolvido por Systemup`

## O que nunca deve ser feito sem decisao explicita

- abrir acesso inbound do controlador para todos os pfSense como base do produto
- executar comandos remotos arbitrarios nos firewalls
- usar token compartilhado entre multiplos firewalls
- armazenar segredos em repositorio
- depender de HTTP sem TLS
- mexer em `zabbix-server`, `zabbix-agent`, `apache2` ou `mysql` por conveniencia do projeto
- publicar portas do ecossistema Zabbix para o Monitor-Pfsense

## Norma principal do ambiente

Nunca estragar ou alterar algo do Zabbix Server.

Se houver qualquer conflito entre o projeto e o Zabbix do host:

- o projeto se adapta
- o Zabbix nao

## Ordem obrigatoria de desenvolvimento

1. documentacao e contrato
2. backend e banco
3. painel web minimo
4. agente leve de coleta
5. empacotamento e GUI no pfSense
6. observabilidade e endurecimento
7. recursos avancados

## Regras de arquitetura

- cada firewall tem identidade unica
- cada firewall tem `node_uid` estavel
- cada firewall tem `node_secret` proprio
- status do node e derivado de heartbeat e checks objetivos
- `online`, `offline`, `degraded` e `maintenance` sao estados oficiais
- o sistema deve nascer pronto para `client -> site -> node`

## Regras de seguranca

- HTTPS obrigatorio
- assinatura HMAC obrigatoria para heartbeat real
- logs de auditoria para acoes sensiveis
- principio do menor privilegio
- segredo fora do repositorio
- `CF-Connecting-IP` e a referencia principal de IP real no origin atras da Cloudflare
- `trust proxy` deve ser restrito ao proxy local e nunca aberto genericamente
- governanca de usuarios humanos fica reservada a `superadmin`; `admin` nao pode criar, promover, desativar ou rotacionar senha de usuarios

## Regras de implementacao

- comecar pelo menor fluxo util fim a fim
- evitar frameworks adicionais sem necessidade clara
- preferir componentes simples e observaveis
- toda feature nova deve dizer se altera API, dados, UI ou agente
- toda iteracao relevante deve atualizar o progresso da fase e do plano total

## Regras para o agente pfSense

- o agente nao deve expor listener adicional sem necessidade
- o agente nao deve depender de interacao manual recorrente
- o agente deve sobreviver a reboot
- o agente deve ter caminho claro para virar pacote oficial do projeto
- o bootstrap inicial deve vir de release versionada e controlada
- o produto final nao deve depender de `Shellcmd` como pilar arquitetural
- SNMP complementar fica fora do MVP inicial
- o `node_uid` nasce no primeiro bootstrap e persiste no pfSense
- em caso de `node_uid` duplicado, o servidor entra em estado de conflito e exige `rekey` ou `rebootstrap`

## Regras para o controlador

- healthcheck obrigatorio
- logs estruturados obrigatorios
- banco com migracoes versionadas
- deploy repetivel por Compose no inicio
- coexistencia obrigatoria com servicos ja ativos no host
- origem interna do MVP em `192.168.100.244:8088`
- publicacao externa via `ISPConfig` em `192.168.100.253`
- endpoint de ingestao do heartbeat: `POST /api/v1/ingest/heartbeat`
- heartbeat com limite de `64 KB`

## Regras para o painel

- dashboard tem prioridade sobre telas administrativas
- status precisa ser legivel em segundos
- filtros por cliente, site e status sao obrigatorios
- SSE e suficiente no MVP
- o rodape deve exibir `Monitor-Pfsense vX.Y.Z`
- o rodape deve exibir `Desenvolvido por Systemup` com link para `https://www.systemup.inf.br`

## Definition of Done do projeto por fase

Uma entrega so esta pronta quando:

- codigo ou documento esta versionado
- impacto em seguranca foi considerado
- impacto em operacao foi considerado
- o proximo passo ficou claro em `LEITURA-INICIAL.md`

## Regra de continuidade entre chats

Ao iniciar uma nova conversa:

1. ler `LEITURA-INICIAL.md`
2. ler `CORTEX.md`
3. identificar a fase atual
4. continuar do ponto registrado, sem reiniciar desenho ja decidido

Ao encerrar uma nova iteracao:

- atualizar `LEITURA-INICIAL.md`
- ajustar `12-roadmap-de-fases.md` se a fase mudou
- ajustar qualquer documento afetado por mudanca estrutural
- registrar percentual da fase atual e percentual do plano total
- **fazer commit e push para `origin main`** para manter o GitHub sempre atualizado (este host e o servidor do projeto)

## Decisoes tecnicas atuais

- backend: `NestJS`
- banco: `PostgreSQL`
- frontend: `Next.js`
- frontend router: `App Router`
- frontend UI: `Tailwind CSS + shadcn/ui`
- reverse proxy: `Nginx`
- deploy: `Docker Compose`
- realtime: `SSE` no MVP
- agente GUI: `PHP` com framework de package do pfSense
- dominio: `https://pfs-monitor.systemup.inf.br`
- heartbeat: `30s`
- sessao humana: server-side com cookie seguro
- autenticacao humana: centralizada no `NestJS`
- versionamento: `Semantic Versioning`

## Diretriz atual de frontend

- frontend dark-first
- leitura rapida e foco operacional
- sem dependencia de `localStorage` para autenticacao
- `Zustand` apenas se surgir necessidade real
- o frontend reflete RBAC, mas o backend e a autoridade final

## Riscos conhecidos

- compatibilidade entre versoes do pfSense
- fragilidade de bootstrap antes do pacote final
- definicao incompleta de health checks por servico
- necessidade de tratamento especial para HA/CARP
- conflito operacional com o Zabbix do host se portas e servicos nao forem preservados

## Portas reservadas do Zabbix neste ambiente

Portas observadas em uso no host em `2026-03-12`:

- `80/TCP`: Apache
- `10050/TCP`: Zabbix Agent
- `10051/TCP`: Zabbix Server
- `3306/TCP` em `127.0.0.1`: MySQL
- `8088/TCP`: gateway interno do Monitor-Pfsense

Portas oficiais do ecossistema Zabbix a tratar como reservadas:

- `80/TCP`
- `443/TCP`
- `10050/TCP`
- `10051/TCP`
- `10052/TCP`
- `10053/TCP`

## Regra de evolucao

Se houver conflito entre velocidade e solidez:

- primeiro garantir heartbeat confiavel
- depois melhorar UX
- depois ampliar cobertura
- so por ultimo adicionar capacidade de acao remota

## Estado atual do projeto

Em `2026-03-12`, a `Fase 1 - MVP do controlador` esta concluida no escopo atual, com `100%` da fase e `93%` do plano total registrados em `LEITURA-INICIAL.md`.

Estado consolidado:

- backend com ingestao, leitura, alertas, administracao e `RBAC`
- frontend com `login`, `dashboard`, `nodes`, `alerts`, `admin` e `bootstrap`
- stack local validada com `Docker Compose`
- `SSE` homologado no dominio publico
- agente leve inicial versionado para a proxima etapa de homologacao em pfSense real
- pacote nativo do pfSense estruturado como port empacotavel, com runtime local do agente e GUI pronta para build em ambiente compativel
