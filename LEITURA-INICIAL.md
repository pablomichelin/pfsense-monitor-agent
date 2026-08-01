# Leitura Inicial

## Objetivo deste arquivo

Este arquivo existe para retomada rapida do projeto em qualquer novo chat ou nova sessao.

Leia este arquivo primeiro.

## Versoes atuais do produto (2026-08-01)

| Componente | Versao | Referencia |
|------------|--------|------------|
| API | `0.10.3` | `apps/api/package.json` |
| Painel web | `1.10.7` | `apps/web/package.json` (rodape do layout) |
| Package pfSense | `0.5.7` | `packages/pfsense-package/Makefile` + `config/package-release.env` |

**Release (config local):** `config/package-release.env` → package **`0.5.7`** (artefato em `dist/`; publicar no GitHub do agent com `scripts/release-pfsense-package.sh` para upgrade nos firewalls).

**Ultima entrega (2026-08-01):** proteção absoluta do usuário **`admin`** (e `root`) — nunca cadastrar/alterar/excluir via Monitor. API **0.10.3**, painel **1.10.7**, package **0.5.7**. Ver `docs/160-PROTECAO-USUARIO-ADMIN-PFSENSE-2026-08-01.md`.

**Entrega anterior (2026-08-01):** correcao delete de tecnico **desabilitado** — `userExistsInSnapshot` nao ignorava mais contas disabled. API **0.10.2**. Ver `docs/159-CORRECAO-DELETE-TECNICO-DESABILITADO-2026-08-01.md`.

**Entrega anterior (2026-08-01):** aba **Excluir** (delete por padrao) + privilegio tecnico sem User Manager (nao altera senha do admin). Package **0.5.6**, painel **1.10.6**. Ver `docs/158-ENTREGA-EXCLUIR-TECNICO-PRIVILEGIO-SEM-USER-MANAGER-2026-08-01.md`.

**Entrega anterior (2026-08-01):** package **0.5.5** — gestao de tecnicos **habilitada por padrao** no agente + checkbox na GUI. Painel **1.10.5**. Ver `docs/157-ENTREGA-PACKAGE-0.5.5-TECNICOS-PADRAO-LIGADO-2026-08-01.md`.

**Entrega anterior (2026-08-01):** mensagem amigavel quando o agente recusa com `technician accounts disabled on agent`. Painel **1.10.4**.

**Entrega anterior (2026-08-01):** gestao de tecnicos em `/nodes` usa a **selecao da tabela** (checkboxes, mesmo padrao do upgrade de package) — sem fallback automatico para todos do filtro. Painel **1.10.3**.

**Entrega anterior (2026-08-01):** senha minima de tecnico reduzida de 12 para **10** caracteres (API + painel). API **0.10.1**, painel **1.10.2**.

**Entrega anterior (2026-08-01):** correcao do crash de Server Components ao provisionar tecnico em `/nodes` — Server Actions de tecnicos agora retornam `{ ok, error }` (sem throw), validacao de senha no cliente e mensagens em PT-BR. Painel **1.10.1**. Ver `docs/156-CORRECAO-SERVER-ACTION-GESTAO-TECNICOS-2026-08-01.md`.

**Entrega anterior (2026-07-31):** validacao E2E real de `local_user_create`/`set_password`/`delete` contra pfSense de producao (`192.168.100.254`) — revelou e corrigiu um **segundo bug critico independente**: `local_user_set_password()` nessa versao do pfSense exige wrapper `{'item': $user}`, sem o qual a conta Unix nunca era sincronizada (usuario "criado" no config.xml mas inutilizavel, sem login). Corrigido com `apply_local_user_password()`; validado do zero apos a correcao (create/set_password/delete confirmados no SO real, nenhum usuario real tocado). Package **0.5.4**. Ver `docs/155-VALIDACAO-E2E-LOCAL-USER-CREATE-PFSENSE-254-2026-07-31.md`.

**Entrega anterior (2026-07-31):** pagina dedicada `/admin/tecnicos` (Fase 3 do plano 144, matriz tecnico x firewall + indicador de acesso no detalhe do node via `GET /nodes/:id/technician-accounts`) + gate de backup recente de `config.xml` antes de qualquer escrita de usuario local (create/set_password/disable/delete), flags `TECHNICIAN_ACCOUNT_REQUIRE_RECENT_BACKUP_ENABLED`/`TECHNICIAN_ACCOUNT_REQUIRE_BACKUP_MAX_AGE_HOURS`. API **0.10.0**, painel **1.10.0**. Ver `docs/154-ENTREGA-ADMIN-TECNICOS-GATE-BACKUP-2026-07-31.md`.

**Entrega anterior (2026-07-31):** auditoria de codigo da gestao de tecnicos — 2 achados criticos corrigidos (vazamento de senha em texto claro no historico de comandos via `firewalls.view`; `local_user_create` sem atribuir `uid`/`nextuid`, risco real de falha silenciosa) + validacao 400 em vez de 500, reativacao de tecnico revogado, confirmacao obrigatoria em provisionar/resetar em lote. API **0.9.0**, painel **1.9.0**, package **0.5.3**. Ver `docs/153-AUDITORIA-CORRECOES-GESTAO-TECNICOS-2026-07-31.md`.

