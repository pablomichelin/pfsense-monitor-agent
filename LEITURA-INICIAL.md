# Leitura Inicial

## Objetivo deste arquivo

Este arquivo existe para retomada rapida do projeto em qualquer novo chat ou nova sessao.

Leia este arquivo primeiro.

## Estado atual

Data de referencia: `2026-03-13`

Fase atual:

- `Fase 1 - MVP do controlador`

Progresso:

- fase atual: `100%`
- plano total: `93%`
- tarefa atual: `consolidar a homologacao real do pacote pfSense em pfSense CE 2.8.1 apos a primeira rodada funcional em campo, com foco em endurecer o fluxo e eliminar tentativa e erro`
- escopo do servidor/controlador: `100%`
- observacao de continuidade: `abrir novo chat e seguir a partir deste arquivo e de 00_inicio.md e 00-README.md`

Status:

- arquitetura definida
- documentacao base criada
- fase de planejamento e documentacao concluida
- codigo do backend iniciado
- scaffold inicial da API criado em `apps/api`
- schema inicial do `PostgreSQL` versionado com `Prisma`
- endpoint `POST /api/v1/ingest/heartbeat` implementado em primeiro corte
- endpoint `POST /api/v1/ingest/test-connection` implementado para validar autenticacao do agente sem persistir heartbeat
- endpoints `GET /api/v1/dashboard/summary`, `GET /api/v1/nodes` e `GET /api/v1/nodes/:id` implementados
- fluxo administrativo inicial implementado para `client`, `site`, `node` e rotacao de `node_secret`
- frontend inicial em `Next.js` criado em `apps/web`
- build local validado para `apps/api` e `apps/web`
- stack local validada com `docker compose`
- `compose.yaml` inicial criado sem usar portas do ecossistema Zabbix
- rotina periodica do backend implementada para reconciliar status por ausencia de heartbeat
- alerta `heartbeat_missing` agora abre ao entrar em `offline` e fecha na recuperacao
- autenticacao humana server-side implementada no `NestJS` com sessao em banco e cookie seguro
- painel `Next.js` atualizado para login/logout com sessao server-side
- stream `SSE` implementada no backend para atualizacao do painel
- proxy `SSE` adicionada no `Next.js` para consumo no mesmo dominio do painel
- dashboard, lista de firewalls e detalhe do node agora fazem refresh server-side em tempo real
- endpoint de filtros do inventario implementado para clientes e sites
- tela de inventario atualizada com filtros reais por cliente, site, status e busca
- checklist operacional de homologacao do `SSE` registrado para o caminho `Cloudflare -> ISPConfig -> origin`
- compose ajustado para publicar apenas um gateway interno em `8088`, alinhado ao dominio unico do MVP
- validacao HTTP concluida para `/dashboard` e `/api/realtime/dashboard` via `192.168.100.253` e dominio publico
- login humano e stream `SSE` autenticado validados no dominio publico com cookies seguros, evento `connected` e `keepalive`
- smoke test local versionado para validar `login -> SSE autenticado -> heartbeat assinado -> dashboard.refresh -> inventario online`
- verificador versionado para checar cabecalhos e permanencia do stream autenticado sem criar dados
- indicador do frontend atualizado para mostrar ultimo evento realtime e refresh em andamento
- telas principais agora exibem tambem o horario do ultimo render server-side para facilitar validacao visual do refresh
- smoke test completo repetido com sucesso no dominio publico `https://pfs-monitor.systemup.inf.br`
- stream autenticado no dominio publico manteve conexao aberta por `36s` com `connected` e `keepalive`
- verificador operacional `scripts/verify-sse-stream.sh` validado no dominio publico com `connected=1` e `keepalive=2`
- fluxo `test-connection` agora responde `connection validated` para node autenticado sem alterar telemetria operacional
- script `scripts/test-agent-connection.sh` adicionado para validar autenticacao do agente sem gravar heartbeat
- `test-connection` agora grava trilha em `audit_logs` com acao `ingest.test_connection`
- esqueleto inicial do agente leve versionado em `packages/pfsense-agent` com script shell e arquivo de configuracao de exemplo
- bootstrap inicial do agente versionado com `install.sh`, `uninstall.sh`, loop e servico `rc.d`
- script de build do artefato do agente adicionado para gerar `monitor-pfsense-agent-vX.Y.Z.tar.gz`
- instalador `install-from-release.sh` adicionado para fluxo one-shot com download e validacao opcional de SHA256
- endpoint administrativo para gerar comando de bootstrap do node adicionado em `GET /api/v1/admin/nodes/:id/bootstrap-command`
- endpoint de bootstrap do node validado localmente com override `?release_base_url=` e comando one-shot completo
- tela de detalhe do node agora exibe a secao de bootstrap do agente com `node_uid`, `secret_hint` e comando one-shot quando disponivel
- secao de bootstrap no detalhe do node agora exibe tambem `artifact_url`, `checksum_url`, `installer_url` e orientacao operacional
- lista de firewalls agora destaca status de bootstrap do agente e link direto para a acao no detalhe do node
- inventario agora resume bootstrap em cards com totais de `prontos`, `agente ativo` e `bloqueados`
- rota dedicada `/bootstrap` adicionada para operacao em lote do agente
- rota `/bootstrap` agora aceita filtros por cliente, site, busca e bucket, com resumo do escopo filtrado e atalhos rapidos entre buckets
- rota `/bootstrap` agora monta tambem o preflight local do node alvo com `verify-bootstrap-release.sh` e `run-bootstrap-preflight.sh`, incluindo overrides temporarios
- rota `/bootstrap` agora centraliza tambem o pacote operacional da rodada manual, reaproveitando o `bootstrap-command` do backend com comando one-shot, verificacao pos-bootstrap, pre-check no pfSense e bloco de evidencias no mesmo contexto
- bootstrap instalado do agente corrigido para usar config padrao em `/usr/local/etc/monitor-pfsense-agent.conf`
- agente leve agora detecta `mgmt_ip`, `wan_ip_reported`, `memory_percent`, `disk_percent` e lista configuravel de servicos quando possivel
- instalador do agente agora aceita overrides de `cpu`, `memory`, `disk` e `services` para bootstrap assistido
- artefato `monitor-pfsense-agent-v0.1.0.tar.gz` reconstruido apos a melhoria da coleta local
- modulo de alertas do servidor adicionado com `GET /api/v1/alerts`, `POST /api/v1/alerts/:id/acknowledge` e `POST /api/v1/alerts/:id/resolve`
- painel ganhou rota `/alerts` com filtros e acoes humanas para reconhecer e resolver alertas
- painel ganhou rota `/admin` com formularios para criar `client`, `site` e `node`
- cadastro de node no painel agora redireciona direto para o detalhe com foco no bootstrap
- detalhe do node agora permite `rekey` da credencial do agente direto pelo painel
- detalhe do node agora permite alternar `maintenance_mode` direto pelo painel
- detalhe do node agora permite editar metadados basicos do firewall pelo painel
- rota `/admin` agora permite editar `client` e `site` inline pelo painel
- smoke administrativo `scripts/smoke-admin-operations.sh` agora valida fim a fim `create/update client-site-node`, `maintenance`, `rekey`, `test-connection`, `heartbeat`, `ack` e `resolve`
- smoke administrativo local reexecutado com sucesso no stack `docker compose` atual em `2026-03-12`
- RBAC inicial aplicado no backend para restringir rotas `/api/v1/admin` a `superadmin/admin`
- RBAC inicial aplicado no backend para permitir `ack/resolve` de alertas apenas a `superadmin/admin/operator`
- painel agora oculta navegacao e acoes administrativas conforme o `role` da sessao
- autenticacao humana agora aceita usuarios locais persistidos no banco com senha hash `scrypt`
- rota `/admin` agora permite criar e editar usuarios com `role`, `status` e rotacao de senha
- smoke administrativo local agora valida tambem criacao e login de usuario local `admin`
- backend agora impede rebaixar ou desativar o ultimo `superadmin` ativo
- backend agora impede auto-rebaixamento ou auto-desativacao da sessao administrativa atual
- governanca humana refinada para reservar `create/list/update users` apenas a `superadmin`
- rota `/admin` agora oculta gestao de usuarios quando a sessao e apenas `admin`
- endpoints `GET /api/v1/auth/sessions` e `POST /api/v1/auth/sessions/:id/revoke` adicionados para governanca de sessoes humanas
- rota `/sessions` adicionada no frontend para listar e revogar sessoes humanas da propria conta
- endpoints `GET /api/v1/admin/users/:id/sessions` e `POST /api/v1/admin/users/:id/sessions/:sessionId/revoke` adicionados para governanca administrativa de sessoes humanas
- rota `/admin` agora exibe e permite revogar sessoes humanas de outros usuarios quando a sessao atual e `superadmin`
- endpoint `GET /api/v1/admin/audit` adicionado para leitura administrativa da trilha de auditoria
- rota `/audit` adicionada no frontend para leitura operacional de eventos de `auth`, `admin` e acoes sensiveis
- detalhe do node agora aceita override temporario de `release_base_url` para homologacao operacional do bootstrap sem alterar a configuracao permanente da API
- detalhe do node agora aceita override temporario de `controller_url` alem do `release_base_url` para homologacao do bootstrap em ambientes alternativos
- comando one-shot de bootstrap agora baixa tambem o arquivo `.sha256` do release e repassa `--sha256` ao instalador para validacao de integridade
- detalhe do node agora exibe tambem um bloco versionado de verificacao pos-bootstrap para executar `status`, `print-config`, `test-connection`, `heartbeat` e `tail` local no pfSense
- detalhe do node agora gera tambem um bloco de evidencias minimas da rodada para registrar release, overrides, comando usado e resultados manuais da homologacao
- detalhe do node agora explicita tambem os criterios de aceite e a classificacao inicial de falhas da rodada de bootstrap
- auditoria administrativa agora aceita filtro por `target_id`, e o detalhe do node passou a expor atalhos diretos para verificar `ingest.test_connection` e os eventos do proprio node no controlador
- detalhe do node agora incorpora tambem o pre-check da rodada no proprio painel, com `node_uid`, `secret_hint`, URLs do release, overrides ativos e atalho para `/bootstrap` ja filtrado no contexto do node
- detalhe do node agora incorpora tambem um bloco de pre-check no pfSense com `cat /etc/version`, `drill` e `fetch` para validar versao, DNS e saida HTTP/HTTPS antes do bootstrap real
- detalhe do node agora explicita tambem os sinais esperados durante a execucao do bootstrap e o procedimento minimo em caso de falha, incluindo foco em DNS, TLS, download e `SHA256 mismatch`
- detalhe do node agora explicita tambem o fechamento da rodada, com checklist de pos-homologacao bem-sucedida e saida operacional quando a rodada falha
- backend agora expoe matriz homologada de versoes do pfSense e marca nodes fora da matriz no dashboard, inventario e detalhe do firewall
- smoke dedicado de RBAC agora valida `operator` e `readonly` contra leituras, escrita de alertas e bloqueios administrativos, incluindo bloqueio de acesso a `GET /api/v1/admin/audit`
- suite local `scripts/run-smoke-suite.sh` adicionada para executar em sequencia os smokes de realtime, administracao e RBAC
- smoke `scripts/smoke-agent-release.sh` adicionado para validar artefato, checksum, instalador HTTP e ciclo `install/uninstall` do release do agente em `INSTALL_ROOT` temporario
- smoke `scripts/smoke-auth-sessions.sh` adicionado para validar listagem e revogacao de sessoes humanas
- smoke `scripts/smoke-auth-sessions.sh` agora valida tambem a renderizacao autenticada da rota `/sessions`
- smoke `scripts/smoke-auth-sessions.sh` agora valida tambem listagem e revogacao administrativa de sessoes humanas por `superadmin`
- smoke `scripts/smoke-bootstrap-flow.sh` adicionado para validar fallback, override temporario, detalhe do node e buckets da rota `/bootstrap`
- smoke administrativo agora valida tambem `GET /api/v1/admin/audit` e a renderizacao autenticada da rota `/audit`
- smoke administrativo agora valida tambem nodes fora da matriz homologada via `GET /api/v1/nodes`, `GET /api/v1/nodes/:id` e `GET /api/v1/dashboard/summary`
- verificador `scripts/verify-bootstrap-release.sh` adicionado para validar `bootstrap-command`, `artifact_url`, `checksum_url` e `installer_url` de um node real antes da rodada manual
- wrapper `scripts/run-bootstrap-preflight.sh` adicionado para encadear smoke do release e verificacao operacional do bootstrap em um unico comando
- `scripts/run-bootstrap-preflight.sh` agora aceita `AUTO_STAGE_RELEASE=1` para publicar temporariamente o release local por HTTP e validar o `bootstrap-command` mesmo quando `release_base_url` ainda nao esta configurado na API
- `scripts/verify-origin-contract.sh` adicionado para validar em um unico passo `healthz`, `login`, asset estatico versionado, limite de payload `64k` e `SSE` autenticado no gateway interno ou no dominio publico
- `scripts/backup-postgres.sh` adicionado para gerar dump versionado do PostgreSQL com checksum e retencao local simples
- `scripts/verify-backup-restore.sh` adicionado para validar restore do dump em `PostgreSQL 17` temporario, confirmando estrutura logica minima do banco sem tocar no ambiente principal
- gestao de tokens auxiliares do agente adicionada no backend e no painel administrativo, com emissao, listagem, revogacao e auditoria por node
- pacote nativo do pfSense evoluido em `packages/pfsense-package` para port empacotavel, com `Makefile`, `pkg-plist`, scripts de instalacao, runtime local do agente e GUI de configuracao/diagnostico
- fluxo one-shot do pacote pfSense agora tambem esta versionado, com artefato `tar.gz`, instalador por release GitHub e bootstrap copiavel para `Diagnostics > Command Prompt`
- rodada real de homologacao do pacote pfSense executada em `2026-03-13`, com registro completo em `18-homologacao-pfsense-package-real-2026-03-13.md`
- Onda 1 da simplificacao do painel executada em `2026-03-15`: login, sessions, alertas e menu Auditoria; versao v0.1.2; ver `docs/33-ENTREGA-ONDA-1-SIMPLIFICACAO-2026-03-15.md`
- Onda 2 da simplificacao executada em `2026-03-15`: nodes (3 cards), bootstrap (3 cards), dashboard (5 cards), admin preservado; versao v0.1.3; ver `docs/35-ENTREGA-ONDA-2-SIMPLIFICACAO-2026-03-15.md`
- Onda 3 da simplificacao executada em `2026-03-15`: alertas (severity/type em avancado), bootstrap (overrides em avancado), node detail (ha_role em avancado); versao v0.1.4; ver `docs/37-ENTREGA-ONDA-3-SIMPLIFICACAO-2026-03-15.md`
- menu do pacote validado em `Services > SystemUp Monitor`
- servico do pacote validado em `Status > Services`
- assinatura HMAC do agente corrigida e alinhada ao backend usando `timestamp + "\n" + rawBody`
- payloads de `test-connection` e `heartbeat` alinhados ao contrato real da API
- firewall real `Lasalle Agro` chegou ao painel com `agente ativo`, `Agente 0.1.0` e ultimo contato recente
- causa raiz mais provavel do `degraded` do node real identificada no runtime do agente: a lista padrao de servicos incluia itens nao habilitados no firewall e o backend os tratava como falha relevante
- runtime do agente agora filtra a lista padrao para enviar apenas servicos habilitados ou configurados no `config.xml` do pfSense, reduzindo falso positivo de `degraded`
- package pfSense agora expoe selecao explicita por firewall dos servicos nativos monitorados, evitando degradacao por recurso que o cliente nao usa
- catalogo inicial de pacotes monitoraveis do pfSense agora esta versionado para a proxima fase de expansao do produto
- cadastro inicial no painel administrativo agora esta simplificado: `client code`, `site code` e `node_uid` nascem automaticamente no backend, reduzindo o formulario ao minimo operacional
- estrategia do pacote pfSense consolidada: usar o framework oficial de packages para menu/configuracao e manter pagina local em `/usr/local/www`, sem editar `head.inc` como solucao final
- ingest do backend passa a remover servicos/gateways fora do ultimo heartbeat; painel reflete apenas o conjunto atualmente monitorado
- backend aceita `impact_on_status` (critical/optional) no heartbeat; apenas servicos critical degradam o node
- Fase B: catalogo com campo `service_name`, agente com `MONITOR_AGENT_PACKAGES`, GUI com campo "Pacotes adicionais"; ver `21-evolucao-servicos-e-fase-b-2026-03-13.md`
- suite local `scripts/run-smoke-suite.sh` executada com sucesso no stack atual em `2026-03-12`, concluindo `realtime`, `admin` e `RBAC` em `14s`
- smokes `admin` e `RBAC` reexecutados com sucesso apos a separacao `superadmin` x `admin` na gestao de usuarios
- suite local reexecutada com sucesso em `2026-03-12` apos incluir governanca de sessoes humanas, concluindo `realtime`, `auth sessions`, `admin` e `RBAC` em `16s`
- smoke `scripts/smoke-rbac-roles.sh` reexecutado com sucesso em `2026-03-12` para confirmar que `operator` e `readonly` seguem bloqueados no endpoint administrativo de auditoria
- configuracao de referencia do proxy externo no `ISPConfig` agora esta versionada em `infra/ispconfig`
- suite local reexecutada com sucesso em `2026-03-12` apos incluir o smoke de bootstrap, concluindo `realtime`, `auth sessions`, `bootstrap`, `admin` e `RBAC` em `19s`
- suite local reexecutada com sucesso em `2026-03-12` apos incluir o smoke de release do agente, concluindo `agent release`, `realtime`, `auth sessions`, `bootstrap`, `admin` e `RBAC` em `19s`

