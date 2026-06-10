# 64. Especificacao do modulo de backup pfSense

Data: `2026-06-08`
Revisao: `2026-06-08` (pos-analise tecnica)

## Objetivo

Substituir o backup por email do pfSense por um modulo integrado ao Monitor-Pfsense, em que cada firewall envia seu `/conf/config.xml` ao controlador central com autenticacao forte, armazenamento criptografado, retencao e auditoria.

## Escopo do MVP

Entra:

- upload assinado por HMAC
- armazenamento criptografado em repouso
- metadados no PostgreSQL
- retencao por firewall (contagem + teto de disco)
- listagem no detalhe do node
- download auditado para `superadmin`
- solicitacao `config_backup_now` via heartbeat
- status visual calculado por idade do ultimo backup (`36h` = atrasado)

Nao entra:

- alertas `AlertType` (Fase F)
- restore automatico
- `backup-force` no agente
- criptografia ponta-a-ponta no pfSense
- pagina global `/backups`

## Uso do cadastro atual

```text
Client -> Site -> Node -> NodeConfigBackup[]
                      -> NodeCommand[]
```

Cada `Node` representa um firewall independente. Em HA/CARP, cada peer e um `Node` separado com backup proprio; nao compartilhar backup entre nodes distintos.

## Fluxo automatico

```text
pfSense -> backup-config -> POST /api/v1/ingest/config-backup
  -> valida HMAC, tamanho, hash
  -> criptografa -> data/pfsense-config-backups/
  -> metadados PostgreSQL
  -> retencao
```

## Fluxo "Solicitar backup agora"

```text
Painel POST /nodes/:id/config-backups/request
  -> NodeCommand(pending)
  -> heartbeat responde commands[]
  -> agente POST /ingest/command-ack (picked_up)
  -> agente executa backup-config
  -> agente POST /ingest/config-backup com X-Command-Id
  -> API marca succeeded (mesmo se duplicate=true)
```

Regra critica de UX:

- quando `X-Command-Id` estiver presente, o comando **sempre** termina em `succeeded` ou `failed`, nunca fica pendente por deduplicacao
- se o hash for igual ao ultimo backup, a API retorna `duplicate: true` mas marca o comando como `succeeded` com `result_json.duplicate=true`
- o operador ve "Backup recebido" com indicacao de que o conteudo nao mudou

## Maquina de estados do NodeCommand

```text
pending -> picked_up -> running -> succeeded
                               -> failed
pending -> expired (sem heartbeat dentro da janela)
pending -> cancelled (usuario superadmin/admin cancela; pos-MVP)
```

Transicoes e responsaveis:

| De | Para | Quem dispara | Endpoint |
|----|------|--------------|----------|
| - | pending | painel | `POST .../config-backups/request` |
| pending | picked_up | agente | `POST /api/v1/ingest/command-ack` |
| picked_up | running | agente | `POST /api/v1/ingest/command-ack` (opcional) ou implicito ao iniciar upload |
| running | succeeded | API | apos `config-backup` OK ou duplicate com `X-Command-Id` |
| running/picked_up | failed | agente | `POST /api/v1/ingest/command-result` |
| pending | expired | API (job) | expiracao automatica |

Regras:

- expiracao: `15` minutos no MVP
- no maximo um comando `pending/picked_up/running` do tipo `config_backup_now` por node
- `command-ack` e `command-result` sao **obrigatorios** para falhas antes do upload
- se upload OK mas atualizacao do comando falhar, a API deve reconciliar no proximo heartbeat

## Contrato HTTP - upload de backup

### Endpoint

`POST /api/v1/ingest/config-backup`

### Headers obrigatorios

- `X-Node-Uid`
- `X-Timestamp`
- `X-Signature`
- `X-Config-Sha256` — SHA256 do XML **original** (antes de gzip)
- `X-Config-Size` — tamanho em bytes do XML original
- `X-Backup-Id` — UUID v4 gerado pelo **agente** por tentativa de upload

### Headers opcionais

- `X-Command-Id` — UUID do `NodeCommand` quando disparado por solicitacao manual
- `X-Agent-Version`
- `X-Pfsense-Version`
- `X-Config-Compression` — `gzip` ou vazio

### X-Backup-Id (definicao fechada)

- gerado pelo agente antes de cada `POST`
- formato: UUID v4 (`cfgb_attempt_<uuid>` internamente; header envia o UUID puro)
- serve para idempotencia de rede: se a API receber o mesmo `X-Backup-Id` + mesmo hash dentro de `24h`, retorna a mesma resposta de sucesso sem gravar arquivo novo
- apos sucesso, o servidor persiste `backup_uid` derivado: `cfgb_<receivedAt>_<hash8>` (identidade do artefato armazenado)
- `X-Backup-Id` e identidade da **tentativa**; `backup_uid` e identidade do **artefato**

