# Monitor-Pfsense

Repositorio de planejamento e futura implementacao de uma plataforma de monitoramento centralizado para pfSense CE, com:

- controlador central em Ubuntu 24
- painel web para operacao e visibilidade
- agente leve em cada pfSense
- evolucao posterior para pacote proprio do pfSense com pagina no menu

## Ordem de leitura recomendada

1. `LEITURA-INICIAL.md`
2. `CORTEX.md`
3. `00-README.md`
4. `01-objetivo-e-escopo.md`
5. `12-roadmap-de-fases.md`
6. `14-encerramento-da-fase-de-planejamento.md`

## Indice da documentacao

- [01-objetivo-e-escopo.md](./01-objetivo-e-escopo.md)
- [02-prerequisitos-de-infraestrutura.md](./02-prerequisitos-de-infraestrutura.md)
- [03-arquitetura-do-controlador-ubuntu.md](./03-arquitetura-do-controlador-ubuntu.md)
- [04-stack-de-software.md](./04-stack-de-software.md)
- [05-seguranca-e-endurecimento.md](./05-seguranca-e-endurecimento.md)
- [06-modelo-de-dados-inicial.md](./06-modelo-de-dados-inicial.md)
- [07-api-e-fluxos.md](./07-api-e-fluxos.md)
- [08-painel-web-e-telas.md](./08-painel-web-e-telas.md)
- [09-instalacao-base-ubuntu-24.md](./09-instalacao-base-ubuntu-24.md)
- [10-deploy-com-docker-compose.md](./10-deploy-com-docker-compose.md)
- [11-monitoramento-backup-e-operacao.md](./11-monitoramento-backup-e-operacao.md)
- [12-roadmap-de-fases.md](./12-roadmap-de-fases.md)
- [13-frontend-ui-ux-e-seguranca.md](./13-frontend-ui-ux-e-seguranca.md)
- [14-encerramento-da-fase-de-planejamento.md](./14-encerramento-da-fase-de-planejamento.md)
- [15-versionamento-e-branding.md](./15-versionamento-e-branding.md)
- [16-status-e-progresso-do-projeto.md](./16-status-e-progresso-do-projeto.md)
- [17-checklist-homologacao-bootstrap-pfsense-real.md](./17-checklist-homologacao-bootstrap-pfsense-real.md)
- [18-homologacao-pfsense-package-real-2026-03-13.md](./18-homologacao-pfsense-package-real-2026-03-13.md)
- [PROMPT-CONTINUACAO-PFSENSE-PACKAGE.md](./PROMPT-CONTINUACAO-PFSENSE-PACKAGE.md)
- [docs/CADASTRO-E-COMANDOS-PFSENSE.md](./docs/CADASTRO-E-COMANDOS-PFSENSE.md): cadastro, comandos e testes no pfSense (operacional).
- [docs/22-diagnostico-cadastro-e-comandos-2026-03-14.md](./docs/22-diagnostico-cadastro-e-comandos-2026-03-14.md): diagnóstico técnico cadastro/comandos.
- [docs/23-analise-duplicacao-cadastro-2026-03-14.md](./docs/23-analise-duplicacao-cadastro-2026-03-14.md): análise duplicação de cadastro.
- [docs/24-plano-seguro-duplicacao-cadastro-2026-03-14.md](./docs/24-plano-seguro-duplicacao-cadastro-2026-03-14.md): plano seguro para corrigir duplicações.
- [docs/25-entrega-acabamento-cadastro-comandos-2026-03-14.md](./docs/25-entrega-acabamento-cadastro-comandos-2026-03-14.md): entrega acabamento cadastro/comandos (2026-03-14).
- [docs/26-diagnostico-visual-e-fluxos-2026-03-14.md](./docs/26-diagnostico-visual-e-fluxos-2026-03-14.md): diagnóstico fluxos, telas e layout visual.
- [docs/PAINEL-E-AUTENTICACAO.md](./docs/PAINEL-E-AUTENTICACAO.md): objetivo do painel e fluxo de autenticação.
- [docs/27-entrega-acabamento-visual-e-fluxos-2026-03-14.md](./docs/27-entrega-acabamento-visual-e-fluxos-2026-03-14.md): entrega acabamento visual e fluxos (2026-03-14).
- [docs/SISTEMA-VISUAL-PAINEL.md](./docs/SISTEMA-VISUAL-PAINEL.md): **sistema visual canônico** — referência ao criar/alterar UI do painel (2026-03-14).
- [docs/29-entrega-refatoracao-visual-2026-03-14.md](./docs/29-entrega-refatoracao-visual-2026-03-14.md): entrega refatoração visual profissional, finalizada (v0.1.1).
- [docs/33-ENTREGA-ONDA-1-SIMPLIFICACAO-2026-03-15.md](./docs/33-ENTREGA-ONDA-1-SIMPLIFICACAO-2026-03-15.md): Onda 1 simplificação (login, sessions, alertas, menu Auditoria) — v0.1.2.
- [docs/35-ENTREGA-ONDA-2-SIMPLIFICACAO-2026-03-15.md](./docs/35-ENTREGA-ONDA-2-SIMPLIFICACAO-2026-03-15.md): Onda 2 simplificação (nodes, bootstrap, dashboard) — v0.1.3.
- [docs/37-ENTREGA-ONDA-3-SIMPLIFICACAO-2026-03-15.md](./docs/37-ENTREGA-ONDA-3-SIMPLIFICACAO-2026-03-15.md): Onda 3 simplificação (alertas, bootstrap, node detail) — v0.1.4.
- [docs/39-ETAPA-A-VALIDACAO-SERVIDOR-2026-03-15.md](./docs/39-ETAPA-A-VALIDACAO-SERVIDOR-2026-03-15.md): Etapa A validação servidor/controlador para homologação pacote pfSense.
- [docs/40-VALIDACAO-PFSENSE-REAL-LASALLE-AGRO-2026-03-15.md](./docs/40-VALIDACAO-PFSENSE-REAL-LASALLE-AGRO-2026-03-15.md): Validação do pfSense real Lasalle Agro (estado atual, sem reinstalar).
- [docs/41-CORRECAO-DESALINHAMENTO-FLUXO-PACKAGE-2026-03-15.md](./docs/41-CORRECAO-DESALINHAMENTO-FLUXO-PACKAGE-2026-03-15.md): Correção do desalinhamento fluxo package vs fluxo automatizado (API, scripts).
- [docs/42-VALIDACAO-PRODUCAO-POS-CORRECAO-PACKAGE-2026-03-15.md](./docs/42-VALIDACAO-PRODUCAO-POS-CORRECAO-PACKAGE-2026-03-15.md): Validação em produção pós-correção — PACKAGE_RELEASE_* e package_command confirmados.
- [docs/43-ENCERRAMENTO-TRILHA-HOMOLOGACAO-ALINHAMENTO-PACKAGE-2026-03-15.md](./docs/43-ENCERRAMENTO-TRILHA-HOMOLOGACAO-ALINHAMENTO-PACKAGE-2026-03-15.md): **Encerramento formal** da trilha de homologação real e alinhamento da automação do package pfSense.