**Entrega anterior (2026-07-31):** senha gerada visivel + exclusao cadastro central tecnicos — card copiar senha, `DELETE /technicians/:id` (soft-delete). API **0.8.5**, painel **1.8.1**. Ver `docs/152-ENTREGA-SENHA-GERADA-EXCLUSAO-CADASTRO-TECNICOS-2026-07-31.md`.

**Entrega anterior (2026-07-31):** ciclo de vida completo técnicos — provisionamento e reset de senha em lote + UI unificada em `/nodes`. API **0.8.4**, painel **1.8.0**, package **0.5.2**. Ver `docs/151-ENTREGA-CICLO-VIDA-TECNICOS-PROVISION-RESET-2026-07-31.md`.

**Entrega anterior (2026-07-31):** offboarding de tecnicos — cadastro no painel + **revogar em toda a frota** (`POST /technicians/:id/revoke-fleet`), batch max 100. API **0.8.3**, painel **1.7.0**. Ver `docs/150-ENTREGA-OFFBOARDING-TECNICOS-FROTA-2026-07-31.md`.

**Entrega anterior (2026-07-31):** correcao gestao de tecnicos — `getUserEntry` wrapper Plus, payload `pfsense_username`, dispatch agente; **validado E2E no lab 254** (disable `hotspot`). API **0.8.2**, package **0.5.1**. Ver `docs/149-CORRECAO-GESTAO-TECNICOS-GETUSERENTRY-0.5.1-2026-07-31.md`.

**Entrega anterior (2026-07-31):** MVP plano 144 — revogacao de tecnicos em lote. Ver `docs/148-ENTREGA-MVP-REVOCACAO-TECNICOS-LOTE-2026-07-31.md`.

**Plano em andamento:** gestao centralizada de usuarios locais pfSense — **ciclo de vida MVP entregue e auditado** (provision/reset/revoke), **Fase 3 (`/admin/tecnicos`) entregue**, **gate de backup recente entregue** e **validacao E2E contra pfSense real concluida** (2 bugs criticos de agente corrigidos: `uid` ausente e `local_user_set_password()` sem wrapper de item); proximo: smoke dedicado e rollout package **0.5.5** na frota. Ver `docs/144-...md`, `docs/157-...md`, `docs/155-...md`.

**Governanca documental (2026-07-28):** criados `AGENTS.md`, `CHAT_INIT.md` e `PROJECT_STATUS.md` (não existiam) para alinhar este projeto ao padrão de entrypoints usado no resto do servidor (`/Dados/AGENTS.md`). Sem mudança de produto/código — `LEITURA-INICIAL.md` continua sendo a fonte de verdade de versões/entregas, `CORTEX.md` continua sendo o cérebro técnico; os novos arquivos apenas apontam para eles.

**Ultima entrega (2026-07-08):** correção XML mal formado do package (`2>&1` sem escape desde 0.4.10) que quebrava `pkg.php`/`pkg_edit.php` ("Package / Editor" vazio) e o `install_package_xml` (menu GUI); guard de well-formedness no build — package **0.4.18**. Ver `docs/143-CORRECAO-XML-MALFORMADO-GUI-0.4.18-2026-07-08.md`.

**Entrega anterior (2026-07-04):** upgrade pfSense OS remoto completo (`pfSense-upgrade -y` + reboot automático); confirmação no painel substitui GUI; package **0.4.17**, painel **1.5.3**.

**Entrega anterior (2026-07-04):** correção falso sucesso no upgrade pfSense OS semi-manual; package **0.4.16**, painel **1.5.2**.

**Entrega anterior (2026-07-04):** correção `SYSTEMUP_MONITOR_AGENT_VERSION` desalinhado no 0.4.14 — release **0.4.15**. Ver `docs/141-CORRECAO-AGENT-VERSION-0.4.15-2026-07-04.md`.

**Entrega anterior (2026-07-03):** correção reentrega de comandos `running` (falso "another package upgrade is running"), dedup no agente, persist do menu GUI, release **0.4.14**; reconciliação do comando HILE. Ver `docs/140-CORRECAO-REENTREGA-COMANDOS-0.4.14-2026-07-03.md`.

**Entrega anterior (2026-07-03):** correção upgrade remoto (`install.sh` opcache + restart deferido), bug UI lote 3 vs 57, release **0.4.13**. Ver `docs/139-CORRECAO-UPGRADE-REMOTO-0.4.13-2026-07-03.md`.

**Entrega anterior (2026-07-03):** correção race menu GUI — release **0.4.12**. Ver `docs/138-CORRECAO-MENU-GUI-RACE-0.4.12-2026-07-03.md`.

**Entrega anterior (2026-07-03):** correção SHA256 mismatch no `package-artifact`, `Content-Length` no download, guard de checksum na API, purge de 24 clientes smoke. Ver `docs/136-CORRECAO-PACKAGE-ARTIFACT-SHA256-2026-07-03.md`.

