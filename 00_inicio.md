# 00 Inicio

Este arquivo existe para retomada imediata do projeto em qualquer novo chat.

> **Versoes atuais (2026-08-01):** API `0.10.3` · painel `1.10.9` · package pfSense `0.5.8`.
>
> **Ultima entrega (2026-08-01):** backup habilitado por padrão (agendado + remoto) — package **0.5.8**, painel **1.10.9**. Ver `docs/163-ENTREGA-BACKUP-PADRAO-LIGADO-PACKAGE-0.5.8-2026-08-01.md`.
>
> **Entrega anterior (2026-08-01):** UX despoluição P0 inventário `/nodes` — painel **1.10.8**. Ver `docs/162-ENTREGA-UX-DESPOLUICAO-P0-INVENTARIO-2026-08-01.md` (plano `docs/161-...md`; P1/P2 pendentes).
>
> **Entrega anterior (2026-08-01):** proteção absoluta do `admin` pfSense (nunca cadastrar/gerenciar). API **0.10.3**, painel **1.10.7**, package **0.5.7**. Ver `docs/160-...md`.
>
> **Entrega anterior (2026-08-01):** delete de tecnico desabilitado corrigido (`userExistsInSnapshot`). API **0.10.2**.
>
> **Entrega anterior (2026-08-01):** package **0.5.5** — tecnicos habilitados por padrao no agente + checkbox GUI. Ver `docs/157-...md`.
>
> **Entrega anterior (2026-08-01):** mensagem PT-BR para `technician accounts disabled on agent`. Painel **1.10.4**.
>
> **Entrega anterior (2026-08-01):** tecnicos em `/nodes` usam checkboxes da tabela (como package upgrade). Painel **1.10.3**.
>
> **Entrega anterior (2026-08-01):** senha minima de tecnico: **10** caracteres (antes 12). API **0.10.1**, painel **1.10.2**.
>
> **Entrega anterior (2026-08-01):** correcao crash Server Components ao provisionar tecnico (`password must be 12-64` derrubava `/nodes`) — actions com `{ ok, error }`, validacao de senha no cliente. Painel **1.10.1**. Ver `docs/156-CORRECAO-SERVER-ACTION-GESTAO-TECNICOS-2026-08-01.md`.
>
> **Entrega anterior (2026-07-31):** validacao E2E real de create/set_password/delete contra pfSense de producao — achado e corrigido 2o bug critico independente (`local_user_set_password()` exigia wrapper de item; usuario "criado" ficava sem login funcional). Package **0.5.4**. Ver `docs/155-VALIDACAO-E2E-LOCAL-USER-CREATE-PFSENSE-254-2026-07-31.md`.
>
> **Entrega anterior (2026-07-31):** pagina `/admin/tecnicos` (Fase 3 plano 144) + gate de backup recente antes de escrita em usuarios locais. Ver `docs/154-ENTREGA-ADMIN-TECNICOS-GATE-BACKUP-2026-07-31.md`.
>
> **Entrega anterior (2026-07-31):** auditoria de codigo da gestao de tecnicos — corrigido vazamento de senha em texto claro no historico de comandos e `local_user_create` sem atribuir `uid`. Ver `docs/153-AUDITORIA-CORRECOES-GESTAO-TECNICOS-2026-07-31.md`.
>
> **Entrega anterior (2026-07-31):** senha gerada visivel + exclusao cadastro central tecnicos. Ver `docs/152-ENTREGA-SENHA-GERADA-EXCLUSAO-CADASTRO-TECNICOS-2026-07-31.md`.
>
> **Plano em andamento:** rollout package **0.5.5** na frota (tecnicos on por padrao). Ver `docs/157-...md`, `docs/155-...md`.
>
> **Entrega anterior (2026-07-04):** correção versão reportada no heartbeat após lote (`SYSTEMUP_MONITOR_AGENT_VERSION` alinhado) — package `0.4.15`. Ver `docs/141-CORRECAO-AGENT-VERSION-0.4.15-2026-07-04.md`.
>
> **Entrega anterior (2026-06-30):** upgrade remoto de package (`package_upgrade`) — package `0.4.6`, API `0.6.4`. Ver `docs/114-ENTREGA-UPGRADE-REMOTO-PACKAGE-2026-06-30.md` e `docs/114-UPGRADE-REMOTO-PACKAGE.md`.
>
> **Entrega anterior (2026-06-30):** correcao heartbeat light + recovery offline — package `0.4.5`, API `0.6.3`. Ver `docs/113-ENTREGA-CORRECAO-HEARTBEAT-LIGHT-OFFLINE-2026-06-30.md`.
>
> **Entrega anterior (2026-06-24):** link de acesso remoto por firewall — API `0.6.0`, painel `1.4.0`. Campo `remote_access_url`, coluna **Acesso** no inventario. Ver `docs/104-ENTREGA-LINK-ACESSO-REMOTO-FIREWALL-2026-06-24.md`.

