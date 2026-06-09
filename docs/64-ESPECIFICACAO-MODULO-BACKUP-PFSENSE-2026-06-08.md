# 64. Especificacao do modulo de backup pfSense

Data: `2026-06-08`

## Objetivo

Substituir o backup por email do pfSense por um modulo integrado ao Monitor-Pfsense, em que cada firewall envia seu `/conf/config.xml` ao controlador central com autenticacao forte, armazenamento criptografado, retencao e auditoria.

## Estado atual

Hoje nao existe modulo de backup do `config.xml` no software.

Decisao atual:

- o backup sera implementado dentro do Monitor-Pfsense existente
- o package pfSense continua sendo `SystemUp Monitor`
- a GUI local ganha uma nova aba `Backup` em `Services > SystemUp Monitor`
- nao sera criado software, package ou repositorio separado para backup

O que existe:

- package pfSense com agente local
- envio de heartbeat por HMAC
- `node_uid` e `node_secret` por firewall
- painel com cadastro, detalhe do node, auditoria e bootstrap
- scripts de backup/restore do PostgreSQL do controlador

O fluxo antigo por email:

- script Python no pfSense
- senha de app Gmail hardcoded
- anexo `/conf/config.xml`
- agendamento por crontab
- alteracao manual por cliente

Problemas do fluxo antigo:

- segredo compartilhado/exposto
- sem inventario central de backups
- sem auditoria por firewall
- sem retencao controlada no produto
- sem alerta de backup atrasado
- sem verificacao de integridade no painel

## Escopo do MVP

Entra no MVP:

- pfSense envia backup para o controlador
- autenticacao HMAC por node
- armazenamento criptografado em repouso
- metadados no PostgreSQL
- retencao por firewall
- listagem de arquivos no detalhe do firewall usando o cadastro atual de nodes
- download manual auditado para `superadmin`
- botao "Solicitar backup agora" no painel, entregue ao agente pelo heartbeat
- alerta quando backup estiver atrasado

Nao entra no MVP:

- restore automatico no pfSense
- comandos remotos arbitrarios ou shell livre
- servidor acessando diretamente o pfSense por SSH, VPN, NAT ou porta aberta para buscar arquivo
- edicao de config pelo painel
- comparar XML visualmente
- criptografia ponta-a-ponta feita no pfSense
- storage S3 ou externo obrigatorio

## Uso do cadastro atual

Nao criar um novo cadastro de clientes ou firewalls para backup.

A relacao correta e:

```text
Client
  Site
    Node
      NodeConfigBackup[]
```

Cada `Node` ja representa um firewall monitorado e ja possui `node_uid` e credencial HMAC. O backup deve usar essa identidade existente.

No painel:

- o detalhe do firewall mostra a lista de backups daquele `Node`
- a pagina de cliente/site pode futuramente agregar saude de backups
- a pagina global `/backups` pode futuramente filtrar por cliente, site, node e status

## Fluxo alvo

Fluxo automatico/agendado:

```text
pfSense
  /conf/config.xml
  monitor-pfsense-agent.sh backup-config
      |
      | HTTPS + HMAC
      v
POST /api/v1/ingest/config-backup
      |
      | valida node, timestamp, assinatura, tamanho, hash
      v
API backups
      |
      | criptografa arquivo
      v
data/pfsense-config-backups/
      |
      | grava metadados
      v
PostgreSQL
      |
      v
Painel do firewall mostra ultimo backup e historico curto
```

Fluxo "Solicitar backup agora":

```text
Usuario no pfs-monitor
  clica em "Solicitar backup agora"
      |
      v
API cria NodeCommand(config_backup_now, pending)
      |
      v
pfSense envia heartbeat
      |
      v
API responde com comando permitido pendente
      |
      v
agente executa backup-config localmente
      |
      v
pfSense envia config.xml pelo endpoint de backup
      |
      v
API marca comando como succeeded ou failed
```

Decisao:

- o servidor nao "puxa" o arquivo abrindo conexao para o firewall
- o painel apenas solicita a acao
- o pfSense continua sendo quem le e envia o proprio `/conf/config.xml`

