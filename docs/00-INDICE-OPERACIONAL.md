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
8. `docs/DIRETRIZES-E-FUNCIONAMENTO.md`
9. `docs/HISTORICO-E-LINHA-DO-TEMPO.md`, quando for refatorar ou reabrir tema ja mexido

## Estado verdadeiro em 2026-06-08

Observado no servidor conectado:

- stack `docker compose` esta rodando com `api`, `web`, `db` e `nginx` saudaveis
- dominio publico `https://pfs-monitor.systemup.inf.br/healthz` responde `200`
- package pfSense publicado no fluxo atual: `0.2.27`
- `config/package-release.env` aponta para `https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main` e SHA256 do package `0.2.27`
- agente/package atual envia heartbeat e test-connection por HMAC
- nao existe ainda modulo de backup de `config.xml` no controlador
- nao existe ainda endpoint `config-backup`
- nao existe ainda tela de backups por firewall
- decisao atual: backup sera modulo integrado ao Monitor-Pfsense e nova aba `Backup` dentro de `Services > SystemUp Monitor`, sem software separado
- worktree esta com muitas alteracoes nao commitadas e arquivos novos
- documentacao esta funcional, mas espalhada entre raiz e `docs/`
- ha desalinhamento documental/operacional sobre origem interna: documentos antigos citam `192.168.100.244:8088`; o ambiente informado e observado usa `192.168.100.221`, com publicacao tambem em `192.168.100.221:3031`
- o limite de payload atual do gateway/API e `64 KB`, suficiente para heartbeat, insuficiente para `config.xml` real de muitos pfSense

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

Arquivos novos criados em `2026-06-08`:

- `docs/63-PLANO-MESTRE-ORGANIZACAO-QUALIDADE-BACKUP-PFSENSE-2026-06-08.md`
- `docs/64-ESPECIFICACAO-MODULO-BACKUP-PFSENSE-2026-06-08.md`
- `docs/65-FRONTEND-E-DEPLOY-BACKUP-PFSENSE-2026-06-08.md`
- `docs/66-DECISAO-MODULO-BACKUP-INTEGRADO-SYSTEMUP-MONITOR-2026-06-08.md`

Eles devem orientar a organizacao da casa e a criacao do modulo de backup do pfSense.

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