## Leitura obrigatoria

Leia estes arquivos primeiro:

1. `LEITURA-INICIAL.md`
2. `CORTEX.md`
3. `docs/00-INDICE-OPERACIONAL.md`
4. `00-README.md`
5. `docs/63-PLANO-MESTRE-ORGANIZACAO-QUALIDADE-BACKUP-PFSENSE-2026-06-08.md`
6. `docs/64-ESPECIFICACAO-MODULO-BACKUP-PFSENSE-2026-06-08.md`, quando a tarefa envolver backup do pfSense

## Ponto oficial de continuidade

Considere esses arquivos como a base oficial para retomar o trabalho.

Regras:

- nao reiniciar arquitetura ou decisoes ja fechadas sem necessidade real
- continuar sempre do estado registrado em `LEITURA-INICIAL.md`
- tratar `CORTEX.md` como regra duravel de produto, arquitetura e operacao
- usar `docs/00-INDICE-OPERACIONAL.md` como mapa atual de retomada
- usar `00-README.md` como indice historico e mapa amplo do repositorio

## Atualizacao de rumo em 2026-06-08

Nova trilha planejada:

- organizacao documental sem mover arquivos antigos em massa
- saneamento de publicacao e limites antes de aceitar backup de `config.xml`
- criacao do modulo de backup pfSense com upload assinado, armazenamento criptografado, retencao, auditoria, painel e alertas

Documentos novos:

- `docs/00-INDICE-OPERACIONAL.md`
- `docs/63-PLANO-MESTRE-ORGANIZACAO-QUALIDADE-BACKUP-PFSENSE-2026-06-08.md`
- `docs/64-ESPECIFICACAO-MODULO-BACKUP-PFSENSE-2026-06-08.md`

## Estado atual resumido

Data de referencia: `2026-07-08`

**Versoes:** API `0.7.0`, painel `1.5.3`, package pfSense `0.4.18`.

**Produto operacional:**

- controlador com ingestao snapshot, alertas, RBAC granular, MFA TOTP, backup `config.xml`, upgrade remoto de package e upgrade semi-manual de pfSense OS
- painel: `/dashboard`, `/nodes` (colunas Versao pfSense, Pacote, Acesso), `/backups`, `/alerts`, `/bootstrap`, `/admin/*`, `/audit`, `/conta`
- package pfSense: GUI com abas Configuracao, Diagnostico e Backup; comandos `package_upgrade` e `pfsense_upgrade`

**Proximo passo:** rollout package `0.4.18` na frota (todos os nós 0.4.10–0.4.17 carregam XML inválido); ver `docs/143-CORRECAO-XML-MALFORMADO-GUI-0.4.18-2026-07-08.md`.

### Arquivo historico (2026-03-15)

> Detalhes do MVP abaixo sao linha do tempo — nao substituem o bloco acima.

Fase registrada na epoca:

- `Fase 1 - MVP do controlador`

Progresso registrado:

