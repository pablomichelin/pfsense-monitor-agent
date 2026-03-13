# 00 Inicio

Este arquivo existe para retomada imediata do projeto em qualquer novo chat.

## Leitura obrigatoria

Leia estes 3 arquivos primeiro:

1. `LEITURA-INICIAL.md`
2. `CORTEX.md`
3. `00-README.md`

## Ponto oficial de continuidade

Considere esses 3 arquivos como a base oficial para retomar o trabalho.

Regras:

- nao reiniciar arquitetura ou decisoes ja fechadas sem necessidade real
- continuar sempre do estado registrado em `LEITURA-INICIAL.md`
- tratar `CORTEX.md` como regra duravel de produto, arquitetura e operacao
- usar `00-README.md` como indice da documentacao e mapa do repositorio

## Estado atual resumido

Data de referencia: `2026-03-12`

Fase atual:

- `Fase 1 - MVP do controlador`

Progresso registrado:

- fase atual: `100%`
- plano total: `93%`
- escopo do servidor/controlador: `100%`

Situacao geral:

- documentacao principal consolidada
- backend em `NestJS` implementado para o MVP atual
- frontend em `Next.js` ativo para dashboard, inventario, alertas e administracao
- stack local validada com `Docker Compose`
- proxy interno em `8088` alinhado ao dominio unico do MVP
- bootstrap inicial do agente leve ja versionado
- configuracao de referencia do `ISPConfig` ja versionada
- suite local ampliada e validada para `agent release`, `realtime`, `auth sessions`, `bootstrap`, `admin` e `RBAC`
- dashboard, inventario e detalhe do node agora destacam versoes pfSense fora da matriz homologada
- governanca humana consolidada com usuarios locais, RBAC e revogacao de sessoes
- checklist operacional do bootstrap em pfSense real agora esta versionado
- preflight operacional do bootstrap agora esta automatizado com verificacao do release e dos URLs do node
- rota `/bootstrap` agora centraliza tambem o pacote operacional da rodada manual, com comando one-shot, verificacao pos-bootstrap, pre-check no pfSense e bloco de evidencias no mesmo contexto
- `scripts/run-bootstrap-preflight.sh` agora aceita `AUTO_STAGE_RELEASE=1` para validar localmente o `bootstrap-command` com um release temporario, mesmo sem `release_base_url` persistido na API
- `scripts/verify-origin-contract.sh` agora consolida a validacao operacional de `healthz`, `login`, asset estatico, limite `64k` e `SSE` do gateway interno ou do dominio publico
- backup e restore do `PostgreSQL` do controlador agora estao versionados e validados com `scripts/backup-postgres.sh` e `scripts/verify-backup-restore.sh`
- gestao de tokens auxiliares do agente agora esta operacional no backend e no painel administrativo, com emissao, listagem, revogacao e auditoria por node
- pacote nativo do pfSense agora esta estruturado como port empacotavel em `packages/pfsense-package`, com runtime local do agente embutido
- pacote nativo do pfSense agora tambem possui fluxo one-shot por release GitHub para instalar com uma linha no `Diagnostics > Command Prompt`
- cadastro inicial de `cliente`, `site` e `firewall` no painel agora gera identificadores tecnicos automaticamente para evitar redundancia na primeira implantacao
- estrategia atual do pacote pfSense definida: pagina local em `/usr/local/www/*.php`, registro de menu pelo framework de packages em XML/PHP, sem editar `head.inc` como solucao final

## O que ja esta decidido

Nao rediscutir sem motivo forte:

- arquitetura `push`, com o pfSense enviando heartbeat ao controlador
- controlador em `Ubuntu 24`
- stack base do MVP: `NestJS`, `PostgreSQL`, `Next.js`, `Nginx` e `Docker Compose`
- atualizacao em tempo real via `SSE`
- agente leve primeiro, pacote nativo do pfSense depois
- autenticacao humana centralizada no backend `NestJS`
- heartbeat do agente em `30s`
- dominio unico do MVP: `https://pfs-monitor.systemup.inf.br`
- proxy externo por `Cloudflare -> ISPConfig -> origin`
- origem interna do projeto em `192.168.100.244:8088`
- este host tambem executa `Zabbix`, que tem prioridade operacional

## Restricao mais importante

Nunca alterar o ambiente do Zabbix por conveniencia do projeto.

Na pratica:

- nao usar portas do ecossistema Zabbix sem decisao explicita
- nao mexer em `zabbix-server`, `zabbix-agent`, `apache2` ou `mysql` sem necessidade real
- se houver conflito, o projeto se adapta e o Zabbix nao

## Proximo bloco recomendado

Seguir nesta ordem:

1. conferir ou aplicar no ambiente externo a configuracao versionada do `ISPConfig`
2. validar o contrato do proxy externo com `BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/verify-origin-contract.sh`
3. manter o servidor local fechado e repetir `scripts/run-smoke-suite.sh` sempre que houver mudanca em `admin`, `alerts`, `rekey`, `maintenance`, `update node`, `update client`, `update site` ou `realtime`
4. executar `scripts/run-bootstrap-preflight.sh <node_id>` para fechar a checagem pre-rodada
5. em laboratorio local sem release publicada, preferir `AUTO_STAGE_RELEASE=1 scripts/run-bootstrap-preflight.sh <node_id>`
6. retomar a homologacao do bootstrap em `pfSense CE 2.8.1` real
7. publicar o artefato de `packages/pfsense-package` no GitHub e validar o instalador one-shot no `Diagnostics > Command Prompt`
8. copiar `packages/pfsense-package` para um builder compativel com `pfSense CE 2.8.1`, executar `make package` e instalar o artefato no firewall de teste com `pkg add`
9. homologar no pfSense real a GUI local, a escrita da config do agente e o servico `monitor_pfsense_agent`