### Content-Type

- `application/xml` — corpo e XML puro
- `application/gzip` — corpo e XML compactado; `X-Config-Sha256` e `X-Config-Size` referem-se ao XML original

### Assinatura

```text
HMAC-SHA256(node_secret, timestamp + "\n" + raw_body)
```

### Resposta de sucesso

```json
{
  "ok": true,
  "server_time": "2026-06-08T20:00:00.000Z",
  "backup_id": "cfgb_20260608T200000Z_a1b2c3d4",
  "stored": true,
  "duplicate": false,
  "sha256": "..."
}
```

### Resposta duplicado

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

Se `X-Command-Id` presente: comando marcado `succeeded` com `result_json: { duplicate: true, sha256 }`.

## Contrato HTTP - command-ack

`POST /api/v1/ingest/command-ack`

Headers HMAC iguais ao heartbeat. Corpo:

```json
{
  "command_id": "uuid",
  "status": "picked_up"
}
```

Status aceitos: `picked_up`, `running`.

## Contrato HTTP - command-result

`POST /api/v1/ingest/command-result`

Obrigatorio quando o agente nao consegue enviar o arquivo.

```json
{
  "command_id": "uuid",
  "status": "failed",
  "error_message": "config.xml not found"
}
```

`error_message` truncado a `500` caracteres; nunca incluir conteudo do XML.

## Contrato heartbeat (extensao)

Resposta quando houver comando pendente:

```json
{
  "ok": true,
  "server_time": "...",
  "node_status": "online",
  "commands": [
    {
      "id": "uuid",
      "type": "config_backup_now",
      "expires_at": "2026-06-08T20:15:00.000Z"
    }
  ]
}
```

O agente deve ignorar tipos desconhecidos.

## Limites

| Rota | Limite | Onde configurar |
|------|--------|-----------------|
| heartbeat | 64 KB | API `appConfig.heartbeat.maxPayloadBytes` |
| config-backup | 5 MB (default) | `CONFIG_BACKUP_MAX_BYTES` + nginx por rota |

Rejeitar: `0 bytes`, acima do limite, `X-Config-Size` divergente do XML original.

Antes do rollout: medir `/conf/config.xml` em homologacao. Se exceder `5 MB`, ajustar `CONFIG_BACKUP_MAX_BYTES` e nginx.

Variaveis novas sugeridas em `app-config.ts`:

```env
CONFIG_BACKUP_MAX_BYTES=5242880
CONFIG_BACKUP_RETENTION_COUNT=30
CONFIG_BACKUP_RETENTION_MAX_BYTES_PER_NODE=262144000
BACKUP_ENCRYPTION_KEY_BASE64=
BACKUP_STORAGE_DIR=/app/data/pfsense-config-backups
```

## Modelo de dados

```prisma
enum ConfigBackupStatus {
  stored
  duplicate
  rejected
  failed
  @@map("config_backup_status")
}

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

model NodeConfigBackup {
  id                 String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  nodeId             String             @map("node_id") @db.Uuid
  commandId          String?            @map("command_id") @db.Uuid
  backupUid          String             @unique @map("backup_uid")
  attemptId          String?            @map("attempt_id")
  status             ConfigBackupStatus @default(stored)
  source             String             @default("scheduled") @map("source")
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
  command            NodeCommand?       @relation(fields: [commandId], references: [id], onDelete: SetNull)

  @@index([nodeId, receivedAt])
  @@index([nodeId, configSha256])
  @@index([commandId])
  @@index([attemptId])
  @@map("node_config_backups")
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
  configBackups     NodeConfigBackup[]

  @@index([nodeId, status])
  @@index([expiresAt])
  @@map("node_commands")
}
```

Campo `source`: `scheduled` | `manual_request` | `diagnostic` (botao local no pfSense).

## Armazenamento em disco

```text
data/pfsense-config-backups/<node_uid>/<ano>/<mes>/cfgb_<timestamp>_<hash8>.enc
```

Volume Docker: `./data/pfsense-config-backups:/app/data/pfsense-config-backups`

Temporarios em `/tmp` durante ingest; removidos mesmo em erro.

## Criptografia em repouso

- chave: `BACKUP_ENCRYPTION_KEY_BASE64` (32 bytes em base64)
- algoritmo: AES-256-GCM, `encryption_version: aes-256-gcm:v1`
- IV aleatorio por arquivo; auth tag junto ao ciphertext
- rotacao pos-MVP: manter mapa `encryption_version -> chave`; downloads usam versao do metadado