- fase atual: `100%`
- plano total: `93%`
- escopo do servidor/controlador: `100%`
- **trilha homologacao real + alinhamento package:** encerrada (doc 43)

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
- ingest do backend agora remove servicos/gateways fora do ultimo heartbeat, e o painel reflete apenas o conjunto atualmente monitorado
- backend passou a aceitar `impact_on_status` (critical/optional) no heartbeat; apenas servicos critical degradam o node
- Fase B: catalogo com `service_name`, agente com `MONITOR_AGENT_PACKAGES` e GUI com campo "Pacotes adicionais"; ver `21-evolucao-servicos-e-fase-b-2026-03-13.md`
- cadastro inicial de `cliente`, `site` e `firewall` no painel agora gera identificadores tecnicos automaticamente para evitar redundancia na primeira implantacao
- estrategia atual do pacote pfSense definida: pagina local em `/usr/local/www/*.php`, registro de menu pelo framework de packages em XML/PHP, sem editar `head.inc` como solucao final
- rodada real de homologacao do pacote pfSense documentada em `18-homologacao-pfsense-package-real-2026-03-13.md`
- package GUI validado em `Services > SystemUp Monitor`
- package service validado em `Status > Services`
- firewall real `Lasalle Agro` homologado com package 0.2.0 (agente ativo, package/menu/service validados)
- fluxo de limpeza total do package no pfSense agora esta documentado e validado
- formato correto da assinatura HMAC do agente contra a API foi validado: `timestamp + "\n" + rawBody`
- formato correto de `test-connection` e `heartbeat` contra a API foi validado e documentado
- instalacao do agente no pfSense documentada e funcionando (v0.2.0): ver `docs/INSTALACAO-AGENTE-PFSENSE.md`; comando one-shot gerado automaticamente na pagina do firewall e apos rotacionar secret (API retorna `package_command` quando `PACKAGE_RELEASE_VERSION` e `PACKAGE_RELEASE_SHA256` estao em `.env.api`)
- trilha de exclusao de hosts implementada (doc 44): exclusao individual e em lote, confirmação obrigatória, RBAC admin/superadmin, auditoria persistente
- trilha de dashboard operacional / lista de servidores implementada (doc 45): lista/tabela no dashboard com métricas do último heartbeat (CPU, memória, disco, uptime); API de listagem estendida; fallback "—" quando sem métrica
- trilha de despoluição visual do dashboard operacional implementada (doc 46): colunas Host e Site removidas da grade principal; tabela enxuta com 11 colunas; host/site permanecem no detalhe
- trilha de simplificação do modelo de cadastro implementada (doc 47): fluxo principal Cliente + Firewall; createNode aceita client_id ou site_id; regra segura 0/1/2+ sites; "Novo site" em Cadastros avancados
- trilha de desmembramento da interface administrativa implementada (docs 48, 49): /admin enxuto (cadastro inicial + atalhos); /admin/usuarios e /admin/clientes-sites; nav com Usuarios (superadmin) e Clientes e sites; painel 0.1.9
- trilha de polimento do cadastro inicial no admin implementada (docs 50, 51): formularios sob demanda por card (acordeao); apenas um card expandido por vez; painel 0.1.10
- microtrilha de alinhamento do smoke administrativo (doc 52): passo GET /admin HTTP 200; numeracao [1/14]…[14/14]; smoke continua API-first
- microtrilha de simplificacao visual cadastro/auditoria/instalacao (doc 53): cadastro so Novo cliente + Novo firewall na superficie; auditoria compacta com payload sob demanda; bootstrap layout equilibrado; painel 0.1.11
- trilha de correcao do modelo operacional e limpeza da interface admin (doc 54): Site 100% invisivel na UX; cadastro apenas Novo cliente e Novo firewall; usuarios com abas Usuarios/Sessoes; pagina Clientes (ex-clientes-sites) so clientes ativos e firewalls; painel 0.1.12
- microtrilha de varredura final de nomenclatura (doc 55): revalidatePath /admin/clientes; opcao "Todos os sites" -> "Todos"; label "Cliente / Site" -> "Cliente / Local"; separador " — " em exibicoes; painel 0.1.13
- trilha de navegacao administrativa e saneamento do ciclo de vida (doc 56): menu longest-match; Minha conta compacta (tabela); gestao real de usuarios (listar ativos, deletar, ver inativos); delecao/limpeza coerente; painel 0.1.14, API 0.1.4
- trilha de correcao REAL da semantica de delecao e saneamento dos dados operacionais (doc 57): delete usuario (body/Content-Type); getFilters so clientes/sites ativos; listSessions so nao revogadas; painel 0.1.15, API 0.1.5
- trilha de delecao real de clientes (doc 58): DELETE /api/v1/admin/clients/:id; botao Deletar cliente na UI (0 firewalls); bloqueio com mensagem se 1+ firewalls; painel 0.1.16, API 0.1.6
- refatoracao snapshot operacional (doc 61): heartbeat passa a atualizar snapshot atual no `Node`; sem historico continuo de telemetria; `heartbeats` vira tabela legada para purge
- seletor de modo de heartbeat na instalacao (doc 62): package passa a usar `normal` por padrao; telas `/nodes/[id]` e `/bootstrap` permitem alternar `normal/light`; comando inclui `--heartbeat-mode`

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
- origem interna historicamente documentada como `192.168.100.244:8088`, mas em `2026-06-08` este ponto foi marcado para saneamento porque o ambiente informado/observado usa `192.168.100.221`, tambem com publicacao em `192.168.100.221:3031`
- este host tambem executa `Zabbix`, que tem prioridade operacional