## Tarefa atual registrada

- `retomar a homologacao do bootstrap inicial do agente em pfSense CE 2.8.1 real`
- apoio atual: `suite local de smokes + checklist operacional + preflight do bootstrap`
- observacao: `o escopo do servidor/controlador esta concluido no estado atual; o restante do projeto ficou concentrado no pfSense real e na GUI nativa futura`

## Smokes e verificacoes que ja viraram referencia

- `scripts/run-smoke-suite.sh`
- `scripts/smoke-admin-operations.sh`
- `scripts/smoke-rbac-roles.sh`
- `scripts/smoke-bootstrap-flow.sh`
- `scripts/verify-sse-stream.sh`
- `scripts/test-agent-connection.sh`
- `scripts/verify-bootstrap-release.sh`
- `scripts/run-bootstrap-preflight.sh`
- `scripts/verify-origin-contract.sh`
- `scripts/backup-postgres.sh`
- `scripts/verify-backup-restore.sh`
- `packages/pfsense-package`

## O que verificar antes de voltar ao pfSense real

- comando de bootstrap do node gerado no painel com `artifact_url`, `checksum_url` e `installer_url`
- `scripts/verify-bootstrap-release.sh` ou `scripts/run-bootstrap-preflight.sh` executado para o `node_id` alvo
- em laboratorio local sem release publicada, preferir `AUTO_STAGE_RELEASE=1 scripts/run-bootstrap-preflight.sh <node_id>`
- override temporario de `controller_url` e `release_base_url` apenas quando houver necessidade de homologacao
- checksum `.sha256` presente no release usado pelo bootstrap
- origem publica e origem interna coerentes com `Cloudflare -> ISPConfig -> 192.168.100.244:8088`
- nenhuma mudanca impactando portas ou servicos do ecossistema `Zabbix`

## Arquivos mais importantes para desenvolvimento

Para contexto rapido:

- `LEITURA-INICIAL.md`: estado atual e proximo passo
- `CORTEX.md`: regras permanentes
- `00-README.md`: indice principal
- `PLANO.md`: origem conceitual do projeto
- `16-status-e-progresso-do-projeto.md`: regra de acompanhamento
- `17-checklist-homologacao-bootstrap-pfsense-real.md`: roteiro da proxima rodada manual em pfSense real
- `scripts/verify-bootstrap-release.sh`: valida node, comando e URLs do release
- `scripts/run-bootstrap-preflight.sh`: encadeia smoke do release e verificacao do bootstrap
- `packages/pfsense-agent`: agente leve e bootstrap atual
- `packages/pfsense-package`: port atual do pacote nativo do pfSense, ja preparado para gerar o artefato instalavel
- `infra/nginx/default.conf`: proxy interno atual do Compose
- `infra/ispconfig/nginx.monitor-pfsense.conf`: referencia do proxy externo

## O que ja sabemos sobre o pacote pfSense

- menu decidido do produto: `Services > SystemUp Monitor`
- diagnostico local desejado: `Status > SystemUp Monitor`
- pagina local do pfSense pode viver em `/usr/local/www/*.php`
- exemplo antigo do usuario confirmou que hacks manuais usam `/usr/local/www/head.inc` para injetar menu e `/usr/local/www/<pagina>.php` para a tela
- decisao atual: nao usar alteracao direta de `head.inc` como solucao final do Monitor-Pfsense
- decisao atual: registrar menu e configuracao pelo framework oficial de packages do pfSense, com XML em `/usr/local/pkg/` e metadata em `/usr/local/share/pfSense-pkg-<name>/info.xml`
- estrutura atual do pacote nativo:
  - `packages/pfsense-package/Makefile`
  - `packages/pfsense-package/pkg-plist`
  - `packages/pfsense-package/files/pkg-install.in`
  - `packages/pfsense-package/files/pkg-deinstall.in`
  - `packages/pfsense-package/files/usr/local/share/pfSense-pkg-systemup-monitor/info.xml`
  - `packages/pfsense-package/files/usr/local/pkg/systemup_monitor.xml`
  - `packages/pfsense-package/files/usr/local/pkg/systemup_monitor.inc`
  - `packages/pfsense-package/files/usr/local/www/status_systemup_monitor.php`
- `packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh`
- `packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent-loop.sh`
- `packages/pfsense-package/files/usr/local/etc/rc.d/monitor_pfsense_agent`
- esse port ja foi validado localmente com `php -l` e `sh -n`
- ainda falta gerar o artefato em builder compativel e homologar em pfSense real

## Regra de continuidade entre chats

Em qualquer novo chat:

1. ler `LEITURA-INICIAL.md`
2. ler `CORTEX.md`
3. ler `00-README.md`
4. identificar a fase atual
5. continuar do ponto registrado, sem reabrir decisoes ja fechadas

Ao concluir uma iteracao relevante:

- atualizar `LEITURA-INICIAL.md`
- ajustar documentos impactados
- manter visivel o percentual da fase atual e do plano total

## Objetivo deste arquivo

Permitir continuidade imediata do desenvolvimento sem reexplicar contexto, sem reiniciar arquitetura e sem perder as restricoes operacionais do ambiente.