Restricao principal do ambiente:

- este host tambem e um servidor Zabbix em operacao
- norma principal: nunca estragar ou alterar algo do Zabbix Server
- `docker compose` validado localmente nesta iteracao

## O que ja esta decidido

- arquitetura `push`: pfSense envia heartbeat para o controlador
- controlador em Ubuntu 24
- stack do controlador: `NestJS`, `PostgreSQL`, `Next.js`, `Nginx`, `Docker Compose`
- `SSE` para atualizacao do painel no MVP
- agente leve primeiro, pacote pfSense depois
- seguranca minima com `HTTPS`, token por firewall e assinatura HMAC
- o projeto deve coexistir com `zabbix-server`, `zabbix-agent`, `apache2` e `mysql` do host
- nao usar portas do ecossistema Zabbix neste host sem decisao explicita
- dominio publico do MVP: `https://pfs-monitor.systemup.inf.br`
- Cloudflare na frente do dominio
- `ISPConfig` em `192.168.100.253` como proxy reverso e ponto de TLS
- origem interna do Monitor-Pfsense em `192.168.100.244:8088`
- heartbeat fixado em `30s`
- um unico dominio no MVP para painel e ingestao
- bootstrap por release versionada e controlada
- SNMP complementar fora do MVP inicial
- stack de frontend aprovada com `Next.js App Router`, `TypeScript`, `Tailwind`, `shadcn/ui`, `TanStack Table`, `Recharts` e `SSE`
- direcao visual `dark-first`
- modelo de sessao decidido: server-side com cookie seguro
- autenticacao humana inicial centralizada no `NestJS`
- gestao de usuarios humanos reservada a `superadmin`; `admin` opera inventario e bootstrap, mas nao governa credenciais humanas
- cada usuario humano pode listar e revogar outras sessoes proprias sem derrubar a sessao atual por engano
- endpoint de heartbeat decidido: `POST /api/v1/ingest/heartbeat`
- autenticacao do heartbeat por `X-Node-Uid`, `X-Timestamp` e `X-Signature`
- `POST /api/v1/ingest/test-connection` reutiliza o mesmo esquema de autenticacao HMAC do heartbeat
- `node_uid` nasce no bootstrap, e o backend gera `node_secret`
- servicos finais do MVP: `unbound`, `dhcpd`, `openvpn`, `ipsec`, `wireguard`, `ntpd` e `dpinger/gateways`
- status decidido: `online` ate `90s`, `degraded` entre `91s` e `300s` ou falha relevante, `offline` acima de `300s`
- retencao decidida para heartbeats, rollups, eventos e auditoria
- primeira homologacao oficial do agente: `pfSense CE 2.8.1`
- a versao do pfSense deve ficar visivel em dashboard, lista de firewalls, visao por cliente e detalhe do no
- o projeto usara `Semantic Versioning`
- o painel deve exibir a versao do sistema e `Desenvolvido por Systemup`
- `Desenvolvido por Systemup` deve apontar para `https://www.systemup.inf.br`