## Trilhas encerradas (nao reabrir sem decisao explicita)

1. Ondas 1, 2 e 3 de simplificacao do frontend (docs 33, 35, 37)
2. Homologacao real do Lasalle Agro (doc 40)
3. Alinhamento do fluxo automatizado com o package pfSense 0.2.0 (docs 41, 42)
4. Encerramento formal da trilha de homologacao/alinhamento (doc 43)
5. Trilha de exclusao de hosts (doc 44)
6. Trilha de dashboard operacional / lista de servidores (doc 45)
7. Trilha de despoluicao visual do dashboard (doc 46)
8. **Trilha de simplificacao do modelo operacional de cadastro** (doc 47) — Cliente + Firewall; regra segura site; Novo site em Avancado
9. **Trilha de desmembramento da interface administrativa** (docs 48, 49) — Cadastro enxuto; Usuarios e Clientes e sites em telas proprias; nav e atalhos
10. **Trilha de polimento do cadastro inicial no admin** (docs 50, 51) — Formularios sob demanda por card (acordeao); um card expandido por vez
11. **Microtrilha de alinhamento do smoke administrativo com o novo /admin** (doc 52) — Numeração [1/14]…[14/14]; passo GET /admin HTTP 200; smoke continua API-first
12. **Microtrilha de simplificação visual cadastro/auditoria/instalação** (doc 53) — Cadastro: apenas Novo cliente e Novo firewall na superfície; Auditoria: compacta, payload sob demanda; Instalação: layout equilibrado; painel 0.1.11 — **encerrada**
13. **Trilha de correção do modelo operacional e limpeza da interface administrativa** (doc 54) — Site invisível na UX; cadastro só Cliente e Firewall; Usuários com abas; página Clientes (sem sites); painel 0.1.12 — **encerrada**
14. **Microtrilha de varredura final de nomenclatura Cliente/Firewall** (doc 55) — revalidatePath, "Todos", "Cliente / Local", separador " — "; painel 0.1.13 — **encerrada**
15. **Trilha de correção de navegação administrativa e saneamento do ciclo de vida** (doc 56) — menu longest-match; Minha conta compacta; gestão real de usuários; listagens sem resíduos; painel 0.1.14, API 0.1.4 — **encerrada**
16. **Trilha de correção REAL da semântica de deleção e saneamento dos dados operacionais** (doc 57) — delete usuário (body/Content-Type); getFilters só ativos; listSessions só não revogadas; painel 0.1.15, API 0.1.5 — **encerrada**
17. **Trilha de deleção real de clientes** (doc 58) — DELETE clients/:id; botão Deletar cliente (0 firewalls); bloqueio se 1+ firewalls; painel 0.1.16, API 0.1.6 — **encerrada**
18. **Trilha RBAC Fase A — correções urgentes** (doc 69) — bootstrap desacoplado do detalhe do node; menu Instalação só admin; smoke node detail; painel 0.1.21 — **encerrada**
19. **Trilha RBAC completa (Fases A–F)** (docs 69–74, encerramento doc 76) — escopo por cliente, permissões granulares, perfil `client`, UX administrativa, auditoria endurecida; API `0.2.4`, painel `0.2.3` na trilha — **encerrada (2026-06-09)**
20. **Pós-RBAC UX/layout** (`docs/77`) — escopo clientes multi-coluna, purge smoke, shell responsivo; painel **`0.2.5`** — **entregue (2026-06-09)**