## Contrato HTTP do agente

### Endpoint

`POST /api/v1/ingest/config-backup`

### Headers obrigatorios

- `X-Node-Uid`
- `X-Timestamp`
- `X-Signature`
- `X-Config-Sha256`
- `X-Config-Size`
- `X-Backup-Id`

### Headers opcionais

- `X-Agent-Version`
- `X-Pfsense-Version`
- `X-Config-Compression`

### Content-Type

MVP recomendado:

- `application/xml` quando enviar XML puro no corpo HTTPS
- `application/gzip` quando enviar XML compactado

Observacao:

- mesmo que o corpo trafegue puro dentro do TLS, ele deve ser criptografado antes de gravar em disco
- se usar gzip, `X-Config-Sha256` deve ser do XML original, nao do payload compactado

### Assinatura

Mesma regra do heartbeat:

```text
HMAC-SHA256(node_secret, timestamp + "\n" + raw_body)
```

O `raw_body` e exatamente o corpo HTTP recebido.

### Resposta de sucesso

```json
{
  "ok": true,
  "server_time": "2026-06-08T20:00:00.000Z",
  "backup_id": "cfgb_...",
  "stored": true,
  "duplicate": false,
  "sha256": "..."
}
```

### Resposta para duplicado

Se o hash for igual ao ultimo backup valido do mesmo node:

```json
{
  "ok": true,
  "server_time": "2026-06-08T20:00:00.000Z",
  "backup_id": "cfgb_...",
  "stored": false,
  "duplicate": true,
  "sha256": "..."
}
```

Decisao:

- registrar tentativa duplicada como auditoria leve ou atualizar `last_attempt_at`
- nao gravar arquivo duplicado por padrao

## Limites

Recomendacao inicial:

- heartbeat continua em `64 KB`
- backup de config: `5 MB`
- rejeitar `0 bytes`
- rejeitar acima do limite
- rejeitar se `X-Config-Size` nao bater com tamanho real do XML antes de compactar

Se houver clientes com XML maior:

- aumentar limite de backup com decisao operacional
- nunca aumentar limite de heartbeat por causa de backup

## Modelo de dados

Adicionar ao Prisma:

```prisma
enum ConfigBackupStatus {
  stored
  duplicate
  rejected
  failed

  @@map("config_backup_status")
}

model NodeConfigBackup {
  id                 String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  nodeId             String             @map("node_id") @db.Uuid
  commandId          String?            @map("command_id") @db.Uuid
  backupUid          String             @unique @map("backup_uid")
  status             ConfigBackupStatus @default(stored)
  receivedAt         DateTime           @default(now()) @map("received_at") @db.Timestamptz(6)
  sentAt             DateTime?          @map("sent_at") @db.Timestamptz(6)
  configSha256       String             @map("config_sha256")
  payloadSha256      String             @map("payload_sha256")
  sizeBytes          Int                @map("size_bytes")
  payloadSizeBytes   Int                @map("payload_size_bytes")
  compression        String?            @map("compression")
  storagePath        String?            @map("storage_path")
  encryptionVersion  String?            @map("encryption_version")
  agentVersion       String?            @map("agent_version")
  pfsenseVersion     String?            @map("pfsense_version")
  failureReason      String?            @map("failure_reason")
  metadataJson       Json?              @map("metadata_json")
  createdAt          DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  node               Node               @relation(fields: [nodeId], references: [id], onDelete: Cascade)

  @@index([nodeId, receivedAt])
  @@index([nodeId, configSha256])
  @@index([commandId])
  @@map("node_config_backups")
}
```

Adicionar relacao em `Node`:

```prisma
configBackups NodeConfigBackup[]
```

### Comandos permitidos por node

Adicionar uma tabela para solicitacoes controladas. O nome final deve seguir o padrao real do schema, mas o contrato conceitual e:

```prisma
enum NodeCommandType {
  config_backup_now

  @@map("node_command_type")
}

enum NodeCommandStatus {
  pending
  picked_up
  running
  succeeded
  failed
  expired
  cancelled

  @@map("node_command_status")
}

model NodeCommand {
  id                String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  nodeId            String            @map("node_id") @db.Uuid
  type              NodeCommandType
  status            NodeCommandStatus @default(pending)
  requestedByUserId String?           @map("requested_by_user_id") @db.Uuid
  requestedAt       DateTime          @default(now()) @map("requested_at") @db.Timestamptz(6)
  pickedUpAt        DateTime?         @map("picked_up_at") @db.Timestamptz(6)
  completedAt       DateTime?         @map("completed_at") @db.Timestamptz(6)
  expiresAt         DateTime          @map("expires_at") @db.Timestamptz(6)
  resultJson        Json?             @map("result_json")
  errorMessage      String?           @map("error_message")
  createdAt         DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  node              Node              @relation(fields: [nodeId], references: [id], onDelete: Cascade)

  @@index([nodeId, status])
  @@index([expiresAt])
  @@map("node_commands")
}
```

Regras:

- `config_backup_now` e allowlist, nao comando shell livre
- expirar em `10` ou `15` minutos no MVP
- nao criar duas solicitacoes `pending/running` iguais para o mesmo node
- guardar usuario que solicitou
- auditoria obrigatoria para criado, entregue, concluido, falhou, expirou e cancelado

## Armazenamento em disco

Volume local recomendado:

```text
data/pfsense-config-backups/
```

Estrutura:

```text
data/pfsense-config-backups/
  node_uid/
    2026/
      06/
        cfgb_20260608T200000Z_<hashcurto>.xml.gz.enc
```

Regras:

- arquivo sempre criptografado
- permissao restrita
- nunca commitar backups
- nunca salvar XML temporario em caminho persistente sem criptografia
- temporarios devem ser removidos mesmo em erro

## Criptografia em repouso

Variavel nova:

```env
BACKUP_ENCRYPTION_KEY_BASE64=
```

Regras:

- chave separada de `NODE_SECRET_ENCRYPTION_KEY_BASE64`
- AES-256-GCM no MVP
- IV aleatorio por arquivo
- auth tag persistida junto com arquivo ou metadados
- `encryption_version` inicial: `aes-256-gcm:v1`

Formato de arquivo sugerido:

```text
magic header + json metadata curto + ciphertext
```

Alternativa simples:

- salvar `iv.authTag.ciphertext` em binario/base64 no arquivo `.enc`
- guardar metadados completos no banco

## Retencao

Politica inicial:

- manter ultimos `30` backups armazenados por firewall
- nao apagar o backup mais recente
- nao apagar backups com status diferente de `stored` sem auditoria
- rodar retencao apos cada upload aceito

Futuro:

- politica por cliente
- manter diarios/semanais/mensais
- exportar para storage externo

## Backend

### Modulos novos

Criar:

```text
apps/api/src/backups/
  backups.module.ts
  backups.controller.ts
  backups.service.ts
  dto/
```

### Refatoracao recomendada

Extrair autenticacao de node do `IngestService` para:

```text
apps/api/src/common/node-request-auth.service.ts
```

Esse service deve:

- ler headers
- validar timestamp
- localizar node
- buscar credential ativa
- validar HMAC
- atualizar `lastUsedAt` quando aplicavel

O heartbeat e o backup devem usar o mesmo service.

### Endpoints humanos

Listagem por node:

`GET /api/v1/nodes/:id/config-backups`

Download:

`GET /api/v1/nodes/:id/config-backups/:backupId/download`

Solicitar backup agora:

`POST /api/v1/nodes/:id/config-backups/request`

Status da solicitacao:

`GET /api/v1/nodes/:id/config-backups/requests/:commandId`

Permissoes iniciais:

- `readonly`, `operator`: nao baixam
- `admin`: pode ver metadados e solicitar backup agora
- `superadmin`: pode solicitar e baixar

Se a operacao exigir postura mais restritiva em producao, limitar "Solicitar backup agora" a `superadmin` no primeiro rollout.

Auditoria:

- `backup.config.ingest`
- `backup.config.duplicate`
- `backup.config.download`
- `backup.config.request`
- `backup.config.request_picked_up`
- `backup.config.request_succeeded`
- `backup.config.request_failed`
- `backup.config.request_expired`
- `backup.config.retention_delete`
- `backup.config.failure`