## O que existe no repositorio

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
- `14-encerramento-da-fase-de-planejamento.md`
- `15-versionamento-e-branding.md`
- `16-status-e-progresso-do-projeto.md`
- `apps/api`
- `apps/web`
- `compose.yaml`
- `infra/docker/api.Dockerfile`
- `infra/docker/web.Dockerfile`
- `infra/ispconfig/README.md`
- `infra/ispconfig/nginx.monitor-pfsense.conf`
- `.env.api.example`
- `.env.web.example`
- `.env.db.example`
- `CORTEX.md`
- `PLANO.md`

## O que falta fazer em seguida

Proximo bloco recomendado:

1. ler `18-homologacao-pfsense-package-real-2026-03-13.md` antes de qualquer nova mudanca no pacote pfSense
2. manter a homologacao local do servidor fechada e repetir a suite `scripts/run-smoke-suite.sh` sempre que houver mudanca em `admin`, `alerts`, `rekey`, `maintenance`, `update node`, `update client`, `update site`, `bootstrap` ou `realtime`
3. revisar por que o firewall real `Lasalle Agro` apareceu como `degraded` apesar de chegar com `agente ativo`
4. endurecer o fluxo de instalacao do pacote pfSense para nao depender de correcao manual em firewall de cliente
5. validar novamente o contrato externo do proxy com `BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/verify-origin-contract.sh` se houver qualquer ajuste em `ISPConfig`, `Cloudflare` ou `nginx`
6. usar `17-checklist-homologacao-bootstrap-pfsense-real.md` como roteiro resumido e `18-homologacao-pfsense-package-real-2026-03-13.md` como memoria detalhada da rodada real
7. copiar `packages/pfsense-package` para um builder compativel com `pfSense CE 2.8.1`, executar `make package` e instalar o artefato gerado no firewall de teste com `pkg add`

