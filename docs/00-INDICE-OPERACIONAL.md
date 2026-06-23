# Indice operacional do projeto

Data de referencia: `2026-06-08`

Este arquivo e o mapa curto para retomar o Monitor-Pfsense em qualquer novo chat, nova manutencao ou nova trilha de desenvolvimento.

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

## Estado verdadeiro em 2026-06-08

Observado no servidor conectado:

- stack `docker compose` esta rodando com `api`, `web`, `db` e `nginx` saudaveis
- dominio publico (externo): `https://pfs-monitor.systemup.inf.br/healthz` responde `200`
- origem interna (LAN): `http://192.168.100.221:3031`
- package pfSense publicado no fluxo atual: `0.3.6`
- `config/package-release.env` aponta para `https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main` e SHA256 do package `0.3.2`
- agente/package atual envia heartbeat e test-connection por HMAC
- nao existe ainda modulo de backup de `config.xml` no controlador
- nao existe ainda endpoint `config-backup`
- nao existe ainda tela de backups por firewall
- decisao atual: backup sera modulo integrado ao Monitor-Pfsense e nova aba `Backup` dentro de `Services > SystemUp Monitor`, sem software separado
- worktree esta com muitas alteracoes nao commitadas e arquivos novos
- documentacao esta funcional, mas espalhada entre raiz e `docs/`
- origem interna canonica no repositorio: `http://192.168.100.221:3031`
- URL publica canonica: `https://pfs-monitor.systemup.inf.br`
- diretorio canonico no host: `/Dados/Monitor-Pfsense` (migrado de `/opt/Monitor-Pfsense` em 2026-06-23; host historico `192.168.100.244`)
- limite heartbeat: `64 KB`; rota de backup preparada para `5 MB` em `infra/nginx/default.conf` e `infra/ispconfig/nginx.monitor-pfsense.conf`
- volume de backups de pfSense preparado: `data/pfsense-config-backups/` montado na API via `compose.yaml`
- Fase B parcial: falta aplicar snippet ISPConfig no host, criar chave `BACKUP_ENCRYPTION_KEY_BASE64` e medir `config.xml` em homolog

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

#### Trilha RBAC (**encerrada** 2026-06-09)

Plano mestre na raiz:

- `22-plano-mestre-rbac-usuarios-permissoes-escopo-2026-06-09.md`
- `23-matriz-permissoes-e-escopo-rbac-2026-06-09.md`

Trilhas operacionais em `docs/`:

- `docs/68-DIAGNOSTICO-RBAC-USUARIOS-PERMISSOES-2026-06-09.md` — baseline
- `docs/69` a `docs/74` — fases A a F
- `docs/75-CHECKLIST-TESTES-RBAC-ESCOPO-2026-06-09.md`
- `docs/76-ENCERRAMENTO-TRILHA-RBAC-2026-06-09.md` — **encerramento formal**

Versoes atuais: API `0.3.1`, painel `1.1.1`, package pfSense `0.3.6`. **Roadmap UX plano 24 encerrado** — encerramento formal: `docs/88-ENCERRAMENTO-ROADMAP-UX-FASE0-FASE8-2026-06-09.md`; entrega Fase 8: `docs/87-ENTREGA-FRONTEND-FASE8-DESIGN-SYSTEM-PAGES-RESTANTES-2026-06-09.md`. Entrega Fase 7 auditoria filtros: `docs/86-ENTREGA-FRONTEND-FASE7-AUDITORIA-FILTROS-AMIGAVEIS-2026-06-09.md`. Entrega Fase 6 conta separada: `docs/85-ENTREGA-FRONTEND-FASE6-CONTA-SEPARADA-POLIMENTO-PTBR-2026-06-09.md`. Entrega Fase 5 backups frota: `docs/84-ENTREGA-FRONTEND-FASE5-BACKUPS-FROTA-MENU-2026-06-09.md`. Entrega Fase 4 detalhe abas: `docs/83-ENTREGA-FRONTEND-FASE4-DETALHE-FIREWALL-ABAS-2026-06-09.md`. Entrega Fase 3 inventario: `docs/82-ENTREGA-FRONTEND-FASE3-FIREWALLS-INVENTARIO-2026-06-09.md`. Entrega Fase 2 dashboard: `docs/81-ENTREGA-FRONTEND-FASE2-DASHBOARD-ENXUTO-2026-06-09.md`. Entrega Fase 0+1 layout: `docs/80-ENTREGA-FRONTEND-FASE0-FASE1-LAYOUT-2026-06-09.md`. Entrega pos-RBAC: `docs/77-ENTREGA-POS-RBAC-UX-LAYOUT-2026-06-09.md`. Versionamento: `.cursor/rules/versioning.mdc`. Nao reabrir trilha RBAC sem decisao explicita.

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

#### Trilha package pfSense 0.3.6+ (**ativa** — 2026-06-23)

Plano mestre de melhorias pendentes (merge `service`, ISPConfig/502, backoff backup, gateways, upgrade OS, cache XML, desinstalacao):

- [`docs/95-ENTREGA-INFRA-BACKUP-LIMIT-2026-06-23.md`](95-ENTREGA-INFRA-BACKUP-LIMIT-2026-06-23.md) — **entrega Opção B Fase 0** (limite backup ISPConfig/compose, testes HTTPS)
- [`docs/98-ENTREGA-PACKAGE-0.3.8.md`](98-ENTREGA-PACKAGE-0.3.8.md) — **entrega Opção D + Fase 3** (`pfsense_upgrade` semi-manual, `node_secret` runtime, guia package)
- [`docs/97-SPIKE-PFSENSE-UPGRADE-CE.md`](97-SPIKE-PFSENSE-UPGRADE-CE.md) — spike upgrade OS CE (procedimentos lab)
- [`docs/pfsense-package/00-GUIA-OPERACAO-PACKAGE.md`](pfsense-package/00-GUIA-OPERACAO-PACKAGE.md) — guia operacional unificado do package
- [`docs/95-RUNBOOK-ISPConfig-253-BACKUP-LIMIT.md`](95-RUNBOOK-ISPConfig-253-BACKUP-LIMIT.md) — runbook operador SSH 253 (pendente acesso)
- [`docs/96-ENTREGA-PACKAGE-0.3.7.md`](96-ENTREGA-PACKAGE-0.3.7.md) — entrega Opção C P1
- [`docs/95-ENTREGA-PACKAGE-0.3.6.md`](95-ENTREGA-PACKAGE-0.3.6.md) — entrega Opção A P0
- [`docs/94-PLANO-MELHORIAS-PACKAGE-0.3.6.md`](94-PLANO-MELHORIAS-PACKAGE-0.3.6.md) — **plano executavel autossuficiente**
- Contexto correção parcial 0.3.5: [`docs/92-ENTREGA-CORRECAO-WRITE-CONFIG-SEGURO-2026-06-23.md`](92-ENTREGA-CORRECAO-WRITE-CONFIG-SEGURO-2026-06-23.md)
- Upgrade OS (stub + spike CE): [`docs/91-PLANO-ENTREGA-PFSENSE-OS-UPGRADE.md`](91-PLANO-ENTREGA-PFSENSE-OS-UPGRADE.md)

Package publicado no fluxo atual: `0.3.8`; pendente lab: flags upgrade CE nao assistido, piloto gateways/VPN.

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
