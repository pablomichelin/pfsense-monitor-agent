# Indice operacional do projeto

Data de referencia: `2026-08-31`

Este arquivo e o mapa curto para retomar o Monitor-Pfsense em qualquer novo chat, nova manutencao ou nova trilha de desenvolvimento.

> **Versoes atuais (codigo):** API `0.11.1` · painel `1.12.6` · package pfSense `0.5.18` (publicar com `scripts/release-pfsense-package.sh`).
>
> **Ultima entrega (2026-08-31):** técnico com User Manager (exceto admin/root) para usuários OpenVPN. Package `0.5.18`. Ver `docs/182-ENTREGA-TECNICO-USER-MANAGER-EXCETO-ADMIN-2026-08-31.md`.
>
> **Entrega anterior (2026-08-31):** correção do lote de bugs (saúde IPv6/VPN, gate de backup, técnico, nginx 502, dpinger, preset). API `0.11.1`, painel `1.12.6`, package `0.5.17`. Ver `docs/181-ENTREGA-CORRECAO-LOTE-BUGS-SAUDE-BACKUP-TECNICO-2026-08-31.md`.
>
> **Entrega anterior (2026-08-31):** densidade do painel — `--section-gap` 0.75rem. Painel `1.12.5`. Ver `docs/180-ENTREGA-DENSIDADE-ESPACAMENTO-PAINEL-2026-08-31.md`.
>
> **Entrega anterior (2026-08-31):** resultado do lote de técnicos atualiza após backup automático. Painel `1.12.3`. Ver `docs/179-ENTREGA-UX-RESULTADO-BACKUP-PROVISION-TECNICO-2026-08-31.md`.
>
> **Entrega anterior (2026-08-24):** homologação CE 2.9.0 no lab `.10` — package `0.5.16`, homologado com ressalvas. Ver `docs/177-PLANO-HOMOLOGACAO-PFSENSE-2.9.0-LAB-10-2026-08-24.md` e `docs/178-ENTREGA-HOMOLOGACAO-PFSENSE-2.9.0-PACKAGE-0.5.16-2026-08-24.md`.
>
> **Entrega anterior (2026-08-23):** reparo oficial do repo de update (certctl, lock, IPv4). Ver `docs/174-ENTREGA-REPARO-REPO-UPDATE-PFSENSE-2026-08-23.md`.
>
> **Entrega anterior (2026-08-23):** check do OS com refresh de repositórios pkg; botão Atualizar verificação. Ver `docs/173-ENTREGA-CHECK-OS-REPOSITORIO-STALE-2026-08-23.md`.
>
> **Entrega anterior (2026-08-23):** IPsec não degrada o node; create de técnico no 2.7.x; scrub/expire de senha no follow-up. Ver `docs/172-ENTREGA-SAUDE-BOX-VS-IPSEC-E-TECNICO-2.7-2026-08-23.md`.
>
> **Entrega anterior (2026-08-20):** reorganização visual do painel concluída — painel **1.11.2**. Ver `docs/171-ENTREGA-REORGANIZACAO-VISUAL-PAINEL-1.11.2-2026-08-20.md` (plano `docs/170-PLANO-REORGANIZACAO-VISUAL-PAINEL-2026-08-20.md`).
>
> **Entrega anterior (2026-08-20):** correção órfão Unix no create de técnico — package **0.5.10**. Ver `docs/170-CORRECAO-USUARIO-ORFAO-CREATE-LOCAL-USER-2026-08-20.md`.
>
> **Entrega anterior (2026-08-20):** tema claro completo do painel — painel **1.11.0**. Ver `docs/169-ENTREGA-TEMA-CLARO-PAINEL-2026-08-20.md`.
>
> **Entrega anterior (2026-08-20):** UX P0 gestao de tecnicos — painel **1.10.15**. Ver `docs/168-ENTREGA-UX-P0-GESTAO-TECNICOS-2026-08-20.md`.
>
> **Entrega anterior (2026-08-01):** ordenação clicável das colunas do inventário — API **0.10.5**, painel **1.10.11**. Ver `docs/165-ENTREGA-ORDENACAO-COLUNAS-INVENTARIO-2026-08-01.md`.
>
> **Entrega anterior (2026-08-01):** exclusão real do cadastro de técnicos — API **0.10.4**, painel **1.10.10**. Ver `docs/164-ENTREGA-EXCLUSAO-REAL-CADASTRO-TECNICOS-2026-08-01.md`.
>
> **Entrega anterior (2026-08-01):** backup habilitado por padrão no package — package **0.5.8**, painel **1.10.9**. Ver `docs/163-ENTREGA-BACKUP-PADRAO-LIGADO-PACKAGE-0.5.8-2026-08-01.md`.
>
> **Entrega anterior (2026-08-01):** UX despoluição P0 inventário `/nodes` — painel **1.10.8**. Ver `docs/162-ENTREGA-UX-DESPOLUICAO-P0-INVENTARIO-2026-08-01.md`. Plano: `docs/161-PLANO-UX-DESPOLUICAO-PAINEL-OPERADOR-2026-08-01.md` (P1/P2 pendentes).
>
> **Entrega anterior (2026-08-01):** proteção absoluta do usuário `admin` pfSense. API **0.10.3**, painel **1.10.7**, package **0.5.7**. Ver `docs/160-PROTECAO-USUARIO-ADMIN-PFSENSE-2026-08-01.md`.
>
> **Entrega anterior (2026-08-01):** delete de tecnico desabilitado corrigido. API **0.10.2**. Ver `docs/159-CORRECAO-DELETE-TECNICO-DESABILITADO-2026-08-01.md`.
>
> **Entrega anterior (2026-08-01):** package **0.5.5** — gestao de tecnicos habilitada por padrao + checkbox na GUI. Ver `docs/157-ENTREGA-PACKAGE-0.5.5-TECNICOS-PADRAO-LIGADO-2026-08-01.md`.
>
> **Entrega anterior (2026-08-01):** mensagem PT-BR para flag de tecnicos desligada no agente. Painel **1.10.4**.
>
> **Entrega anterior (2026-08-01):** gestao de tecnicos em `/nodes` exige selecao na tabela (checkboxes). Painel **1.10.3**.
>
> **Entrega anterior (2026-08-01):** senha minima de tecnico reduzida para **10** caracteres. API **0.10.1**, painel **1.10.2**.
>
> **Entrega anterior (2026-08-01):** correcao crash Server Components ao provisionar tecnico em `/nodes` — Server Actions retornam `{ ok, error }`, validacao de senha no cliente, mensagens PT-BR. Painel **1.10.1**. Ver `docs/156-CORRECAO-SERVER-ACTION-GESTAO-TECNICOS-2026-08-01.md`.
>
> **Entrega anterior (2026-07-31):** validacao E2E real de `local_user_create`/`set_password`/`delete` contra pfSense de producao (`192.168.100.254`) — achado e corrigido um segundo bug critico independente: `local_user_set_password()` exigia wrapper `{'item': $user}`, sem o qual a conta Unix nunca sincronizava (usuario "criado" mas sem login funcional). Corrigido com `apply_local_user_password()`, revalidado do zero. Package **0.5.4**. Ver `docs/155-VALIDACAO-E2E-LOCAL-USER-CREATE-PFSENSE-254-2026-07-31.md`.
>
> **Entrega anterior (2026-07-31):** pagina dedicada `/admin/tecnicos` (Fase 3 do plano 144 — matriz tecnico x firewall, reuso do painel de lote, indicador de acesso no detalhe do node via `GET /nodes/:id/technician-accounts`) + gate de backup recente de `config.xml` antes de qualquer escrita de usuario local (`local_user_create/set_password/disable/delete`), flags `TECHNICIAN_ACCOUNT_REQUIRE_RECENT_BACKUP_ENABLED`/`TECHNICIAN_ACCOUNT_REQUIRE_BACKUP_MAX_AGE_HOURS`. API **0.10.0**, painel **1.10.0**. Ver `docs/154-ENTREGA-ADMIN-TECNICOS-GATE-BACKUP-2026-07-31.md`.
>
> **Entrega anterior (2026-07-31):** auditoria de codigo da gestao de tecnicos — 2 achados criticos corrigidos (vazamento de senha em `payload_json` do historico de comandos; `local_user_create` sem atribuir `uid`/`nextuid`) + validacao 400 vs 500, reativacao de tecnico revogado, confirmacao obrigatoria em lote. API **0.9.0**, painel **1.9.0**, package **0.5.3**. Ver `docs/153-AUDITORIA-CORRECOES-GESTAO-TECNICOS-2026-07-31.md`. Anterior: `docs/152-...md`.
>
> **Plano em andamento:** rollout package **0.5.4** na frota (validacao E2E de create/set_password concluida contra pfSense real). Ver `docs/144-...md`, `docs/155-...md`.
>
> **Entrega anterior (2026-06-30):** upgrade remoto de package — package `0.4.6`, API `0.6.4`. Ver `docs/114-ENTREGA-UPGRADE-REMOTO-PACKAGE-2026-06-30.md`, guia `docs/114-UPGRADE-REMOTO-PACKAGE.md`.
>
> **Entrega anterior (2026-06-30):** correção heartbeat light + recovery offline — package `0.4.5`, API `0.6.3`. Ver `docs/113-ENTREGA-CORRECAO-HEARTBEAT-LIGHT-OFFLINE-2026-06-30.md`.
>
> **Entrega anterior (2026-06-24):** correção falhas pós-auditoria (plano 110, 23/23) — package `0.4.3`, API `0.6.1`, painel `1.4.2`. Ver `docs/111-ENTREGA-CORRECAO-FALHAS-AUDITORIA-110-2026-06-24.md`.
>
> **Entrega anterior (2026-06-24):** link de acesso remoto por firewall — API `0.6.0`, painel `1.4.0`. Campo `remote_access_url`, coluna **Acesso** no inventario. Ver `docs/104-ENTREGA-LINK-ACESSO-REMOTO-FIREWALL-2026-06-24.md`.
>
> **Entrega anterior (2026-06-24):** fechamento auditoria — API `0.5.0`, painel `1.3.0`, package `0.4.1`. MFA TOTP completo, rate-limit persistido, endurecimentos de seguranca. Ver `docs/103-ENTREGA-FECHAMENTO-AUDITORIA-MFA-RATELIMIT-PACKAGE-2026-06-24.md`.
>
> **Entrega anterior (2026-06-23):** correcoes de auditoria de seguranca — package/API `0.4.0`, painel `1.2.0`. Ver `docs/101-ENTREGA-CORRECOES-AUDITORIA-SEGURANCA-PFSENSE-2026-06-23.md` (A1–A7, B1–B7, C1–C8, D1–D2; gaps E1/E2 resolvidos na entrega 103).