## Definicoes ainda em aberto

- formato do bootstrap inicial no pfSense
- limiares exatos de perda e latencia para gateway `degraded`

## Regras para continuar o projeto

- nao redesenhar a arquitetura sem necessidade real
- respeitar `CORTEX.md`
- atualizar este arquivo sempre que o estado do projeto mudar
- sempre verificar se a acao planejada pode afetar Zabbix, Apache ou MySQL

## Como usar em um novo chat

Cole ou informe que o novo contexto deve considerar:

- `LEITURA-INICIAL.md`
- `CORTEX.md`
- `00-README.md`

Isso deve bastar para retomar o desenvolvimento sem explicar tudo novamente.

## Ultima entrega registrada

- `2026-03-12`: `packages/pfsense-package` evoluido de scaffold para port empacotavel do pfSense, com `Makefile`, `pkg-plist`, scripts `pkg-install/pkg-deinstall`, runtime do agente embutido, sync da GUI gerando `/usr/local/etc/monitor-pfsense-agent.conf` e controle do servico `monitor_pfsense_agent`; gestao de tokens auxiliares, backup/restore do PostgreSQL, `verify-origin-contract.sh`, `AUTO_STAGE_RELEASE=1` e a suite completa permaneceram validados na mesma iteracao
- `2026-03-13`: primeira rodada funcional de homologacao real do pacote pfSense concluida com GUI, servico e heartbeat real chegando ao painel para o firewall `Lasalle Agro`; linha do tempo, comandos corretos, erros reais e correcoes registradas em `18-homologacao-pfsense-package-real-2026-03-13.md`
- `2026-03-13`: runtime do agente ajustado para filtrar a lista padrao de servicos conforme o `config.xml` do pfSense, atacando a causa mais provavel do falso `degraded` observado no node `Lasalle Agro`
- `2026-03-13`: rodada de endurecimento do package pfSense registrada em `20-endurecimento-pfsense-package-2026-03-13.md`, incluindo `v0.1.1` a `v0.1.6`, correcao do fluxo HTTP/HMAC, coleta local refinada e selecao explicita por firewall dos servicos nativos monitorados
- `2026-03-13`: evolucao da logica de servicos e Fase B em `21-evolucao-servicos-e-fase-b-2026-03-13.md`: limpeza de orfaos no ingest, impact_on_status no backend, catalogo com service_name, MONITOR_AGENT_PACKAGES no agente e GUI