**Ultima entrega (2026-07-02):** correções pós-plano 117 (varredura builds/smokes/RBAC) — script smoke suite, C4 createClient, alinhamento package 0.4.10. Ver `docs/135-RELATORIO-CORRECOES-POS-PLANO-117-2026-07-02.md`.

**Entrega anterior (2026-07-02):** correções auditoria framework pfSense — package **0.4.10** (wrappers command-result, config_read_file, GUI/XML framework, validação intervalo, HMAC via env, fix `%%PKGVERSION%%` no build). **Homologada em pfSense CE 2.8.1 real.** Ver `docs/132-ENTREGA-CORRECOES-AUDITORIA-FRAMEWORK-PFSENSE-2026-07-02.md`.

**Entrega anterior (2026-07-02):** fechamento plano 117 (Fases 10–12) — vault/capacidades pfREST, piloto read-only/aliases, consolidacao API `0.7.0` / web `1.5.1`. Ver `docs/128-...`, `docs/129-...`, `docs/130-...` e `docs/131-RELATORIO-10-REVISOES-CODIGO-2026-07-02.md`.

**Entrega anterior (2026-07-02):** certificados e expiracao (Fase 9 plano 117) — inventario metadados, alertas 30/15/7 dias. Ver `docs/127-ENTREGA-CERTIFICADOS-EXPIRACAO-2026-07-02.md`.

**Entrega anterior (2026-07-02):** acoes operacionais allowlistadas (Fase 8 plano 117) — `service_restart`, `node_reboot`, backup em lote, flags default off, package agente 0.4.8. Ver `docs/126-ENTREGA-ACOES-OPERACIONAIS-2026-07-02.md`.

**Entrega anterior (2026-07-02):** fundacao jobs/comandos (Fase 7 plano 117) — registry allowlist, lotes `job_batches`, worker opcional `COMMAND_WORKER_ENABLED=false`, historico/cancel/batch na API, UI de comandos no detalhe do firewall. Ver `docs/125-ENTREGA-FUNDACAO-JOBS-COMANDOS-2026-07-02.md`.

**Entrega anterior (2026-07-02):** observabilidade historica e rollups (Fase 6 plano 117) — amostragem periodica do snapshot, rollups horarios/diarios, endpoint `GET /api/v1/nodes/:id/metrics/history`, tendencias na aba Metricas. Flag `METRIC_ROLLUPS_ENABLED` default `false`. Ver `docs/124-ENTREGA-OBSERVABILIDADE-HISTORICA-2026-07-02.md`.

**Entrega anterior (2026-07-02):** backup avancado diff/drift/retencao (Fase 5 plano 117) — diff estruturado com mascaramento fail-closed, drift por secoes sensiveis, retenção configuravel por node, exportacao assistida sem restore automatico. Ver `docs/123-ENTREGA-BACKUP-AVANCADO-2026-07-02.md`. Flags `BACKUP_DIFF_ENABLED` e `BACKUP_DRIFT_ENABLED` default `false`.

**Entrega anterior (2026-07-02):** politica MFA operacional (Fase 4 plano 117) — painel `/admin/mfa-politica`, enforcement soft/blocking, anti-lockout, indicadores em Usuarios. Ver `docs/122-ENTREGA-POLITICA-MFA-2026-07-02.md`.

**Entrega anterior (2026-07-02):** tags, grupos e criticidade (Fase 3 plano 117) — tags livres por cliente, grupos ad-hoc, criticidade `critical`/`standard`/`lab`, filtros no inventário, admin `/admin/grupos`. Ver `docs/121-ENTREGA-TAGS-GRUPOS-CRITICIDADE-2026-07-02.md`.

**Entrega anterior (2026-07-02):** dashboard frota e matriz de versões (Fase 2 plano 117) — KPIs agregados, backup/package %, matrizes pfSense/package em `/dashboard`. Endpoint `GET /api/v1/dashboard/fleet`. Ver `docs/120-ENTREGA-DASHBOARD-FROTA-2026-07-02.md`.

**Entrega anterior (2026-07-02):** notificacoes externas (Fase 1 plano 117) — canais, regras, dispatcher com `NOTIFICATIONS_ENABLED=false` default, painel `/admin/notificacoes`. Ver `docs/119-ENTREGA-NOTIFICACOES-EXTERNAS-2026-07-02.md`. Baseline: `docs/118-BASELINE-MELHORIAS-SEGURAS-2026-07-02.md`.

**Entrega anterior (2026-07-01):** coluna **Pacote** no inventario (`/nodes`) — painel `1.4.5`. Versao instalada vem de `agent_version` (heartbeat). Ver `docs/115-ENTREGA-COLUNA-PACOTE-INVENTARIO-2026-07-01.md`.

**Entrega anterior (2026-06-30):** upgrade remoto de package (`package_upgrade`) — package `0.4.6`, API `0.6.4`. Ver `docs/114-ENTREGA-UPGRADE-REMOTO-PACKAGE-2026-06-30.md` e `docs/114-UPGRADE-REMOTO-PACKAGE.md`.