## Ordem de leitura atual

Leia nesta ordem:

1. `LEITURA-INICIAL.md`
2. `CORTEX.md`
3. `docs/00-INDICE-OPERACIONAL.md`
4. `docs/63-PLANO-MESTRE-ORGANIZACAO-QUALIDADE-BACKUP-PFSENSE-2026-06-08.md`
5. `docs/64-ESPECIFICACAO-MODULO-BACKUP-PFSENSE-2026-06-08.md`, quando a tarefa envolver backup do `config.xml`
6. `docs/65-FRONTEND-E-DEPLOY-BACKUP-PFSENSE-2026-06-08.md`, quando a tarefa envolver painel, deploy ou package pfSense
7. `docs/66-DECISAO-MODULO-BACKUP-INTEGRADO-SYSTEMUP-MONITOR-2026-06-08.md`, quando houver duvida entre modulo integrado e software separado
8. `docs/67-CHECKLIST-REVISAO-PLANO-BACKUP-2026-06-08.md`, quando for implementar ou validar o plano de backup
9. `docs/DIRETRIZES-E-FUNCIONAMENTO.md`
10. `docs/HISTORICO-E-LINHA-DO-TEMPO.md`, quando for refatorar ou reabrir tema ja mexido

## Acesso interno vs externo

| Contexto | Endereco |
|----------|----------|
| **Externo (site publico)** | `https://pfs-monitor.systemup.inf.br` |
| **Interno (LAN)** | `http://192.168.100.221:3031` |
| **Interno (localhost no host)** | `http://127.0.0.1:8088` |

