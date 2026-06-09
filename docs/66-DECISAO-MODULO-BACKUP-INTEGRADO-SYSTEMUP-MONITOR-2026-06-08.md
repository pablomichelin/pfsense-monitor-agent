# 66. Decisao: backup como modulo integrado do SystemUp Monitor

Data: `2026-06-08`

## Objetivo

Registrar a decisao arquitetural final para o backup do `config.xml`: nao criar um software separado. O backup sera um modulo novo dentro do Monitor-Pfsense e do package pfSense existente `SystemUp Monitor`.

Este documento substitui a ideia anterior de usar repositorios separados para um novo app de backup.

## Decisao

Centralizar tudo no produto atual:

```text
Monitor-Pfsense
  apps/api
  apps/web
  packages/pfsense-package
    SystemUp Monitor
      Configuracao
      Diagnostico
      Backup
```

Repositorio principal:

```text
https://github.com/pablomichelin/pfsense-monitor-agent
```

Package pfSense:

```text
Services > SystemUp Monitor
```

Nova aba no package:

```text
Services > SystemUp Monitor > Backup
```

## Por que esta e a melhor decisao

Esta decisao e melhor do que criar um software novo porque:

- reaproveita o cadastro atual de cliente, site e firewall
- reaproveita `node_uid` e `node_secret`
- reaproveita o heartbeat ja instalado
- reaproveita o package que ja existe nos clientes
- evita outro instalador
- evita outro cadastro
- evita outra credencial
- evita outro caminho no pfSense
- reduz risco operacional no rollout
- facilita atualizar clientes que ja estao rodando o package
- mantem a identidade do produto como `SystemUp Monitor`

Criar um novo app de backup seria mais agressivo e aumentaria complexidade sem ganho tecnico real neste momento.

## O que fica descartado

Descartado:

- criar novo software separado para backup
- criar novo package pfSense separado
- criar novo caminho no menu do pfSense
- manter repositorios separados para o backup
- publicar artefato de backup em repo separado
- duplicar cadastro de firewall

Esses repositorios temporarios podem ser removidos pelo dono do GitHub. O projeto operacional deve voltar a usar o repositorio principal do Monitor-Pfsense.

## Repositorio e release

Fonte unica:

```text
pablomichelin/pfsense-monitor-agent
```

Raw base do package:

```text
https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main
```

Arquivo:

```text
config/package-release.env
```

Deve apontar para:

```env
PACKAGE_RELEASE_REPO_RAW_BASE=https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main
```

O release do package continua sendo feito pelo fluxo existente:

```bash
./scripts/release-pfsense-package.sh
```

ou, para preparar sem push:

```bash
./scripts/release-pfsense-package.sh --no-push
```

## Modelo funcional

No servidor:

```text
Monitor-Pfsense
  Node
    NodeConfigBackup[]
    NodeCommand[]
```

No painel:

```text
Firewall > Backups de configuracao
```

No pfSense:

```text
Services > SystemUp Monitor > Backup
```

## Tela no painel web

No detalhe de cada firewall:

- lista de backups daquele firewall
- status do ultimo backup
- idade do ultimo backup
- tamanho
- SHA256 curto
- botao `Solicitar backup agora`
- status da solicitacao
- download somente para `superadmin`
- auditoria filtrada do node

## Tela no pfSense

Adicionar uma terceira aba ao package atual:

```text
Configuracao | Diagnostico | Backup
```

A aba `Backup` deve conter:

- habilitar/desabilitar backup do `config.xml`
- intervalo em horas
- enviar apenas se mudou
- compactar antes de enviar
- aceitar solicitacao vinda do painel
- ultimo backup local
- ultimo hash curto
- ultimo erro
- proxima execucao estimada
- botao local `Enviar backup agora`
- comandos de diagnostico local

## Botao Solicitar Backup Agora

No painel web, o botao nao deve acessar o firewall diretamente.

Fluxo correto:

```text
Painel pfs-monitor
  POST /api/v1/nodes/:id/config-backups/request
      |
      v
API cria NodeCommand(config_backup_now)
      |
      v
pfSense recebe o comando no proximo heartbeat
      |
      v
agente executa backup-config localmente
      |
      v
pfSense envia o config.xml ao controlador
```

Isso evita:

- abrir porta no cliente
- usar SSH remoto
- depender de VPN para backup
- fazer NAT reverso
- executar comandos livres no firewall

## Rollout recomendado

1. Atualizar o plano e a documentacao para modulo integrado.
2. Corrigir `origin` local para o repo principal.
3. Implementar backend de backup no Monitor-Pfsense.
4. Implementar tela/lista no detalhe do firewall.
5. Implementar aba `Backup` no package `SystemUp Monitor`.
6. Implementar comando pendente `config_backup_now`.
7. Publicar nova versao do package no repo principal.
8. Atualizar um pfSense de homologacao.
9. Validar backup automatico.
10. Validar `Solicitar backup agora`.
11. Ativar gradualmente nos clientes.
12. Revogar senha de app Gmail antiga apos migracao.

## Riscos e cuidados

- Nao ativar backup automaticamente em todos os clientes no primeiro release.
- Comecar com homologacao.
- Garantir que `config.xml` nunca seja gravado em texto puro no banco.
- Garantir criptografia em repouso.
- Garantir auditoria de download.
- Garantir que somente acoes allowlist sejam executadas pelo agente.
- Garantir limite de upload proprio para backup.

## Status

Decisao aceita:

- modulo integrado ao Monitor-Pfsense
- aba `Backup` dentro de `Services > SystemUp Monitor`
- um unico package
- um unico repositorio operacional