## Documentação de referência (retomada e refatoração)

- **Histórico e linha do tempo:** `docs/HISTORICO-E-LINHA-DO-TEMPO.md` — alterações (manutenção, VPN por túnel, interfaces, cadastro, UI), decisões e erros a não repetir; consultar antes de refatorar ou reabrir temas fechados.

## Restricao mais importante

Nunca alterar o ambiente do Zabbix por conveniencia do projeto.

Na pratica:

- nao usar portas do ecossistema Zabbix sem decisao explicita
- nao mexer em `zabbix-server`, `zabbix-agent`, `apache2` ou `mysql` sem necessidade real
- se houver conflito, o projeto se adapta e o Zabbix nao

## Proximo bloco recomendado (2026-07-04)

1. **Rollout package `0.4.15`** na frota (lote nos nós ainda em 0.4.13)
2. **Monitorar drift** pela coluna **Pacote** em `/nodes`
3. **Executar proximas melhorias** pelo plano `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md`
4. **Planejar pos-117 pfREST** pelo plano `docs/125-PLANO-PFREST-GERENCIAMENTO-CENTRALIZADO-2026-07-02.md` quando as fundacoes do 117 estiverem estaveis
5. **Manter smokes** com `scripts/run-smoke-suite.sh` apos mudancas

Trilhas encerradas (nao reimplementar): RBAC (`docs/76`), roadmap UX plano 24 (`docs/88`), homologacao package doc 43.

Referencias operacionais:

- upgrade remoto package: `docs/114-UPGRADE-REMOTO-PACKAGE.md`
- guia package: `docs/pfsense-package/00-GUIA-OPERACAO-PACKAGE.md`
- backup: `docs/64-ESPECIFICACAO-MODULO-BACKUP-PFSENSE-2026-06-08.md` + painel `/backups`

## Tarefa atual registrada

- `Roadmap UX front-end Fases 0–8 — ENCERRADO (2026-06-09)` — encerramento `docs/88-ENCERRAMENTO-ROADMAP-UX-FASE0-FASE8-2026-06-09.md`, painel `1.0.0`, API `0.2.7`
- `Trilha UX front-end Fase 8 — CONCLUIDA (2026-06-09)` — plano `31-plano-fase8-design-system-pages-restantes-2026-06-09.md`, trilha `docs/87`, entrega `docs/87-ENTREGA-FRONTEND-FASE8-DESIGN-SYSTEM-PAGES-RESTANTES-2026-06-09.md`, painel `1.0.0`, API `0.2.7` — **roadmap plano 24 encerrado**
- `Trilha UX front-end Fase 7 — CONCLUIDA (2026-06-09)` — plano `30-plano-fase7-auditoria-filtros-amigaveis-2026-06-09.md`, trilha `docs/86`, entrega `docs/86-ENTREGA-FRONTEND-FASE7-AUDITORIA-FILTROS-AMIGAVEIS-2026-06-09.md`, painel `0.8.0`, API `0.2.7`
- `Trilha UX front-end Fase 6 — CONCLUIDA (2026-06-09)` — plano `29-plano-fase6-conta-separada-polimento-ptbr-2026-06-09.md`, trilha `docs/85`, entrega `docs/85-ENTREGA-FRONTEND-FASE6-CONTA-SEPARADA-POLIMENTO-PTBR-2026-06-09.md`, painel `0.7.0`, API `0.2.6`
- `Trilha UX front-end Fase 5 — CONCLUIDA (2026-06-09)` — plano `28-plano-fase5-backups-frota-menu-2026-06-09.md`, trilha `docs/84`, entrega `docs/84-ENTREGA-FRONTEND-FASE5-BACKUPS-FROTA-MENU-2026-06-09.md`, painel `0.6.0`, API `0.2.6`
- `Trilha UX front-end Fase 4 — CONCLUIDA (2026-06-09)` — plano `27-plano-fase4-detalhe-firewall-abas-2026-06-09.md`, trilha `docs/83`, entrega `docs/83-ENTREGA-FRONTEND-FASE4-DETALHE-FIREWALL-ABAS-2026-06-09.md`, painel `0.5.0`, API `0.2.6`
- `Trilha UX front-end Fase 3 — CONCLUIDA (2026-06-09)` — plano `26-plano-fase3-firewalls-inventario-backup-alertas-2026-06-09.md`, trilha `docs/82`, entrega `docs/82-ENTREGA-FRONTEND-FASE3-FIREWALLS-INVENTARIO-2026-06-09.md`, painel `0.4.0`, API `0.2.6`
- `Trilha UX front-end Fase 2 — CONCLUIDA (2026-06-09)` — plano `25-plano-fase2-dashboard-enxuto-kpis-zona-quente-2026-06-09.md`, trilha `docs/81`, entrega `docs/81-ENTREGA-FRONTEND-FASE2-DASHBOARD-ENXUTO-2026-06-09.md`, painel `0.3.0`
- `Trilha UX front-end Fase 0 + Fase 1 — CONCLUIDA (2026-06-09)` — plano `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md`, trilha `docs/79`, entrega `docs/80-ENTREGA-FRONTEND-FASE0-FASE1-LAYOUT-2026-06-09.md`, painel `0.2.9`
- `Trilha RBAC — ENCERRADA (2026-06-09)` — API `0.2.4`, painel `0.2.5`
- documento de encerramento: `docs/76-ENCERRAMENTO-TRILHA-RBAC-2026-06-09.md`
- fases A–F em `docs/69` a `docs/74`