**Proximo passo operacional:** homologacao pos-plano 117 — seguir `docs/134-CHECKLIST-ENABLEMENT-POS-PLANO-117-2026-07-02.md` (P0: alinhar frota **0.4.10**, smokes, checkpoints §25; P1: enablement gradual de flags em staging). Upgrade remoto: coluna **Pacote** em `/nodes`.

**Entrega anterior (2026-06-30):** correção heartbeat light + recovery offline — package `0.4.5`, API `0.6.3`. Ver `docs/113-ENTREGA-CORRECAO-HEARTBEAT-LIGHT-OFFLINE-2026-06-30.md`.

**Ultima entrega (2026-06-24):** correção pós-varredura read-only (gaps residuais plano 110) — package `0.4.4`, API `0.6.2`, painel `1.4.3`. Ver `docs/112-ENTREGA-CORRECAO-POS-VARREDURA-2026-06-24.md`.

**Entrega anterior (2026-06-24):** correção completa das 23 falhas pós-auditoria (plano 110) — package `0.4.3`, API `0.6.1`, painel `1.4.2`. Ver `docs/111-ENTREGA-CORRECAO-FALHAS-AUDITORIA-110-2026-06-24.md`.

**Entrega anterior (2026-06-24):** hotfix admin check update package — `0.4.2`. Ver `docs/109-HOTFIX-ADMIN-PACKAGE-UPDATE-2026-06-24.md`.

**Entrega anterior (2026-06-24):** link de acesso remoto por firewall — API `0.6.0`, painel `1.4.0`. Campo `remote_access_url` (padrao `https://{ip}:9999`), coluna **Acesso** no inventario. Ver `docs/104-ENTREGA-LINK-ACESSO-REMOTO-FIREWALL-2026-06-24.md`.

**Entrega anterior (2026-06-24):** fechamento dos itens restantes da auditoria — `docs/103-ENTREGA-FECHAMENTO-AUDITORIA-MFA-RATELIMIT-PACKAGE-2026-06-24.md`. API `0.5.0`, painel `1.3.0`, package `0.4.1`. MFA TOTP completo, rate-limit persistido, endurecimentos de seguranca no controlador e package `0.4.1`.

**Entrega anterior (2026-06-24):** alinhamento dos smokes pos-0.4.0 — `docs/102-ALINHAMENTO-SMOKES-POS-0.4.0-2026-06-24.md`. `scripts/run-smoke-suite.sh` 100% verde (13/13). Sem mudanca de runtime.

**Entrega anterior (2026-06-23):** correcoes de auditoria de seguranca (package + agente + controlador + SSE/infra) — `docs/101-ENTREGA-CORRECOES-AUDITORIA-SEGURANCA-PFSENSE-2026-06-23.md`. Cobre A1–A7, B1–B7, C1–C8, D1–D2; gaps adiados E1 (MFA) / E2 (rate-limit) **agora resolvidos** na entrega 103.
Referencias historicas adicionais:

- infra / backup limit: `docs/95-ENTREGA-INFRA-BACKUP-LIMIT-2026-06-23.md`
- trilha package 0.3.x: `docs/98-ENTREGA-PACKAGE-0.3.8.md`, `docs/97-SPIKE-PFSENSE-UPGRADE-CE.md`, `docs/96-ENTREGA-PACKAGE-0.3.7.md`, `docs/92-ENTREGA-CORRECAO-WRITE-CONFIG-SEGURO-2026-06-23.md`
- encerramento UX: `docs/88-ENCERRAMENTO-ROADMAP-UX-FASE0-FASE8-2026-06-09.md`, `docs/80-ENTREGA-FRONTEND-FASE0-FASE1-LAYOUT-2026-06-09.md`, `docs/77-ENTREGA-POS-RBAC-UX-LAYOUT-2026-06-09.md`
- versionamento obrigatorio: `.cursor/rules/versioning.mdc`

## Roadmap UX front-end — Fases 0–8 (**encerrado**, 2026-06-09)

Todas as fases do plano 24 concluidas (layout → design system global). Painel `1.0.1`, API `0.2.10`.

Ordem de leitura quando a tarefa for UX do painel (manutencao ou consulta):

1. `LEITURA-INICIAL.md`
2. `docs/88-ENCERRAMENTO-ROADMAP-UX-FASE0-FASE8-2026-06-09.md`
3. `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md`
4. Entrega da fase especifica: `docs/80` a `docs/87`
5. `23-matriz-permissoes-e-escopo-rbac-2026-06-09.md` (menu e rotas respeitam permissoes)

## Trilha UX front-end — Fase 0 + Fase 1 (**concluida**)

Direcao entregue: sidebar colapsavel + header + breadcrumbs + `components/ui/` — Dashboard/Firewalls/detalhe **nao** refatorados nesta etapa.

Documentos:

1. `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md`
2. `docs/79-TRILHA-FRONTEND-FASE0-FASE1-LAYOUT-NAVEGACAO-2026-06-09.md`
3. `docs/80-ENTREGA-FRONTEND-FASE0-FASE1-LAYOUT-2026-06-09.md` — entrega
4. `23-matriz-permissoes-e-escopo-rbac-2026-06-09.md` (menu respeita permissoes)

## Atualizacao critica em 2026-06-09 — trilha RBAC **ENCERRADA**