## Retencao

- ultimos `30` backups `stored` por node
- teto de `250 MB` por node
- nunca apagar o backup mais recente `stored`
- rodar apos cada upload aceito

## Backend

### Modulo

```text
apps/api/src/backups/
  backups.module.ts
  backups.controller.ts
  backups-ingest.service.ts
  backups-storage.service.ts
  backups-retention.service.ts
  backups-download.service.ts
  backups-command.service.ts
  dto/
```

Separar responsabilidades; nao misturar upload, criptografia, retencao e auditoria no controller.

### Refatoracao

Extrair de `IngestService` para `common/node-request-auth.service.ts`.

### Endpoints humanos

| Metodo | Rota | Papel minimo |
|--------|------|--------------|
| GET | `/api/v1/nodes/:id/config-backups` | readonly |
| GET | `/api/v1/nodes/:id/config-backups/:backupId/download` | superadmin |
| POST | `/api/v1/nodes/:id/config-backups/request` | admin |
| GET | `/api/v1/nodes/:id/config-backups/requests/:commandId` | readonly |

### Auditoria

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

## Agente pfSense (MVP)

Comandos:

- `backup-config` — envia backup
- `backup-status` — mostra ultimo hash, horario, erro

Fora do MVP: `backup-force` (usar solicitacao manual + deduplicacao tratada no servidor).

### Config

```sh
MONITOR_AGENT_CONFIG_BACKUP_ENABLED="0"
MONITOR_AGENT_CONFIG_BACKUP_INTERVAL_HOURS="24"
MONITOR_AGENT_CONFIG_BACKUP_ON_CHANGE="1"
MONITOR_AGENT_CONFIG_BACKUP_COMPRESS="1"
MONITOR_AGENT_CONFIG_BACKUP_STATE_DIR="/var/db/monitor-pfsense-agent"
MONITOR_AGENT_PFSENSE_CONFIG_XML="/conf/config.xml"
MONITOR_AGENT_CONFIG_BACKUP_ACCEPT_REMOTE_REQUESTS="1"
```

Padrao `ENABLED="0"` no instalador de producao ate homologacao confirmar.

### Estado local

```text
/var/db/monitor-pfsense-agent/last-config-backup.sha256
/var/db/monitor-pfsense-agent/last-config-backup-at
/var/db/monitor-pfsense-agent/last-config-backup-error
```

### Agendamento

- heartbeat a cada 30s
- backup no loop quando intervalo venceu ou comando pendente
- lock: `/var/run/monitor-pfsense-agent-backup.lock`

## Package pfSense GUI

Aba `Backup` em `Services > SystemUp Monitor`:

`Configuracao | Diagnostico | Backup`

## Painel web

Bloco em `apps/web/app/nodes/[id]/page.tsx`:

- status visual (sem alerta `AlertType` no MVP)
- lista de backups do node
- botao "Solicitar backup agora"
- polling `5s` enquanto comando ativo; tambem reagir a `RealtimeRefresh`/SSE

Estados no painel:

- `Solicitar backup agora`
- `Aguardando firewall`
- `Executando no pfSense`
- `Backup recebido`
- `Recebido sem alteracao` (duplicate com comando manual)
- `Firewall offline`
- `Falhou`
- `Expirou`

## Alertas (Fase F, fora do MVP)

Tipos futuros: `config_backup_missing`, `config_backup_failed`
Regra: sem backup valido em `36h`.

No MVP, o painel calcula status visual localmente sem criar `Alert`.

## Smokes (criar na Fase C)

```text
scripts/smoke-config-backup-api.sh
scripts/smoke-config-backup-retention.sh
scripts/smoke-config-backup-download.sh
scripts/smoke-config-backup-request-now.sh
scripts/verify-config-backup-upload-limit.sh  (ja existe)
```

## Plano de rollout

1. Backend + smokes com XML fake
2. Package em homolog com `--config-backup-enabled yes`
3. Medir tamanhos reais de config
4. Painel no detalhe do node
5. Um cliente piloto em producao
6. Rollout gradual com `--config-backup-enabled yes`
7. Fase F alertas
8. Migrar clientes do email; revogar Gmail

## Checklist antes de codar

- [ ] Fase B concluida em producao (ISPConfig + smokes + chave)
- [ ] `git status --short` revisado
- [ ] backup PostgreSQL feito
- [ ] restore PostgreSQL validado
- [ ] `CONFIG_BACKUP_MAX_BYTES` definido apos medicao em homolog
- [ ] `BACKUP_ENCRYPTION_KEY_BASE64` criada fora do repo
- [ ] volume `data/pfsense-config-backups` montado no compose