Detalhes, fluxo do proxy e exemplos de teste: `docs/89-ACESSO-INTERNO-E-EXTERNO.md`.

## Estado verdadeiro em 2026-07-01

Verificado no repositorio (`apps/*/package.json`, `config/package-release.env`, `packages/pfsense-package/Makefile`, codigo em `apps/api/src/` e `apps/web/app/`):

| Componente | Versao | Fonte |
|------------|--------|-------|
| API | `0.6.4` | `apps/api/package.json` |
| Painel | `1.4.5` | `apps/web/package.json` |
| Package pfSense | `0.4.7` | Makefile + `config/package-release.env` |
| Agente no package | `0.4.7` | `SYSTEMUP_MONITOR_AGENT_VERSION` em `systemup_monitor.inc` |

**Infra e acesso:**

- stack `docker compose`: `api`, `web`, `db`, `nginx`
- externo: `https://pfs-monitor.systemup.inf.br/healthz`
- LAN: `http://192.168.100.221:3031`; localhost gateway: `http://127.0.0.1:8088`
- diretorio canonico: `/Dados/Monitor-Pfsense` (host historico `192.168.100.244` migrado em 2026-06-23)

**Modulos implementados (nao planejamento):**

- backup `config.xml`: `POST /api/v1/ingest/config-backup`, listagem/download em `/api/v1/nodes/:id/config-backups/*`, painel `/backups`, aba Backup no package pfSense; armazenamento criptografado em `data/pfsense-config-backups/`
- MFA TOTP (`/api/v1/auth/mfa/*`), RBAC granular + escopo por cliente, rate-limit persistido
- `remote_access_url` por firewall; colunas **Acesso** e **Pacote** no inventario
- `package_upgrade` remoto (agente ≥ 0.4.6); `pfsense_upgrade` semi-manual
- limite heartbeat `64 KB`; rota backup `5 MB` em nginx interno + referencia ISPConfig