## Notas especificas para o proximo chat

- o chat anterior confirmou um exemplo antigo do usuario que criava menu manual no pfSense alterando `/usr/local/www/head.inc` e publicando uma pagina em `/usr/local/www/services_emailbackup.php`
- esse exemplo foi analisado apenas para confirmar caminhos visuais do pfSense
- decisao tomada: nao reproduzir essa tecnica no produto final
- direcao escolhida: continuar com `packages/pfsense-package` usando o framework oficial de packages do pfSense
- paginas locais podem continuar em `/usr/local/www/*.php`, mas o menu final deve nascer do XML do package, nao de patch manual em `head.inc`

Entrega:

- scaffold inicial do backend em `NestJS + Fastify`
- schema inicial em `Prisma` com migracao versionada
- `healthz` e `POST /api/v1/ingest/heartbeat`
- atualizacao basica de status, heartbeats, servicos, gateways e alertas
- endpoints protegidos do painel para resumo e leitura de nodes
- fluxo administrativo inicial com emissao e rotacao de `node_secret`
- frontend minimo com rotas `/dashboard`, `/nodes` e `/nodes/[id]`
- build local validado em `apps/api` e `apps/web`
- `docker compose up -d db api web` validado localmente
- arquivos operacionais iniciais: `compose.yaml`, `Dockerfile` e exemplos de `.env`
- reconciliador periodico implementado em `apps/api` para atualizar `status` observado dos nodes por janela de heartbeat
- limiares de `degraded` e `offline` centralizados em configuracao da API
- alerta `heartbeat_missing` aberto automaticamente quando o node passa para `offline`
- alerta `heartbeat_missing` resolvido automaticamente quando o node sai da janela de `offline`
- build local da API revalidado apos a implementacao
- autenticacao humana implementada com endpoints `login`, `me` e `logout` no backend
- sessao persistida no banco com cookie seguro e protecao CSRF nas rotas mutaveis autenticadas
- frontend atualizado com tela de login e logout server-side
- endpoint `GET /api/v1/dashboard/events` implementado para `SSE`
- backend publica eventos de refresh ao aceitar heartbeat e ao reconciliar mudancas de status
- frontend atualizado com stream em tempo real e refresh server-side nas telas principais
- endpoint `GET /api/v1/nodes/filters` implementado para popular filtros reais do inventario
- frontend do inventario atualizado para filtrar por cliente e site com dados reais do banco
- documentacao de deploy atualizada com checklist e configuracao de referencia para `SSE` no proxy reverso
- gateway `nginx` interno adicionado ao Compose para servir painel, proxy `SSE` e API no mesmo origin `:8088`
- origem unica `:8088` revalidada localmente e tambem atraves do `ISPConfig` e da Cloudflare
- fluxo autenticado do `SSE` validado via `curl` no dominio publico com `login -> cookie seguro -> connected -> keepalive`
- smoke test local automatizado adicionado em `scripts/smoke-realtime-refresh.sh`
- verificador operacional do stream autenticado adicionado em `scripts/verify-sse-stream.sh`
- endpoint `POST /api/v1/ingest/test-connection` implementado sem persistir heartbeat ou alterar status do node
- script operacional para `test-connection` adicionado em `scripts/test-agent-connection.sh`
- auditoria de `test-connection` adicionada para rastrear validacoes do agente
- esqueleto do agente leve adicionado em `packages/pfsense-agent` e validado localmente com `test-connection` e `heartbeat`
- bootstrap inicial do agente adicionado em `packages/pfsense-agent/bootstrap` e validado com `INSTALL_ROOT` temporario
- empacotamento versionado do agente validado localmente com `dist/pfsense-agent/monitor-pfsense-agent-v0.1.0.tar.gz`
- manifesto `SHA256SUMS` e instalacao via release local validados com `file://` e `INSTALL_ROOT` temporario
- endpoint administrativo de bootstrap validado localmente retornando `artifact_url`, `installer_url` e `command`
- frontend do detalhe do node atualizado para consumir e exibir o bootstrap do agente
- fluxo `SSE + heartbeat + inventario` validado localmente com evento `dashboard.refresh` para node provisionado no ambiente Compose
- smoke test completo repetido com sucesso no dominio publico `https://pfs-monitor.systemup.inf.br`
- stream externo autenticado validado por mais de `30s` com `connected` e `keepalive`
- verificador externo rapido validado no dominio publico sem necessidade de criar dados operacionais
- bootstrap local do agente revalidado em `INSTALL_ROOT` temporario apos ajuste do caminho de config
- payload de heartbeat do agente revalidado localmente com servicos e metricas basicas
- build da API revalidado apos a central de alertas
- build do frontend recompilou e gerou `.next/BUILD_ID`; medicao com `timeout 150s` mostrou que o `next build` conclui normalmente em cerca de `40s`
- rota administrativa `/admin` adicionada ao frontend com formularios de cadastro basico
- smoke operacional administrativo adicionado em `scripts/smoke-admin-operations.sh`
- smoke administrativo local validado com sucesso cobrindo `client`, `site`, `node`, `maintenance`, `rekey`, `test-connection` e ciclo humano de alertas
- fluxo de criacao de node no painel agora abre o detalhe do firewall para seguir com o bootstrap
- fluxo de `rekey` do agent secret ligado ao detalhe do node e revalidado com artefato `.next/BUILD_ID` atualizado
- fluxo de `maintenance_mode` ligado ao detalhe do node com endpoint administrativo e auditoria
- fluxo de atualizacao de metadados do node ligado ao detalhe do firewall e revalidado em build
- fluxo de atualizacao de `client` e `site` ligado a rota `/admin` e revalidado em build
- RBAC inicial adicionado com `RolesGuard` no backend e reflexo de permissao no painel para `Admin`, `alerts` e detalhe do `node`
- builds de `apps/api` e `apps/web` revalidados apos RBAC inicial
- smoke administrativo reexecutado com sucesso apos RBAC inicial usando sessao `superadmin`
- coluna `password_hash` adicionada ao schema de `users` com migracao aplicada no banco local do Compose
- login humano atualizado para usar usuario local persistido no banco, com bootstrap por env mantido como caminho de recuperacao `superadmin`
- gestao inicial de usuarios adicionada ao backend e ao painel `/admin`
- smoke administrativo estendido e validado cobrindo criacao e login de usuario local com papel `admin`
- regra de protecao do ultimo `superadmin` adicionada ao backend e validada no smoke administrativo
- smoke `scripts/smoke-rbac-roles.sh` adicionado e validado cobrindo `operator` e `readonly`
- referencia versionada do proxy externo em `infra/ispconfig/nginx.monitor-pfsense.conf` e `infra/ispconfig/README.md`
- documentacao de deploy atualizada para usar `192.168.100.244:8088` como origem unica tambem no `ISPConfig`

Pendencias imediatas:

- transformar o esqueleto do agente em bootstrap inicial utilizavel no pfSense
- validar o bootstrap inicial do agente em um pfSense homologado
- validar o artefato versionado do bootstrap em um pfSense homologado
- validar o instalador `install-from-release.sh` em um pfSense homologado
- validar o refresh visual do navegador no dominio publico durante mudanca real de heartbeat
- revisar a configuracao efetiva do `ISPConfig` usada em producao ou homologacao

## Estado observado do host em `2026-03-12`

Servicos ativos:

- `zabbix-server.service`
- `zabbix-agent.service`
- `apache2.service`
- `mysql.service`

Portas observadas:

- `80/TCP`
- `10050/TCP`
- `10051/TCP`
- `3306/TCP` em loopback
- `8088/TCP`

Portas reservadas do ecossistema Zabbix:

- `80/TCP`
- `443/TCP`
- `10050/TCP`
- `10051/TCP`
- `10052/TCP`
- `10053/TCP`

## Fluxo externo decidido

```text
pfSense cliente
-> https://pfs-monitor.systemup.inf.br
-> Cloudflare
-> ISPConfig 192.168.100.253
-> proxy reverso
-> Monitor-Pfsense 192.168.100.244:8088
```