Trilha concluida: usuarios, permissoes granulares, escopo por cliente, perfil `client`, UX administrativa e auditoria endurecida.

**Encerramento formal:** `docs/76-ENCERRAMENTO-TRILHA-RBAC-2026-06-09.md`

Ordem de leitura quando a tarefa for RBAC/permissoes (manutencao ou consulta):

1. `LEITURA-INICIAL.md`
2. `docs/76-ENCERRAMENTO-TRILHA-RBAC-2026-06-09.md`
3. `22-plano-mestre-rbac-usuarios-permissoes-escopo-2026-06-09.md`
4. `23-matriz-permissoes-e-escopo-rbac-2026-06-09.md`
5. `docs/75-CHECKLIST-TESTES-RBAC-ESCOPO-2026-06-09.md`
6. Fase especifica: `docs/69` a `docs/74`

Estado final (`2026-06-09`):

| Fase | Doc | Versao | Status |
|------|-----|--------|--------|
| A | `docs/69` | painel `0.1.21` | encerrada |
| B | `docs/70` | API/web `0.2.0` | encerrada |
| C | `docs/71` | API/web `0.2.1` | encerrada |
| D | `docs/72` | API/web `0.2.2` | encerrada |
| E | `docs/73` | API/web `0.2.3` | encerrada |
| F | `docs/74` | API `0.2.4` / painel `0.2.3` | encerrada |
| Pos-RBAC | `docs/77` | painel `0.2.5` | entregue |

Smokes RBAC: `scripts/smoke-rbac-*.sh` + `scripts/run-smoke-suite.sh`

## Atualizacao critica em 2026-06-08

Foi criada uma camada canonica para organizar a retomada do projeto e preparar o modulo de backup do `config.xml` dos pfSense.

Ordem de leitura atualizada para novos chats:

1. `LEITURA-INICIAL.md`
2. `CORTEX.md`
3. `docs/00-INDICE-OPERACIONAL.md`
4. `docs/63-PLANO-MESTRE-ORGANIZACAO-QUALIDADE-BACKUP-PFSENSE-2026-06-08.md`
5. `docs/64-ESPECIFICACAO-MODULO-BACKUP-PFSENSE-2026-06-08.md`, quando a tarefa envolver backup
6. `docs/67-CHECKLIST-REVISAO-PLANO-BACKUP-2026-06-08.md`, quando for implementar o modulo de backup
7. `docs/DIRETRIZES-E-FUNCIONAMENTO.md`
8. `docs/HISTORICO-E-LINHA-DO-TEMPO.md`, quando for refatorar ou reabrir assunto antigo

Estado observado em `2026-06-08`:

- **externo (site):** `https://pfs-monitor.systemup.inf.br`
- **interno (LAN):** `http://192.168.100.221:3031` — **interno (localhost):** `http://127.0.0.1:8088` — ver `docs/89-ACESSO-INTERNO-E-EXTERNO.md`
- stack `docker compose` esta rodando com `api`, `web`, `db` e `nginx` saudaveis
- dominio publico `https://pfs-monitor.systemup.inf.br/healthz` responde `200`
- package pfSense publicado na epoca: `0.3.6` (superseded — ver tabela de versoes no topo deste arquivo)
- ~~package pfSense legado observado em 2026-06-08: `0.2.27`~~ — superseded pela trilha 0.4.x
- modulo de backup de `config.xml` **nao existia ainda** nesta data (implementado depois — ver estado consolidado abaixo)
- origem interna canonica no repositorio: `http://192.168.100.221:3031` (docs historicos na raiz podem citar `192.168.100.244`)
- limite heartbeat `64 KB`; rota de backup preparada para `5 MB` no nginx interno e referencia ISPConfig
- Fase B parcial: repo saneado; falta ISPConfig no host, chave `BACKUP_ENCRYPTION_KEY_BASE64` e medicao de `config.xml` em homolog
- para implementar backup, ler `docs/67-CHECKLIST-REVISAO-PLANO-BACKUP-2026-06-08.md` e depois `docs/64-...md`

## Estado consolidado (2026-07-01)

Referencia canonica para retomada — confira versoes no topo deste arquivo.

**Produto hoje:**

- controlador: API `0.6.4`, painel `1.4.5`, package/agente `0.4.7`
- dominio externo: `https://pfs-monitor.systemup.inf.br`; LAN: `http://192.168.100.221:3031`; localhost gateway: `http://127.0.0.1:8088`
- modulos operacionais: heartbeat snapshot, alertas, RBAC granular + escopo por cliente, MFA TOTP (politica operacional via painel + env override), backup `config.xml` **com diff/drift/retencao avancados (flags off por default)**, `remote_access_url`, `package_upgrade`, **notificacoes externas** (feature flag off por default), **dashboard frota** (`/dashboard` + `GET /api/v1/dashboard/fleet`), **tags/grupos/criticidade** (Fase 3 plano 117), **rollups de metricas** (Fase 6 plano 117, flag off por default)
- admin `/admin/mfa-politica`: enforcement MFA por perfil, modo soft/blocking, conformidade
- inventario `/nodes`: colunas **Versao pfSense**, **Pacote** (`agent_version`), **Acesso** (`remote_access_url`), **Criticidade**, **Tags**; filtros tag/grupo/criticidade
- admin `/admin/notificacoes`: canais (webhook/email/telegram), regras, historico de entregas
- admin `/admin/grupos`: tags e grupos ad-hoc da frota
- smokes: `scripts/run-smoke-suite.sh` (referencia pos-mudancas)