**Proximo passo operacional:** rollout package `0.4.7` na frota; monitorar coluna **Pacote** em `/nodes`; ver `docs/114-UPGRADE-REMOTO-PACKAGE.md`.

### Snapshot historico (2026-06-08)

> Preservado para contexto. **Superseded** pelo bloco acima.

- na epoca, package publicado era `0.3.6` e backup ainda era trilha de planejamento
- `config/package-release.env` apontava para SHA256 de release antiga
- origem interna ja migrada para `192.168.100.221:3031`

## Regra para os documentos antigos

Nao mover documentos antigos em massa sem uma trilha propria.

Motivo:

- muitos arquivos se referenciam por caminho relativo
- mover tudo agora pode quebrar links e contexto historico
- o melhor caminho e criar uma camada canonica e migrar aos poucos

## Camadas documentais

### 1. Entrada e governanca

Arquivos que guiam qualquer retomada:

- `LEITURA-INICIAL.md`
- `CORTEX.md`
- `00-README.md`
- `00_inicio.md`
- `docs/00-INDICE-OPERACIONAL.md`

### 2. Base historica do projeto

Arquivos numerados da raiz:

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

Esses documentos sao base/historico. Nao sao sempre a verdade operacional mais recente.

### 3. Operacao atual

Arquivos mais uteis para operar o sistema hoje:

- `docs/DIRETRIZES-E-FUNCIONAMENTO.md`
- `docs/CADASTRO-E-COMANDOS-PFSENSE.md`
- `docs/INSTALACAO-AGENTE-PFSENSE.md`
- `docs/COMANDO-ATUALIZAR-PACKAGE-PFSENSE.md`
- `docs/RELEASE-PACKAGE-PFSENSE-AUTOMATICO.md`
- `docs/SEGURANCA-E-MODELO-DE-AMEACAS.md`
- `docs/MONITORAMENTO-POR-TUNEL-VPN.md`

### 4. Historico e trilhas encerradas

Arquivos em `docs/22...` ate `docs/62...` registram trilhas, correcoes, validacoes, evidencias e entregas.

Use esses arquivos para entender por que algo foi feito. Evite usa-los como contrato atual sem conferir `LEITURA-INICIAL.md`, `CORTEX.md` e este indice.

### 5. Plano atual de evolucao

#### Plano de melhorias seguras e fundacoes novas (2026-07-02)

- `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md` — trilha executavel para Composer 2.5/Claude, com fases, gates de seguranca, entregas e acompanhamento.
- Escopo: notificacoes externas, dashboard frota, tags/grupos, politica MFA, backup avancado, observabilidade, fundacao de jobs/comandos, acoes allowlistadas, certificados, vault/capacidades e piloto pfREST read-only/aliases.
- Fora do escopo: comandos arbitrarios, restore automatico, inbound generalizado, SSO/proxy pfSense completo e gestao ampla de regras/NAT/VPN sem nova decisao.

#### Plano pfREST / gerenciador centralizado pos-117 (2026-07-02)

- `docs/125-PLANO-PFREST-GERENCIAMENTO-CENTRALIZADO-2026-07-02.md` — trilha para evoluir o Monitor-Pfsense em gerenciador centralizado de muitos pfSense usando pfREST.
- Escopo: capacidades pfREST por firewall, vault/credenciais, inventario read-only, diff/drift/compliance, aliases centralizados, central de mudancas, regras/NAT restritos, DNS/DHCP, VPN read-only, certificados/servicos e governanca.
- Regra-mestra: read-only primeiro; escrita somente com backup, preview, RBAC, auditoria, canario, job serializado por firewall e feature flags desligadas por padrao.

#### Trilha RBAC (**encerrada** 2026-06-09)

Plano mestre na raiz:

- `22-plano-mestre-rbac-usuarios-permissoes-escopo-2026-06-09.md`
- `23-matriz-permissoes-e-escopo-rbac-2026-06-09.md`

Trilhas operacionais em `docs/`:

- `docs/68-DIAGNOSTICO-RBAC-USUARIOS-PERMISSOES-2026-06-09.md` — baseline
- `docs/69` a `docs/74` — fases A a F
- `docs/75-CHECKLIST-TESTES-RBAC-ESCOPO-2026-06-09.md`
- `docs/76-ENCERRAMENTO-TRILHA-RBAC-2026-06-09.md` — **encerramento formal**

Versoes atuais (produto): API `0.6.4`, painel `1.4.5`, package pfSense `0.4.7`. **Roadmap UX plano 24 encerrado** — encerramento formal: `docs/88-ENCERRAMENTO-ROADMAP-UX-FASE0-FASE8-2026-06-09.md`.

#### Trilha UX 161 — despoluição do painel (**P0 entregue; P1/P2 pendentes**)