### Contrato de comando pelo heartbeat

O heartbeat pode continuar sendo o canal de controle.

Resposta com comando pendente:

```json
{
  "ok": true,
  "server_time": "2026-06-08T20:00:00.000Z",
  "commands": [
    {
      "id": "cmd_...",
      "type": "config_backup_now",
      "expires_at": "2026-06-08T20:15:00.000Z"
    }
  ]
}
```

O agente deve:

1. ignorar tipos desconhecidos
2. marcar localmente que recebeu o comando
3. executar somente a acao permitida `backup-config`
4. enviar o backup com `X-Command-Id`
5. informar falha resumida se nao conseguir ler/enviar o arquivo

Endpoint opcional para resultado sem arquivo, por exemplo quando `/conf/config.xml` nao existe:

`POST /api/v1/ingest/command-result`

Esse endpoint tambem deve usar HMAC por node e nao aceitar comando livre.

## Agente pfSense

### Comandos novos

Adicionar ao `monitor-pfsense-agent.sh`:

```sh
backup-config
backup-status
backup-force
```

### Config runtime

Novas variaveis em `/usr/local/etc/monitor-pfsense-agent.conf`:

```sh
MONITOR_AGENT_CONFIG_BACKUP_ENABLED="1"
MONITOR_AGENT_CONFIG_BACKUP_INTERVAL_HOURS="24"
MONITOR_AGENT_CONFIG_BACKUP_ON_CHANGE="1"
MONITOR_AGENT_CONFIG_BACKUP_COMPRESS="1"
MONITOR_AGENT_CONFIG_BACKUP_STATE_DIR="/var/db/monitor-pfsense-agent"
MONITOR_AGENT_PFSENSE_CONFIG_XML="/conf/config.xml"
MONITOR_AGENT_CONFIG_BACKUP_ACCEPT_REMOTE_REQUESTS="1"
```

### Estado local

Arquivos:

```text
/var/db/monitor-pfsense-agent/last-config-backup.sha256
/var/db/monitor-pfsense-agent/last-config-backup-at
/var/db/monitor-pfsense-agent/last-config-backup-error
```

### Comportamento

`backup-config` deve:

1. validar variaveis obrigatorias
2. validar existencia de `/conf/config.xml`
3. calcular SHA256 do XML original
4. se `ON_CHANGE=1` e hash igual ao ultimo enviado, nao reenviar
5. compactar se configurado
6. assinar payload
7. enviar para `/api/v1/ingest/config-backup`
8. atualizar estado local apenas se API confirmar sucesso
9. logar somente metadados: tamanho, hash curto, status HTTP, backup_id

Quando executado por solicitacao do painel:

- receber ou ler `command_id`
- enviar `X-Command-Id`
- ignorar deduplicacao local se a solicitacao for explicitamente "force", quando essa opcao existir no futuro
- no MVP, manter deduplicacao por hash e marcar duplicado sem criar novo arquivo

### Agendamento

Nao usar crontab manual.

Usar o loop atual do agente:

- heartbeat continua a cada 30s
- resposta do heartbeat pode trazer comandos permitidos pendentes
- a cada ciclo, verificar se backup esta habilitado e se venceu intervalo
- se houver `config_backup_now`, executar `backup-config`
- se venceu, executar `backup-config`
- garantir lock para nao rodar dois backups simultaneos

Lock sugerido:

```text
/var/run/monitor-pfsense-agent-backup.lock
```

## Package pfSense

### GUI local

Adicionar uma nova aba no package existente:

```text
Services > SystemUp Monitor > Backup
```

A ordem desejada das abas:

```text
Configuracao | Diagnostico | Backup
```

Adicionar campos na aba `Backup`:

- Enable config backup
- Backup interval hours
- Backup only on change
- Compress backup before upload
- Accept backup requests from panel

Diagnostico local:

- ultimo backup local
- ultimo hash curto
- ultimo erro
- proxima execucao estimada
- comando manual `backup-config`

### Instalador