## Arquivos de governanca do projeto

- [CORTEX.md](./CORTEX.md): regras duraveis para orientar todas as decisoes tecnicas e de produto.
- [LEITURA-INICIAL.md](./LEITURA-INICIAL.md): resumo do estado atual para retomar o projeto em um novo chat.
- [PLANO.md](./PLANO.md): documento inicial de concepcao que originou esta estrutura.

## Status atual do projeto

Em `2026-03-15`, a `Fase 1 - MVP do controlador` segue operacionalmente concluída e registrada como `100%`, com `93%` do plano total entregue. A **trilha de homologação real e alinhamento do package pfSense** foi encerrada formalmente (doc 43): Lasalle Agro homologado, package 0.2.0 validado, API retornando package_command em produção, scripts alinhados.

Estado atual consolidado:

- backend em `NestJS` com ingestao, leitura, alertas, RBAC e administracao
- frontend em `Next.js` com `login`, `dashboard`, `nodes`, `alerts`, `admin` e `bootstrap`
- governanca de sessoes humanas refinada para permitir que `superadmin` liste e revogue sessoes de outros usuarios pelo painel administrativo
- fluxo de bootstrap refinado para permitir override temporario de `release_base_url` no detalhe do node durante homologacao operacional
- fluxo de bootstrap refinado para permitir tambem override temporario de `controller_url` no detalhe do node
- comando de bootstrap endurecido para usar checksum do release ao acionar `install-from-release.sh`
- dashboard, inventario e detalhe do node agora destacam versoes pfSense fora da matriz homologada
- bateria de smokes ampliada para validar tambem o release do agente com artefato, checksum e instalacao temporaria por `install-from-release.sh`
- stack local validada com `docker compose`
- gateway interno unificado em `:8088`
- proxy externo de referencia do `ISPConfig` versionado
- agente leve inicial versionado em `packages/pfsense-agent`
- checklist operacional versionado para a proxima homologacao do bootstrap em pfSense real
- detalhe do node agora centraliza tambem o bloco de verificacao pos-bootstrap para reduzir dependencia de consulta externa durante a rodada manual
- detalhe do node agora centraliza tambem um bloco de evidencias minimas para registrar a rodada manual de homologacao
- detalhe do node agora centraliza tambem criterios de aceite e classificacao inicial de falhas para a rodada manual
- auditoria agora aceita filtro por `target_id`, com atalhos no detalhe do node para a trilha `ingest.test_connection` e eventos do proprio firewall
- detalhe do node agora embute o pre-check da rodada, com conferencia de `node_uid`, `secret_hint`, URLs do release, overrides e atalho para abrir `/bootstrap` no mesmo contexto operacional
- detalhe do node agora embute tambem um pre-check no pfSense, com bloco copiavel para validar versao, DNS e conectividade HTTP/HTTPS antes da execucao do bootstrap
- detalhe do node agora embute tambem os sinais esperados durante a execucao do bootstrap e o roteiro minimo de triagem quando a instalacao falha
- detalhe do node agora embute tambem o fechamento da rodada, consolidando o que atualizar quando a homologacao passa e como retornar ao fluxo versionado quando falha
- rota `/bootstrap` agora centraliza tambem o preflight local do node, com montagem dos comandos `verify-bootstrap-release.sh` e `run-bootstrap-preflight.sh`
- rota `/bootstrap` agora centraliza tambem o pacote operacional da rodada manual do node selecionado, com comando one-shot do backend, verificacao pos-bootstrap, pre-check no pfSense e bloco de evidencias
- backup e restore do PostgreSQL do controlador agora estao versionados e validados com scripts dedicados
- gestao de tokens auxiliares do agente agora esta operacional no backend e no painel administrativo, com emissao, listagem, revogacao e auditoria por node
- pacote nativo do pfSense agora esta estruturado como port empacotavel em `packages/pfsense-package`, com runtime local do agente embutido
- primeira rodada real do pacote pfSense registrada com comandos, erros e correcoes em `18-homologacao-pfsense-package-real-2026-03-13.md`
- GUI do pacote validada em `Services > SystemUp Monitor`
- servico do pacote validado em `Status > Services`
- firewall real `Lasalle Agro` chegou ao painel com `agente ativo` e `Agente 0.1.0`
- trilha homologacao + alinhamento package encerrada (doc 43)
- escopo do servidor/controlador considerado concluido no estado atual