## Smokes e verificacoes que ja viraram referencia

- `scripts/run-smoke-suite.sh`
- `scripts/smoke-admin-operations.sh`
- `scripts/smoke-rbac-roles.sh`
- `scripts/smoke-rbac-client-scope.sh`
- `scripts/smoke-rbac-permissions.sh`
- `scripts/smoke-rbac-client-profile.sh`
- `scripts/smoke-rbac-admin-ux.sh`
- `scripts/smoke-rbac-audit-hardening.sh`
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
- origem publica e origem interna coerentes com a origem validada em producao antes da rodada
- nenhuma mudanca impactando portas ou servicos do ecossistema `Zabbix`

## Arquivos mais importantes para desenvolvimento

Para contexto rapido:

- `LEITURA-INICIAL.md`: estado atual e proximo passo
- `CORTEX.md`: regras permanentes
- `00-README.md`: indice principal
- `PLANO.md`: origem conceitual do projeto
- `16-status-e-progresso-do-projeto.md`: regra de acompanhamento
- `17-checklist-homologacao-bootstrap-pfsense-real.md`: roteiro da proxima rodada manual em pfSense real
- `18-homologacao-pfsense-package-real-2026-03-13.md`: linha do tempo real da rodada em pfSense CE 2.8.1
- `docs/43-ENCERRAMENTO-TRILHA-HOMOLOGACAO-ALINHAMENTO-PACKAGE-2026-03-15.md`: encerramento formal da trilha homologacao + alinhamento package
- `docs/44-TRILHA-EXCLUSAO-HOSTS-2026-03-15.md`: trilha de exclusao de hosts (individual, lote, auditoria)
- `docs/45-DASHBOARD-OPERACIONAL-LISTA-SERVIDORES-2026-03-15.md`: trilha de dashboard operacional com lista de servidores e métricas do último heartbeat
- `docs/46-DESPOLUICAO-VISUAL-DASHBOARD-OPERACIONAL-2026-03-15.md`: despoluição visual da lista operacional (remover Host/Site da grade)
- `docs/47-SIMPLIFICACAO-MODELO-CADASTRO-CLIENTE-FIREWALL-2026-03-15.md`: simplificação do cadastro (Cliente + Firewall; regra segura site; Novo site em Avançado)
- `docs/48-ANALISE-DESMEMBRAMENTO-INTERFACE-ADMIN-2026-03-15.md`: análise desmembramento interface admin
- `docs/49-ENTREGA-DESMEMBRAMENTO-INTERFACE-ADMIN-2026-03-15.md`: entrega desmembramento (admin enxuto; /admin/usuarios; /admin/clientes-sites)
- `docs/50-ANALISE-POLIMENTO-CADASTRO-INICIAL-ADMIN-2026-03-15.md`: análise polimento cadastro (formulários sob demanda)
- `docs/51-ENTREGA-POLIMENTO-CADASTRO-INICIAL-ADMIN-2026-03-15.md`: entrega polimento (cards colapsáveis; painel 0.1.10)
- `docs/52-ALINHAMENTO-SMOKE-ADMIN-NOVO-ADMIN-2026-03-15.md`: alinhamento smoke administrativo ao novo /admin (GET /admin HTTP 200; doc 52)
- `docs/53-ENTREGA-SIMPLIFICACAO-VISUAL-CADASTRO-AUDIT-BOOTSTRAP-2026-03-15.md`: simplificação visual cadastro (só cliente+firewall), auditoria (compacta, payload sob demanda), instalação (layout equilibrado); painel 0.1.11
- `docs/54-TRILHA-MODELO-OPERACIONAL-CLIENTE-FIREWALL-2026-03-15.md`: modelo operacional Cliente/Firewall; Site invisível na UX; cadastro só Cliente+Firewall; Usuários com abas; página Clientes; painel 0.1.12
- `docs/55-MICROTRILHA-VARREDURA-NOMENCLATURA-CLIENTE-FIREWALL-2026-03-15.md`: varredura final nomenclatura; revalidatePath /admin/clientes; "Todos", "Cliente / Local"; separador " — "; painel 0.1.13
- `docs/56-TRILHA-NAVEGACAO-ADMIN-E-SANEAMENTO-CICLO-VIDA-2026-03-15.md`: navegação admin (menu longest-match); Minha conta compacta; gestão real usuários; deleção/limpeza; painel 0.1.14, API 0.1.4
- `docs/57-TRILHA-SEMANTICA-DELECAO-E-SANEAMENTO-DADOS-2026-03-15.md`: semântica deleção e saneamento (delete usuário; getFilters ativos; listSessions não revogadas); painel 0.1.15, API 0.1.5
- `docs/58-TRILHA-DELECAO-REAL-CLIENTES-2026-03-15.md`: deleção real de clientes (DELETE clients/:id; botão na UI; bloqueio se 1+ firewalls); painel 0.1.16, API 0.1.6
- `docs/61-REFATORACAO-SNAPSHOT-OPERACIONAL-2026-03-19.md`: refatoração para snapshot operacional sem histórico de telemetria; Node passa a carregar o estado atual usado pelo painel; script de purge dos heartbeats legado
- `21-evolucao-servicos-e-fase-b-2026-03-13.md`: evolucao da logica de servicos, limpeza no painel e Fase B (catalogo de pacotes)
- `docs/COMANDO-ATUALIZAR-PACKAGE-PFSENSE.md`: comando one-shot para instalar/atualizar o package no pfSense (sempre usar esse formato)
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
4. identificar a fase atual e as **trilhas encerradas** (secao neste arquivo)
5. continuar do ponto registrado, sem reabrir decisoes ja fechadas nem trilhas encerradas sem decisao explicita

Ao concluir uma iteracao relevante (ou encerrar uma trilha):

- atualizar `LEITURA-INICIAL.md` (ultima entrega e notas para proximo chat)
- atualizar a secao **Trilhas encerradas** neste arquivo, se uma nova trilha for encerrada
- ajustar documentos impactados (doc da trilha com secao Encerramento quando aplicavel)
- manter visivel o percentual da fase atual e do plano total
- **fazer commit e push para `origin main`** — este host e o servidor do projeto; o GitHub deve estar sempre atualizado
- **apos push (ou quando relevante), executar `git pull origin main` neste host** — nao pedir ao usuario que de pull; o agente faz o pull

## Objetivo deste arquivo

Permitir continuidade imediata do desenvolvimento sem reexplicar contexto, sem reiniciar arquitetura e sem perder as restricoes operacionais do ambiente.
