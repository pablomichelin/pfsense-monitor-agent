# 65. Frontend, package pfSense e deploy do modulo integrado

Data: `2026-06-08`

## Objetivo

Definir como o backup do `config.xml` aparece no painel Monitor-Pfsense, como entra no package pfSense existente `SystemUp Monitor` e como sera publicado sem criar software ou repositorio separado.

Este documento complementa:

- `docs/63-PLANO-MESTRE-ORGANIZACAO-QUALIDADE-BACKUP-PFSENSE-2026-06-08.md`
- `docs/64-ESPECIFICACAO-MODULO-BACKUP-PFSENSE-2026-06-08.md`
- `docs/66-DECISAO-MODULO-BACKUP-INTEGRADO-SYSTEMUP-MONITOR-2026-06-08.md`

## Decisao consolidada

Nao criar app novo.

Nao criar package separado.

Nao criar caminho novo no pfSense.

O backup sera um modulo dentro do produto atual:

```text
Monitor-Pfsense
  apps/api
  apps/web
  packages/pfsense-package
```

No pfSense:

```text
Services > SystemUp Monitor
  Configuracao
  Diagnostico
  Backup
```

## Execucoes ja feitas nesta trilha

Backup do PostgreSQL:

- arquivo: `backups/postgres/postgres-monitor_pfsense-20260609-014628Z.dump`
- checksum: `backups/postgres/postgres-monitor_pfsense-20260609-014628Z.dump.sha256`
- restore temporario validado com sucesso
- tabelas restauradas: `13`
- amostra validada: `clients=47`, `sites=44`, `nodes=53`, `users=3`, `alerts=152`, `audit_logs=663`

Contrato publico validado:

```bash
BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/verify-origin-contract.sh
```

Resultado:

- `/healthz` respondeu `200`
- login e asset CSS versionado passaram
- limite de payload acima de `64 KB` retornou `413`
- SSE autenticado funcionou com `connected=1`, `keepalive=2`, `dashboard.refresh=61`

Mockups:

- `docs/mockups/backup-pfsense-ui-mockup.html`
- `docs/mockups/pfs-monitor-backup-mockup.png`
- `docs/mockups/pfsense-package-backup-mockup.png`

## Repositorio e release

Repositorio operacional:

```text
https://github.com/pablomichelin/pfsense-monitor-agent
```

Raw base:

```text
https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main
```

Arquivo de release:

```text
config/package-release.env
```

Valor esperado:

```env
PACKAGE_RELEASE_REPO_RAW_BASE=https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main
```

O package continua sendo publicado pelo fluxo existente:

```bash
./scripts/release-pfsense-package.sh
```

Nao usar mais:

- repositorios temporarios criados para a ideia de app separado
- script separado de publicacao de artefato

## Frontend do Monitor-Pfsense

O MVP deve aparecer primeiro no detalhe do firewall, nao em uma tela global separada.

Cadastro usado:

```text
Cliente -> Site -> Firewall/Node -> Backups
```

Cada firewall tera sua propria lista de arquivos.

Local esperado:

```text
apps/web/app/nodes/[id]/page.tsx
```

Bloco:

```text
Backups de configuracao
```

Conteudo:

- status atual: `Em dia`, `Atrasado`, `Falhou` ou `Nunca enviado`
- ultimo backup recebido
- idade do ultimo backup
- tamanho
- SHA256 curto
- quantidade armazenada
- status de retencao
- link para auditoria filtrada do node
- lista dos backups do firewall
- botao `Solicitar backup agora`
- estado da solicitacao atual

Permissoes:

- `superadmin`: ve metadados, solicita backup e baixa arquivo
- `admin`: ve metadados e solicita backup
- `operator`: ve metadados, sem download no MVP
- `readonly`: ve metadados, sem download no MVP

Se a operacao pedir postura mais restritiva, o primeiro rollout pode limitar `Solicitar backup agora` a `superadmin`.

## Gerenciamento por firewall

No MVP, gerenciar significa:

- listar arquivos por firewall
- baixar backup quando permitido
- mostrar duplicados sem criar arquivo novo
- indicar origem: agenda automatica ou solicitacao manual
- auditar download
- aplicar retencao automatica

Fica para fase posterior:

- exclusao manual auditada
- fixar backup para nao cair na retencao
- adicionar observacao
- comparar dois backups
- pagina global `/backups`
- restore assistido

## Solicitar backup agora

O botao no painel nao deve puxar arquivo diretamente do firewall.

Fluxo correto:

```text
Painel
  Solicitar backup agora
      |
      v
API cria NodeCommand(config_backup_now)
      |
      v
pfSense recebe no proximo heartbeat
      |
      v
agente executa backup-config
      |
      v
pfSense envia o arquivo ao controlador
```

Estados no painel:

- `Solicitar backup agora`
- `Aguardando firewall`
- `Executando no pfSense`
- `Backup recebido`
- `Firewall offline`
- `Falhou`
- `Expirou`

Regras:

- comando expira em `10` ou `15` minutos
- somente comando allowlist, nada de shell livre
- tudo auditado com usuario solicitante
- se o firewall estiver offline, a solicitacao fica pendente ate expirar
- se ja houver solicitacao pendente, o botao mostra o estado atual
- o backup recebido por solicitacao aparece na mesma lista de arquivos do firewall

## Package pfSense

O package atual deve ser evoluido, sem criar package novo.

Local:

```text
packages/pfsense-package/
```

Tela:

```text
Services > SystemUp Monitor
```

Abas:

```text
Configuracao | Diagnostico | Backup
```

Nova aba `Backup`:

- habilitar/desabilitar backup
- intervalo em horas
- enviar somente se o hash mudou
- compactar antes do envio
- aceitar solicitacoes do painel
- ultimo backup local
- ultimo resultado
- ultimo hash curto
- proxima execucao estimada
- botao local `Enviar backup agora`
- comandos de diagnostico

Manter as abas existentes:

- `Configuracao`: identidade do node, URL do controlador, servicos monitorados
- `Diagnostico`: estado do agente, runtime paths, comandos operacionais

## Endpoints para o frontend

Listagem por node:

```text
GET /api/v1/nodes/:id/config-backups
```

Download auditado:

```text
GET /api/v1/nodes/:id/config-backups/:backupId/download
```

Solicitar backup agora:

```text
POST /api/v1/nodes/:id/config-backups/request
```

Consultar solicitacao:

```text
GET /api/v1/nodes/:id/config-backups/requests/:commandId
```

## Deploy do app

O deploy do sistema web/API continua sendo feito no servidor `192.168.100.221`, com `docker compose` e publicacao por ISPConfig/Cloudflare no dominio:

```text
https://pfs-monitor.systemup.inf.br
```

Fluxo recomendado:

1. desenvolver no repositorio principal
2. fazer backup do PostgreSQL antes de migration
3. aplicar migration Prisma
4. rebuild/redeploy dos containers necessarios
5. rodar smokes
6. publicar nova versao do package no mesmo repositorio
7. atualizar um pfSense de homologacao
8. validar backup automatico e solicitacao pelo painel

Smokes minimos:

```bash
BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/verify-origin-contract.sh
```

Quando existir o modulo de backup:

```bash
./scripts/smoke-config-backup-api.sh
./scripts/smoke-config-backup-download.sh
./scripts/smoke-config-backup-retention.sh
./scripts/smoke-config-backup-request-now.sh
```

## Regras de seguranca

- nunca salvar `config.xml` bruto no banco
- nunca logar conteudo do XML
- criptografar arquivo em repouso
- download somente com sessao humana autorizada
- download sempre auditado
- nao executar comando shell livre no pfSense
- nao abrir porta no cliente para buscar backup
- nao depender de SSH, VPN ou NAT para backup
- manter limite de upload proprio para backup
- revogar senha de app Gmail antiga depois da migracao

## Proximo bloco de implementacao

Ordem recomendada:

1. corrigir remotes para o repositorio principal.
2. implementar backend do backup com lista por `Node`.
3. implementar upload criptografado e download auditado.
4. implementar comando pendente `config_backup_now`.
5. implementar bloco de frontend no detalhe do firewall.
6. implementar aba `Backup` no package `SystemUp Monitor`.
7. implementar leitura do comando pelo heartbeat no package.
8. publicar package novo no repositorio principal.
9. homologar em um pfSense real.