## Restricao principal do ambiente

Este host ja executa o Zabbix Server. Isso vira uma regra central do projeto:

- nunca estragar o Zabbix Server
- nunca substituir componentes usados pelo Zabbix
- nunca tomar portas do Zabbix
- nunca alterar `apache2`, `mysql`, `zabbix-server` ou `zabbix-agent` sem necessidade explicita e janela controlada

Estado observado neste host em `2026-03-12`:

- `zabbix-server.service`: ativo
- `zabbix-agent.service`: ativo
- `apache2.service`: ativo
- `mysql.service`: ativo

Portas observadas em uso no host em `2026-03-12`:

- `80/TCP`: `apache2`
- `10050/TCP`: `zabbix_agentd`
- `10051/TCP`: `zabbix_server`
- `3306/TCP` em `127.0.0.1`: `mysqld`
- `22/TCP`: `sshd`
- `8088/TCP`: `docker-proxy` do gateway interno do Monitor-Pfsense

Portas oficiais do ecossistema Zabbix que devem ser tratadas como reservadas:

- `80/TCP` e `443/TCP`: frontend web
- `10050/TCP`: Zabbix Agent
- `10051/TCP`: Zabbix Server e trapper
- `10052/TCP`: Zabbix Java Gateway
- `10053/TCP`: Zabbix Web Service

Ja definido:

- modelo centralizado com `push` do pfSense para o controlador
- controlador em Ubuntu 24
- stack base com `NestJS`, `PostgreSQL`, `Next.js`, `Nginx` e `Docker Compose`
- estrategia de MVP primeiro e pacote pfSense depois
- frontend dark-first e sessao server-side com cookie seguro

Ainda nao concluido (fora da trilha encerrada):

- builder nativo do package (gerar .txz e pkg add)
- smoke-admin-operations (possível falha pré-existente)
- pipelines de build e release mais maduros
- ampliacao adicional da bateria de testes operacionais

Marco atual:

- fundacao documental concluida
- `Fase 1 - MVP do controlador` concluida no escopo atual
- backend do controlador ativo em `apps/api`
- frontend operacional em `apps/web`
- `compose.yaml` e `Dockerfile` mantidos como base de deploy local
- configuracoes de proxy interno e externo versionadas
- bootstrap inicial do agente pronto para a proxima rodada de homologacao

## Objetivo pratico

Entregar um sistema que permita:

- visualizar todos os firewalls pfSense em um unico painel
- saber rapidamente quem esta online, offline ou degradado
- ver versao, uptime, IPs, gateways e servicos
- receber alertas por indisponibilidade ou servico parado
- instalar um agente leve no pfSense e evoluir para um pacote proprio com menu local

## Principios deste repositorio

- arquitetura antes de automacao pesada
- seguranca antes de controle remoto
- `heartbeat HTTPS` antes de telemetria complexa
- documentacao viva em paralelo ao codigo
- compatibilidade controlada por matriz de versoes
- coexistencia obrigatoria com o Zabbix do host