- Plano: `docs/161-PLANO-UX-DESPOLUICAO-PAINEL-OPERADOR-2026-08-01.md` — inventário `/nodes` legível (~10s), densidade, filtros sob demanda, lote com contexto
- Entrega P0: `docs/162-ENTREGA-UX-DESPOLUICAO-P0-INVENTARIO-2026-08-01.md` — painel `1.10.8`
- Entrega backup padrão ligado: `docs/163-ENTREGA-BACKUP-PADRAO-LIGADO-PACKAGE-0.5.8-2026-08-01.md` — package `0.5.8`, painel `1.10.9`
- Tema claro: `docs/169-ENTREGA-TEMA-CLARO-PAINEL-2026-08-20.md` — painel `1.11.0`; tokens em `docs/SISTEMA-VISUAL-PAINEL.md`
- Reorganização visual consolidada: plano `docs/170-PLANO-REORGANIZACAO-VISUAL-PAINEL-2026-08-20.md`; entrega `docs/171-ENTREGA-REORGANIZACAO-VISUAL-PAINEL-1.11.2-2026-08-20.md` — painel `1.11.2`
- Check do OS com repositório stale: `docs/173-ENTREGA-CHECK-OS-REPOSITORIO-STALE-2026-08-23.md` — API `0.10.10`, painel `1.11.4`, package `0.5.12`
- Firmware branch + Apontar branch: `docs/175-ENTREGA-FIRMWARE-BRANCH-UPDATE-PFSENSE-2026-08-23.md` — API `0.11.0`, painel `1.12.1`, package `0.5.14`
- Técnico User Manager (exceto admin/root): `docs/182-ENTREGA-TECNICO-USER-MANAGER-EXCETO-ADMIN-2026-08-31.md` — package `0.5.18`
- Lote de bugs (saúde, backup, técnico, nginx, dpinger, preset): `docs/181-ENTREGA-CORRECAO-LOTE-BUGS-SAUDE-BACKUP-TECNICO-2026-08-31.md` — API `0.11.1`, painel `1.12.6`, package `0.5.17`
- Densidade / espaçamento do painel: `docs/180-ENTREGA-DENSIDADE-ESPACAMENTO-PAINEL-2026-08-31.md` — painel `1.12.5`
- Resultado do lote de técnicos após backup: `docs/179-ENTREGA-UX-RESULTADO-BACKUP-PROVISION-TECNICO-2026-08-31.md` — painel `1.12.3`
- Homologação CE 2.9.0 (lab `.10`): `docs/177-PLANO-HOMOLOGACAO-PFSENSE-2.9.0-LAB-10-2026-08-24.md` + `docs/178-ENTREGA-HOMOLOGACAO-PFSENSE-2.9.0-PACKAGE-0.5.16-2026-08-24.md` — package `0.5.16`
- Hotfix helper firmware branch: `docs/176-HOTFIX-HELPER-FIRMWARE-BRANCH-0.5.15-2026-08-23.md` — painel `1.12.2`, package `0.5.15`
- Reparo do repo de update: `docs/174-ENTREGA-REPARO-REPO-UPDATE-PFSENSE-2026-08-23.md` — API `0.10.11`, painel `1.11.5`, package `0.5.13`
- **Não reabre** o roadmap UX Fases 0–8 (`docs/88-...`)

#### Roadmap UX front-end — encerramento formal (**plano 24 encerrado**)

- `docs/88-ENCERRAMENTO-ROADMAP-UX-FASE0-FASE8-2026-06-09.md` — **encerramento formal** (fases 0–8; trilhas `docs/79`–`docs/87`)
- Plano mestre: `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md`

#### Trilha UX front-end — Fase 0 + Fase 1 (**concluida**)

Plano mestre na raiz:

- `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md`

Trilha executavel:

- `docs/79-TRILHA-FRONTEND-FASE0-FASE1-LAYOUT-NAVEGACAO-2026-06-09.md`

Entrega: `docs/80-ENTREGA-FRONTEND-FASE0-FASE1-LAYOUT-2026-06-09.md`. Versao painel: `0.2.8` (+ hotfix `0.2.9`).

#### Trilha UX front-end — Fase 2 dashboard (**concluida**)

- Plano: `25-plano-fase2-dashboard-enxuto-kpis-zona-quente-2026-06-09.md`
- Trilha: `docs/81-TRILHA-FRONTEND-FASE2-DASHBOARD-ENXUTO-2026-06-09.md`
- Entrega: `docs/81-ENTREGA-FRONTEND-FASE2-DASHBOARD-ENXUTO-2026-06-09.md` — painel `0.3.0`