**Proximo passo:** checklist enablement pos-117 (`docs/134-CHECKLIST-ENABLEMENT-POS-PLANO-117-2026-07-02.md`); homologar flags em staging; rollout package `0.4.10`. Ver `docs/124-ENTREGA-OBSERVABILIDADE-HISTORICA-2026-07-02.md`.

**Plano de melhorias seguras:** `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md` — codigo entregue; homologacao operacional pendente (checklist 134).

**Plano pfREST / gerenciador centralizado:** `docs/125-PLANO-PFREST-GERENCIAMENTO-CENTRALIZADO-2026-07-02.md` — trilha pos-117 para gestao de muitos pfSense com pfREST, read-only primeiro e escrita com guardrails.

---

## Arquivo historico — estado em 2026-03-15

> Secao abaixo preservada como linha do tempo do MVP. **Nao** usar como verdade operacional atual — ver secao **Estado consolidado (2026-07-01)** acima.

Data de referencia: `2026-03-15`

Fase atual:

- `Fase 1 - MVP do controlador`

Progresso:

- fase atual: `100%`
- plano total: `93%`
- **trilha homologacao real + alinhamento package:** encerrada (doc 43)
- escopo do servidor/controlador: `100%`
- observacao de continuidade: `abrir novo chat e seguir a partir deste arquivo e de 00_inicio.md e 00-README.md`
- **diretrizes e funcionamento:** `docs/DIRETRIZES-E-FUNCIONAMENTO.md` — versões (package, agente, painel), release, cadastro (versões só do cliente), sync do config no firewall, regras Cursor
- **histórico e linha do tempo:** `docs/HISTORICO-E-LINHA-DO-TEMPO.md` — o que foi feito (manutenção, VPN por túnel, interfaces, cadastro, UI), decisões e **erros a não repetir**

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
- versão do agente: definida em `SYSTEMUP_MONITOR_AGENT_VERSION` no `.inc`; enviada no heartbeat; exibida no painel (coluna Agente, editar cadastro só leitura) e em Services > SystemUp Monitor > Diagnóstico; CLI `systemup_monitor_cli.php sync` regera o config no firewall; install.sh chama sync após seed
- cadastro de node: versões pfSense e agente somente leitura (preenchidas pelo heartbeat); API não aceita alteração desses campos no create/update
- painel: versão no rodapé lida de `package.json` (layout); dashboard com colunas Versão (sem -RELEASE) e Agente; indicador de manutenção (M) ao lado de Abrir
- package pfSense 0.2.11: tela Configuração com lista Description/Actions; Diagnóstico com "Versão do agente" e sem mensagem de homologação; comando uninstall na página de bootstrap do node
- controlador refatorado em `2026-03-19` para modelo de **snapshot operacional**: `heartbeats` deixa de crescer como histórico contínuo; o `Node` passa a armazenar o estado atual usado por dashboard/inventário/detalhe; ver `docs/61-REFATORACAO-SNAPSHOT-OPERACIONAL-2026-03-19.md`
- instalação do package no pfSense agora aceita `--heartbeat-mode normal|light`; o painel e a rota `/bootstrap` expõem essa escolha e o modo `normal` passou a ser o padrão; ver `docs/62-MODO-HEARTBEAT-INSTALACAO-PFSENSE-2026-03-19.md`

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
- origem interna historicamente documentada como `192.168.100.244:8088`, mas em `2026-06-08` este ponto foi marcado para saneamento porque o ambiente informado/observado usa `192.168.100.221`, tambem com publicacao em `192.168.100.221:3031`
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

## O que falta fazer em seguida (2026-07-01)

1. **Rollout package `0.4.7`:** alinhar frota a `config/package-release.env`; agentes &lt; 0.4.6 precisam de instalacao manual uma vez antes do upgrade remoto.
2. **Monitorar drift:** coluna **Pacote** em `/nodes` vs release alvo; acionar upgrade remoto ou manual conforme `docs/114-UPGRADE-REMOTO-PACKAGE.md`.
3. **Smoke suite:** manter `scripts/run-smoke-suite.sh` apos mudancas em API, painel, backup ou package.
4. **Expansao operacional:** novos firewalls via `generate-install-command.sh` + `verify-bootstrap-release.sh`.
5. **Fase B (servicos):** catalogo, `MONITOR_AGENT_PACKAGES`, GUI — ver `21-evolucao-servicos-e-fase-b-2026-03-13.md` (trilha independente).
6. **Contrato externo:** `BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/verify-origin-contract.sh` apos ajustes em ISPConfig/Cloudflare/nginx.

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
- `docs/00-INDICE-OPERACIONAL.md`
- `00-README.md`
- `docs/63-PLANO-MESTRE-ORGANIZACAO-QUALIDADE-BACKUP-PFSENSE-2026-06-08.md`, se a conversa envolver rumo, organizacao ou backup
- `docs/64-ESPECIFICACAO-MODULO-BACKUP-PFSENSE-2026-06-08.md`, se a conversa envolver implementacao de backup

