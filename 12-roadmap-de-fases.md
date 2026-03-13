# Roadmap de Fases

## Diretriz

O projeto deve evoluir em camadas, validando primeiro o caminho critico: coleta, ingestao, persistencia e painel.

Regra permanente:

- nenhuma fase pode colocar o Zabbix do host em risco

## Fase 0 - Fundacao documental

Objetivo:

- consolidar visao, arquitetura e regras do projeto

Entregas:

- documentacao base
- `CORTEX.md`
- `LEITURA-INICIAL.md`

Status em `2026-03-11`:

- concluida
- encerramento formal registrado em `14-encerramento-da-fase-de-planejamento.md`

## Fase 1 - MVP do controlador

Objetivo:

- consolidar o controlador, o painel e o fluxo operacional local do MVP antes da homologacao em firewall real

Entregas:

- API `POST /api/v1/ingest/heartbeat`
- PostgreSQL com esquema inicial
- painel com dashboard e lista de firewalls
- status `online`, `offline` e `degraded`
- alertas basicos
- autenticacao humana inicial centralizada no `NestJS`
- bootstrap inicial do agente leve
- proxy interno unificado em `:8088`
- configuracao de referencia do `ISPConfig`
- smokes operacionais locais versionados

Criterio de saida:

- stack local validada de ponta a ponta
- painel refletindo mudancas de estado por heartbeat validado em ambiente controlado
- documentacao operacional pronta para a primeira homologacao em pfSense real

Status em `2026-03-12`:

- concluida no escopo atual do MVP do controlador
- fase atual: `100%`
- plano total: `92%`
- entrega atual: backend, frontend, autenticacao humana, RBAC, alertas, bootstrap inicial do agente, proxy interno em `:8088`, referencia do `ISPConfig` e smokes operacionais locais versionados e validados

## Fase 2 - Agente leve no pfSense

Objetivo:

- homologar o agente leve em pfSense real e estabilizar o bootstrap inicial sem depender de processo manual recorrente

Entregas:

- bootstrap homologado em `pfSense CE 2.8.1`
- script de coleta local
- rotina automatica de heartbeat
- identificacao unica do firewall
- coleta de servicos e gateways
- checklist operacional validado em campo

Criterio de saida:

- agente operando em pelo menos 1 pfSense homologado

## Fase 3 - Integracao nativa com GUI do pfSense

Objetivo:

- transformar o agente em componente com UX local apropriada

Entregas:

- pagina local no menu do pfSense
- configuracao persistente por GUI
- botao de testar conexao
- botao de heartbeat imediato
- logs locais
- widget de saude no dashboard

Criterio de saida:

- instalacao por bootstrap seguida de configuracao pela GUI

## Fase 4 - Produto operacional

Objetivo:

- tornar o sistema pronto para uso recorrente em varios clientes

Entregas:

- gestao de tokens
- central de alertas mais madura
- filtros por cliente e site
- auditoria administrativa
- backups e restore testados

Criterio de saida:

- multiplos firewalls operando com estabilidade

## Fase 5 - Endurecimento e escala

Objetivo:

- preparar o sistema para crescimento e ambientes mais sensiveis

Entregas:

- mTLS opcional
- worker e fila
- politicas de retencao
- observabilidade ampliada
- homologacao em HA/CARP

## Fase 6 - Recursos avancados

Objetivo:

- ampliar valor sem comprometer seguranca

Entregas candidatas:

- relatorios
- historico por tendencias
- integracoes externas
- acoes remotas limitadas e auditadas

## Sequencia recomendada

1. controlador
2. heartbeat real
3. agente leve
4. GUI do pfSense
5. endurecimento
6. recursos avancados

## Regras do roadmap

- nao pular a validacao do fluxo de heartbeat
- nao adicionar controle remoto antes de auditoria e RBAC
- nao expandir suporte de versoes sem homologacao
- nao ocupar portas ou componentes do Zabbix sem decisao explicita
- a primeira homologacao oficial do agente deve mirar `pfSense CE 2.8.1`
- cada fase deve manter percentual de progresso
- cada tarefa deve indicar percentual da fase e percentual do plano total