#### Trilha UX front-end — Fase 3 inventario (**concluida**)

- Plano: `26-plano-fase3-firewalls-inventario-backup-alertas-2026-06-09.md`
- Trilha: `docs/82-TRILHA-FRONTEND-FASE3-FIREWALLS-INVENTARIO-2026-06-09.md`
- Entrega: `docs/82-ENTREGA-FRONTEND-FASE3-FIREWALLS-INVENTARIO-2026-06-09.md` — painel `0.4.0`, API `0.2.6`

#### Trilha UX front-end — Fase 8 design system (**concluida** — roadmap plano 24 encerrado)

- Plano: `31-plano-fase8-design-system-pages-restantes-2026-06-09.md`
- Trilha: `docs/87-TRILHA-FRONTEND-FASE8-DESIGN-SYSTEM-PAGES-RESTANTES-2026-06-09.md`
- Entrega: `docs/87-ENTREGA-FRONTEND-FASE8-DESIGN-SYSTEM-PAGES-RESTANTES-2026-06-09.md` — painel `1.0.0`

#### Trilha UX front-end — Fase 7 auditoria filtros (**concluida**)

- Plano: `30-plano-fase7-auditoria-filtros-amigaveis-2026-06-09.md`
- Trilha: `docs/86-TRILHA-FRONTEND-FASE7-AUDITORIA-FILTROS-AMIGAVEIS-2026-06-09.md`
- Entrega: `docs/86-ENTREGA-FRONTEND-FASE7-AUDITORIA-FILTROS-AMIGAVEIS-2026-06-09.md` — painel `0.8.0`, API `0.2.7`

#### Trilha UX front-end — Fase 6 conta separada (**concluida**)

- Plano: `29-plano-fase6-conta-separada-polimento-ptbr-2026-06-09.md`
- Trilha: `docs/85-TRILHA-FRONTEND-FASE6-CONTA-SEPARADA-POLIMENTO-PTBR-2026-06-09.md`
- Entrega: `docs/85-ENTREGA-FRONTEND-FASE6-CONTA-SEPARADA-POLIMENTO-PTBR-2026-06-09.md` — painel `0.7.0`

#### Trilha UX front-end — Fase 5 backups frota (**concluida**)

- Plano: `28-plano-fase5-backups-frota-menu-2026-06-09.md`
- Trilha: `docs/84-TRILHA-FRONTEND-FASE5-BACKUPS-FROTA-MENU-2026-06-09.md`
- Entrega: `docs/84-ENTREGA-FRONTEND-FASE5-BACKUPS-FROTA-MENU-2026-06-09.md` — painel `0.6.0`

#### Trilha UX front-end — Fase 4 detalhe abas (**concluida**)

- Plano: `27-plano-fase4-detalhe-firewall-abas-2026-06-09.md`
- Trilha: `docs/83-TRILHA-FRONTEND-FASE4-DETALHE-FIREWALL-ABAS-2026-06-09.md`
- Entrega: `docs/83-ENTREGA-FRONTEND-FASE4-DETALHE-FIREWALL-ABAS-2026-06-09.md` — painel `0.5.0`

#### Trilha backup pfSense (2026-06-08)

- `docs/63-PLANO-MESTRE-ORGANIZACAO-QUALIDADE-BACKUP-PFSENSE-2026-06-08.md`
- `docs/64-ESPECIFICACAO-MODULO-BACKUP-PFSENSE-2026-06-08.md`
- `docs/65-FRONTEND-E-DEPLOY-BACKUP-PFSENSE-2026-06-08.md`
- `docs/66-DECISAO-MODULO-BACKUP-INTEGRADO-SYSTEMUP-MONITOR-2026-06-08.md`
- `docs/67-CHECKLIST-REVISAO-PLANO-BACKUP-2026-06-08.md`

Modulo de backup ja implementado no controlador; RBAC reforça escopo e download auditado.