Isso deve bastar para retomar o desenvolvimento sem explicar tudo novamente.

## Ultima entrega registrada

- `2026-03-15`: **Trilha de deleção real de clientes — implementada.** Ver `docs/58-TRILHA-DELECAO-REAL-CLIENTES-2026-03-15.md`. DELETE /api/v1/admin/clients/:id; botão Deletar cliente na UI (0 firewalls); bloqueio com mensagem se 1+ firewalls; painel 0.1.16, API 0.1.6.
- `2026-03-15`: **Trilha de correção REAL da semântica de deleção e saneamento dos dados operacionais — implementada.** Ver `docs/57-TRILHA-SEMANTICA-DELECAO-E-SANEAMENTO-DADOS-2026-03-15.md`. Delete usuário (body/Content-Type); getFilters só clientes/sites ativos; listSessions só não revogadas; painel 0.1.15, API 0.1.5.
- `2026-03-15`: **Trilha de correção de navegação administrativa e saneamento do ciclo de vida — implementada.** Ver `docs/56-TRILHA-NAVEGACAO-ADMIN-E-SANEAMENTO-CICLO-VIDA-2026-03-15.md`. Menu longest-match; Minha conta compacta (tabela); gestão real de usuários (listar ativos, deletar, ver inativos); deleção/limpeza coerente; painel 0.1.14, API 0.1.4.
- `2026-03-15`: **Microtrilha de varredura final de nomenclatura Cliente/Firewall — implementada.** Ver `docs/55-MICROTRILHA-VARREDURA-NOMENCLATURA-CLIENTE-FIREWALL-2026-03-15.md`. revalidatePath /admin/clientes; opção "Todos" em filtros; label "Cliente / Local"; separador " — "; painel 0.1.13.
- `2026-03-15`: **Trilha de correção do modelo operacional e limpeza da interface administrativa — implementada.** Ver `docs/54-TRILHA-MODELO-OPERACIONAL-CLIENTE-FIREWALL-2026-03-15.md`. Site 100% invisível na UX; cadastro apenas Novo cliente e Novo firewall (sem Novo site); Usuários com abas Usuarios/Sessoes; página Clientes (ex-clientes-sites) só clientes ativos e firewalls; painel 0.1.12.
- `2026-03-15`: **Microtrilha de simplificação visual cadastro/auditoria/instalação — implementada.** Ver `docs/53-ENTREGA-SIMPLIFICACAO-VISUAL-CADASTRO-AUDIT-BOOTSTRAP-2026-03-15.md`. Cadastro: apenas Novo cliente e Novo firewall na superfície; Novo site, Novo usuário e Token em Cadastros avançados. Auditoria: lista compacta, payload sob demanda (Detalhes). Instalação: layout equilibrado (md:grid-cols-2), filtros compactos. Painel 0.1.11.
- `2026-03-15`: **Microtrilha de alinhamento do smoke administrativo com o novo /admin — encerrada.** Ver doc 52. Numeração [1/14]…[14/14]; passo GET /admin HTTP 200; smoke API-first.
- `2026-03-15`: **Trilha de polimento do cadastro inicial no admin — implementada e encerrada.** Ver `docs/50` e `docs/51`. Formulários no `/admin` sob demanda (cards colapsáveis); apenas um card expandido por vez; auto-expansão via `?section=`. Versões: painel 0.1.10, API 0.1.3, package 0.2.0.
- `2026-03-15`: **Trilha de desmembramento da interface administrativa — implementada e encerrada.** Ver `docs/48` e `docs/49`. Cadastro (`/admin`) enxuto; `/admin/usuarios`, `/admin/clientes-sites`; nav e atalhos. Painel 0.1.9.
- `2026-03-15`: **Trilha de despoluição visual do dashboard operacional.** Ver `docs/46-DESPOLUICAO-VISUAL-DASHBOARD-OPERACIONAL-2026-03-15.md`. Colunas Host e Site removidas da grade principal; tabela com 11 colunas. Versão painel: 0.1.7.
- `2026-03-15`: **Trilha de dashboard operacional / lista de servidores.** Ver `docs/45-DASHBOARD-OPERACIONAL-LISTA-SERVIDORES-2026-03-15.md`. Lista/tabela com CPU, memória, disco, uptime; API estendida; fallback "—".
- `2026-03-15`: **Trilha de exclusão de hosts implementada.** Ver `docs/44-TRILHA-EXCLUSAO-HOSTS-2026-03-15.md`. Exclusão individual e em lote, confirmação obrigatória, RBAC admin/superadmin, auditoria persistente.
- `2026-03-15`: **Trilha de homologação real e alinhamento do package pfSense encerrada formalmente.** Ver `docs/43-ENCERRAMENTO-TRILHA-HOMOLOGACAO-ALINHAMENTO-PACKAGE-2026-03-15.md`. Versões anteriores: painel 0.1.4, API 0.1.0. Lasalle Agro homologado. API retorna package_command em produção.
- `2026-03-15`: Validação em produção pós-correção. Ver `docs/42-VALIDACAO-PRODUCAO-POS-CORRECAO-PACKAGE-2026-03-15.md`. PACKAGE_RELEASE_* confirmadas; package_command retornado.
- `2026-03-15`: Correção do desalinhamento fluxo package. Ver `docs/41-CORRECAO-DESALINHAMENTO-FLUXO-PACKAGE-2026-03-15.md`. verify-bootstrap-release, run-bootstrap-preflight e smoke-bootstrap-flow ajustados para modo package.
- `2026-03-15`: Validação Lasalle Agro. Ver `docs/40-VALIDACAO-PFSENSE-REAL-LASALLE-AGRO-2026-03-15.md`. package=1, menu=1, service=1. Lasalle Agro HOMOLOGADO.
- `2026-03-12`: `packages/pfsense-package` evoluido de scaffold para port empacotavel do pfSense, com `Makefile`, `pkg-plist`, scripts `pkg-install/pkg-deinstall`, runtime do agente embutido, sync da GUI gerando `/usr/local/etc/monitor-pfsense-agent.conf` e controle do servico `monitor_pfsense_agent`; gestao de tokens auxiliares, backup/restore do PostgreSQL, `verify-origin-contract.sh`, `AUTO_STAGE_RELEASE=1` e a suite completa permaneceram validados na mesma iteracao
- `2026-03-13`: primeira rodada funcional de homologacao real do pacote pfSense concluida com GUI, servico e heartbeat real chegando ao painel para o firewall `Lasalle Agro`; linha do tempo, comandos corretos, erros reais e correcoes registradas em `18-homologacao-pfsense-package-real-2026-03-13.md`
- `2026-03-13`: runtime do agente ajustado para filtrar a lista padrao de servicos conforme o `config.xml` do pfSense, atacando a causa mais provavel do falso `degraded` observado no node `Lasalle Agro`
- `2026-03-13`: rodada de endurecimento do package pfSense registrada em `20-endurecimento-pfsense-package-2026-03-13.md`, incluindo `v0.1.1` a `v0.1.6`, correcao do fluxo HTTP/HMAC, coleta local refinada e selecao explicita por firewall dos servicos nativos monitorados
- `2026-03-13`: evolucao da logica de servicos e Fase B em `21-evolucao-servicos-e-fase-b-2026-03-13.md`: limpeza de orfaos no ingest, impact_on_status no backend, catalogo com service_name, MONITOR_AGENT_PACKAGES no agente e GUI