Adicionar flags:

```sh
--config-backup-enabled yes|no
--config-backup-interval-hours 24
--config-backup-on-change yes|no
```

Padrao recomendado:

- backup habilitado: `yes`
- intervalo: `24`
- apenas se mudou: `yes`
- compressao: `yes`

## Painel web

### Detalhe do firewall

Adicionar bloco compacto:

- ultimo backup
- idade
- tamanho
- status
- SHA256 curto
- quantidade armazenada
- lista de arquivos por firewall
- botao "Solicitar backup agora"
- status da ultima solicitacao
- link para ver auditoria
- botao download se `superadmin`

### Inventario

Nao adicionar coluna no primeiro MVP, para nao poluir.

Fase posterior:

- filtro "backup atrasado"
- resumo no dashboard

Detalhes de frontend, permissoes visuais e deploy integrado estao em:

- `docs/65-FRONTEND-E-DEPLOY-BACKUP-PFSENSE-2026-06-08.md`
- `docs/66-DECISAO-MODULO-BACKUP-INTEGRADO-SYSTEMUP-MONITOR-2026-06-08.md`

## Alertas

Adicionar tipos:

- `config_backup_missing`
- `config_backup_failed`

Regra inicial:

- backup atrasado se nao houver backup valido em `36h`
- em maintenance mode, alerta pode ficar em warning ou silenciado conforme decisao futura

## Seguranca

Obrigatorio:

- HMAC por node
- HTTPS
- timestamp window
- limite de tamanho
- criptografia em repouso
- RBAC para download
- auditoria de download
- nao logar conteudo
- nao retornar XML em erros
- nao permitir download sem sessao humana

Recomendado:

- rate limit por node e IP na rota de backup
- alerta para falhas repetidas de autenticacao
- chave de backup separada e guardada fora do repositorio

## Validacao e smokes

Criar scripts:

```text
scripts/smoke-config-backup-api.sh
scripts/smoke-config-backup-retention.sh
scripts/smoke-config-backup-download.sh
scripts/smoke-config-backup-request-now.sh
```

Validar:

- upload com assinatura valida
- upload com assinatura invalida falha
- timestamp fora da janela falha
- payload acima do limite falha
- arquivo salvo nao contem XML legivel
- metadados aparecem na API
- download exige `superadmin`
- auditoria registra download
- duplicado nao cria novo arquivo
- retencao apaga backups antigos
- solicitar backup agora cria comando pendente
- agente simulado pega comando pelo heartbeat
- comando pendente expira corretamente
- nao e possivel criar comando arbitrario

No package:

- `sh -n` nos scripts
- `php -l` nos arquivos PHP
- teste com `MONITOR_AGENT_PFSENSE_CONFIG_XML` apontando para XML temporario
- release com SHA256

## Plano de rollout

1. Implementar backend e testar com `curl` local
2. Implementar painel minimo de metadados
3. Implementar lista por firewall e download auditado
4. Implementar comando pendente `config_backup_now`
5. Implementar agente `backup-config` e leitura de comando pelo heartbeat
6. Publicar package novo no repositorio principal `pablomichelin/pfsense-monitor-agent`
7. Instalar em um pfSense de homologacao
8. Confirmar primeiro backup automatico
9. Confirmar botao "Solicitar backup agora"
10. Ativar alerta de atraso
11. Migrar clientes do email para package
12. Revogar credenciais antigas de email

## Checklist antes de codar

- `git status --short` revisado
- backup PostgreSQL feito
- restore PostgreSQL validado
- origem publica alinhada
- limite de upload definido
- chave `BACKUP_ENCRYPTION_KEY_BASE64` criada fora do repositorio
- decisao de permissao confirmada: download apenas `superadmin`
- plano de rollback definido

## Checklist de pronto

- migration aplicada
- upload assinado funcionando
- arquivo criptografado em disco
- metadados no painel
- download auditado
- retencao funcionando
- botao "Solicitar backup agora" funcionando por comando pendente
- alerta de atraso funcionando ou documentado como pendente
- package pfSense envia backup por uma linha de instalacao
- documentacao atualizada