#### Trilha package pfSense 0.3.6+ (**encerrada** — historico 2026-06-23)

Plano mestre de melhorias pendentes na epoca (merge `service`, ISPConfig/502, backoff backup, gateways, upgrade OS, cache XML, desinstalacao):

- [`docs/95-ENTREGA-INFRA-BACKUP-LIMIT-2026-06-23.md`](95-ENTREGA-INFRA-BACKUP-LIMIT-2026-06-23.md) — entrega Opção B Fase 0 (limite backup ISPConfig/compose)
- [`docs/98-ENTREGA-PACKAGE-0.3.8.md`](98-ENTREGA-PACKAGE-0.3.8.md) — entrega Opção D + Fase 3 (`pfsense_upgrade`, `node_secret` runtime)
- [`docs/pfsense-package/00-GUIA-OPERACAO-PACKAGE.md`](pfsense-package/00-GUIA-OPERACAO-PACKAGE.md) — **guia operacional atual** do package (atualizado 2026-07-01)
- [`docs/114-UPGRADE-REMOTO-PACKAGE.md`](114-UPGRADE-REMOTO-PACKAGE.md) — upgrade remoto `package_upgrade` (≥ 0.4.6)
- [`docs/94-PLANO-MELHORIAS-PACKAGE-0.3.6.md`](94-PLANO-MELHORIAS-PACKAGE-0.3.6.md) — plano executavel (historico)

**Package publicado hoje:** `0.4.7` (`config/package-release.env`). Trilha 0.3.x superseded.

## Estrutura de pastas atual

Pastas principais:

- `.cursor/`: regras e contexto do editor/assistente
- `apps/api/`: backend NestJS e Prisma
- `apps/web/`: painel Next.js
- `backups/`: backups locais do controlador, principalmente PostgreSQL
- `config/`: configuracoes versionadas, como release do package
- `data/`: dados persistentes locais, como PostgreSQL do compose
- `dist/`: artefatos versionados/publicaveis
- `docs/`: documentacao operacional, historica e trilhas
- `infra/`: Docker, nginx e referencia ISPConfig
- `packages/pfsense-agent/`: agente legado da fase inicial
- `packages/pfsense-package/`: package pfSense atual e principal
- `scripts/`: smokes, build, release, diagnostico, backup e operacao

## Estrutura documental desejada no futuro

Nao executar esta reorganizacao sem uma trilha propria.

Proposta futura:

```text
docs/
  00-INDICE-OPERACIONAL.md
  arquitetura/
  operacao/
  seguranca/
  pfsense-package/
  backup-pfsense/
  historico/
  evidencias/
  trilhas/
```

Regras para essa migracao futura:

- fazer em um commit separado
- usar `git mv` para preservar historico
- atualizar links internos
- rodar busca por referencias quebradas
- nao misturar mudanca documental com mudanca de codigo

## Regra para novo documento

Todo novo documento deve declarar:

- data
- objetivo
- estado atual ou problema
- decisao tomada ou plano
- impacto em API, banco, painel, package e operacao
- validacao esperada
- proximos passos

## Regra para novo chat

Ao iniciar um chat novo:

1. ler a ordem de leitura deste arquivo
2. verificar `git status --short`
3. verificar se o pedido e analise, documentacao, implementacao ou operacao
4. nao assumir que os documentos antigos refletem o ambiente atual sem confirmar
5. se a tarefa envolver backup de pfSense, seguir o plano mestre e a especificacao do modulo de backup

## Regra para encerramento de trilha

Ao encerrar uma trilha relevante:

- atualizar `LEITURA-INICIAL.md`
- atualizar `00-README.md` se houver documento novo
- criar documento de entrega em `docs/NN-...md`, se for uma trilha grande
- atualizar `docs/HISTORICO-E-LINHA-DO-TEMPO.md` se houver aprendizado ou erro a nao repetir
- rodar smokes aplicaveis
- registrar o que foi validado e o que nao foi validado