## Notas especificas para o proximo chat

- **Package atual:** `0.4.7` (ver tabela no topo). Entregas 0.3.x–0.4.6 permanecem no historico (`docs/98`, `docs/114`, etc.).
- **Microtrilha doc 52 (alinhamento smoke admin com novo /admin) está encerrada.** Smoke administrativo com 14 passos; passo [2/14] valida GET /admin HTTP 200; smoke continua API-first; sem grep em texto da página.
- **Trilhas docs 50 e 51 (polimento cadastro inicial admin) estão encerradas.** Formulários em `/admin` são sob demanda (cards colapsáveis); um card expandido por vez. Versões atuais: painel 0.1.10, API 0.1.3.
- **Trilhas docs 48 e 49 (desmembramento interface admin) estão encerradas.** Cadastro em `/admin` enxuto; Usuários em `/admin/usuarios` (superadmin); Clientes em `/admin/clientes` (redirect de `/admin/clientes-sites`).
- **Trilha doc 54 (modelo operacional Cliente/Firewall) está encerrada.** Site invisível na UX; cadastro só Novo cliente e Novo firewall; Usuários com abas; página Clientes só clientes ativos. Painel 0.1.12.
- **Microtrilha doc 55 (varredura nomenclatura) está encerrada.** revalidatePath /admin/clientes; "Todos" nos filtros; "Cliente / Local"; separador " — ". Painel 0.1.13.
- **Trilha doc 47 (simplificacao cadastro Cliente+Firewall) está encerrada.** Não reabrir sem decisão explícita. Regra de site: client_id com 0/1/2+ sites; site_id legado mantido.
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
- historico: documentacao de deploy chegou a ser atualizada para usar `192.168.100.244:8088`; em `2026-06-08`, este ponto foi marcado para saneamento porque o ambiente observado/informado usa `192.168.100.221`

Pendencias imediatas:

- sanear origem interna/publicacao antes de liberar rota sensivel de backup
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

## Fluxo externo historicamente decidido

```text
pfSense cliente
-> https://pfs-monitor.systemup.inf.br
-> Cloudflare
-> ISPConfig 192.168.100.253
-> proxy reverso
-> Monitor-Pfsense origem interna validada
```

Observacao em `2026-06-08`: documentos antigos citam `192.168.100.244:8088`, mas o ambiente informado/observado usa `192.168.100.221`, tambem com publicacao em `192.168.100.221:3031`. Antes do modulo de backup, a origem efetiva deve ser saneada e registrada.
