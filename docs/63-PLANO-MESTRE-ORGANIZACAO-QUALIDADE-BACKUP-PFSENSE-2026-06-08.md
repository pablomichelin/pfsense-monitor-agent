# 63. Plano mestre: organizacao, qualidade e backup pfSense

Data: `2026-06-08`
Revisao: `2026-06-08` (pos-analise tecnica)

## Objetivo

Definir um rumo claro para organizar o Monitor-Pfsense, melhorar qualidade tecnica e preparar o desenvolvimento do modulo de backup do `config.xml` dos pfSense.

Este documento nao implementa o backup. Ele define o plano completo para iniciar a implementacao com seguranca, rastreabilidade e menor risco operacional.

Contrato tecnico detalhado: `docs/64-ESPECIFICACAO-MODULO-BACKUP-PFSENSE-2026-06-08.md`
Frontend e deploy: `docs/65-FRONTEND-E-DEPLOY-BACKUP-PFSENSE-2026-06-08.md`
Decisao arquitetural: `docs/66-DECISAO-MODULO-BACKUP-INTEGRADO-SYSTEMUP-MONITOR-2026-06-08.md`
Checklist e revisao: `docs/67-CHECKLIST-REVISAO-PLANO-BACKUP-2026-06-08.md`

## Premissas verdadeiras

- O sistema atual ja tem controlador `NestJS`, painel `Next.js`, banco `PostgreSQL` e package pfSense.
- A arquitetura correta continua sendo `push`: o pfSense envia dados ao controlador.
- O controlador nao deve abrir acesso inbound aos firewalls dos clientes.
- O cadastro atual de `Cliente -> Site -> Firewall/Node` deve ser reaproveitado como dono dos backups.
- O backup sera modulo integrado do Monitor-Pfsense, nao um software novo.
- No pfSense, o backup entra como nova aba `Backup` dentro de `Services > SystemUp Monitor`.
- O package atual em `packages/pfsense-package` e o caminho principal para evoluir o agente.
- `packages/pfsense-agent` deve ser tratado como legado da fase inicial, salvo quando uma tarefa disser o contrario.
- O backup atual por email deve ser aposentado, nao evoluido.
- O `config.xml` do pfSense e dado altamente sensivel.
- O modulo de backup nao deve salvar XML bruto em tabela do banco.
- Download/restore de backup deve ser auditado.
- Restore automatico no pfSense nao entra no primeiro MVP do backup.
- O botao "Solicitar backup agora" no painel deve criar uma solicitacao pendente para o agente, nao tentar acessar o pfSense por SSH, VPN ou porta aberta.

## Origem interna canonica

Decisao fechada em `2026-06-08`:

```text
Internet -> Cloudflare -> ISPConfig (192.168.100.253) -> 192.168.100.221:3031 -> nginx compose :8088 -> api/web
```

- origem interna canonica: `http://192.168.100.221:3031`
- gateway interno do compose: porta `8088` (mapeada por `compose.override.yaml`)
- referencia versionada: `infra/ispconfig/nginx.monitor-pfsense.conf`
- documentos historicos na raiz (`01` a `18`) podem ainda citar `192.168.100.244`; nao sao fonte de verdade operacional

## Escopo do MVP (fechado)

Entra no MVP:

- upload assinado por HMAC
- armazenamento criptografado em disco
- metadados no PostgreSQL
- retencao por firewall
- listagem e status no detalhe do node
- download auditado para `superadmin`
- solicitacao `config_backup_now` via heartbeat
- status visual no painel (`Em dia`, `Atrasado`, `Falhou`, `Nunca enviado`) calculado por idade do ultimo backup

Nao entra no MVP:

- alertas `AlertType` no modulo de alertas (Fase F)
- restore automatico
- pagina global `/backups`
- criptografia ponta-a-ponta no pfSense
- comando `backup-force` no agente
- storage externo obrigatorio

## Problemas que precisam ser resolvidos antes do backup

### 1. Documentacao espalhada

Decisao:

- manter arquivos antigos no lugar por enquanto
- criar camada canonica em `docs/00-INDICE-OPERACIONAL.md` e docs `63` a `67`
- reorganizacao fisica apenas em trilha futura, separada de codigo

### 2. Origem interna desalinhada

Status em `2026-06-08`:

- `infra/ispconfig/nginx.monitor-pfsense.conf` atualizado para `192.168.100.221:3031`
- `infra/ispconfig/README.md` atualizado
- falta aplicar o snippet no ISPConfig real do host (operacao manual)
- documentos historicos na raiz ainda citam `192.168.100.244` (nao bloqueiam implementacao)

### 3. Limite de payload insuficiente

Acao:

- heartbeat permanece em `64 KB`
- backup de config: `5 MB` inicial, configuravel por `CONFIG_BACKUP_MAX_BYTES`
- limite por rota em **duas camadas**:
  - `infra/nginx/default.conf` (gateway interno do compose)
  - `infra/ispconfig/nginx.monitor-pfsense.conf` (proxy externo)
- medir tamanho real dos `config.xml` em homologacao antes do rollout geral; se algum node exceder `5 MB`, aumentar limite com decisao operacional documentada

Validacao:

```bash
BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/verify-origin-contract.sh
BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/verify-config-backup-upload-limit.sh
```

### 4. Persistencia de arquivos de backup

Acao:

- volume Docker montado em `compose.yaml`: `./data/pfsense-config-backups:/app/data/pfsense-config-backups`
- diretorio versionado com `.gitkeep`; conteudo ignorado no git
- backup operacional do volume junto com PostgreSQL em mudancas relevantes

### 5. Dados sensiveis

Acao obrigatoria:

- criptografar backup em repouso com `BACKUP_ENCRYPTION_KEY_BASE64` (chave separada de `NODE_SECRET_ENCRYPTION_KEY_BASE64`)
- nunca logar conteudo
- nunca persistir XML puro no PostgreSQL
- download inicialmente apenas `superadmin`
- auditar ingestao, download, retencao e falhas
- rotacao de chave: pos-MVP; arquivos antigos mantem `encryption_version` para descriptografia com chave correspondente

### 6. Segredo antigo do Gmail

Acao operacional:

- revogar a senha de app exposta
- remover scripts antigos dos pfSense conforme migracao
- nunca reaproveitar essa senha no novo sistema

## Organizacao desejada do software

### Backend

```text
apps/api/src/
  ingest/
  backups/
  nodes/
  admin/
  alerts/
  auth/
  common/
```

Mudancas recomendadas:

- extrair autenticacao HMAC de node para `common/node-request-auth.service.ts`
- manter `ingest/heartbeat` focado em snapshot operacional
- criar modulo `backups/` para ingest, storage, retencao, download e comandos
- mecanismo allowlist `config_backup_now` via tabela `NodeCommand`
- separar criptografia de `node_secret` e criptografia de backups
- adicionar testes ou smokes por rota sensivel

### Banco

```text
Client
  Site
    Node
      NodeConfigBackup[]
      NodeCommand[]
```

Nao guardar `config.xml` bruto no banco.

### Armazenamento

```text
data/pfsense-config-backups/
  <node_uid>/
    <ano>/<mes>/cfgb_<timestamp>_<hashcurto>.enc
```

Regras:

- arquivos sempre criptografados
- retencao: ultimos `30` backups **ou** teto de `250 MB` por node (o que vier primeiro)
- checksum persistido

### Frontend

- bloco "Backups" no detalhe do firewall (`apps/web/app/nodes/[id]/page.tsx`)
- polling a cada `5s` enquanto houver comando `pending/picked_up/running`; usar `RealtimeRefresh` existente quando disponivel
- download apenas `superadmin`
- `admin` pode solicitar backup; `operator` e `readonly` apenas visualizam metadados

### Package pfSense

- nova aba `Backup` em `Services > SystemUp Monitor`
- comando `backup-config` e `backup-status` no MVP
- rollout com `--config-backup-enabled no` por padrao em producao ate homologacao; `yes` em homolog

### Repositorio e deploy

- repositorio operacional: `pablomichelin/pfsense-monitor-agent`
- raw base: `https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main`
- release: `./scripts/release-pfsense-package.sh`

## Roadmap recomendado

### Fase A - Arrumar a casa documental

Status: **concluida** em `2026-06-08`

Entregas: docs `00`, `63` a `67`, `LEITURA-INICIAL.md` atualizado.

### Fase B - Saneamento de publicacao e seguranca

Status: **parcial** em `2026-06-08`

Feito no repositorio:

- origem canonica `192.168.100.221:3031` em `infra/ispconfig/nginx.monitor-pfsense.conf`
- limite `5m` por rota em `infra/nginx/default.conf` e ISPConfig reference
- volume `data/pfsense-config-backups` no `compose.yaml`
- script `scripts/verify-config-backup-upload-limit.sh`
- backup PostgreSQL validado (doc `65`)
- `verify-origin-contract.sh` passou em producao

Pendente antes da Fase C:

- aplicar snippet atualizado no ISPConfig real
- rodar `verify-config-backup-upload-limit.sh` em producao apos aplicar ISPConfig
- criar `BACKUP_ENCRYPTION_KEY_BASE64` fora do repositorio
- revogar senha Gmail antiga
- medir tamanho de `config.xml` em pelo menos um pfSense de homologacao

Criterio de saida:

- ambos os scripts de verificacao passam em producao
- chave de backup criada e injetada no `.env.api`
- healthz, login, SSE e API continuam funcionando

### Fase C - Backend do backup

Ordem interna:

1. migration Prisma (`NodeConfigBackup`, `NodeCommand`)
2. `common/node-request-auth.service.ts`
3. modulo `backups/` com ingest criptografado
4. endpoints humanos (listagem, download, request)
5. comandos no heartbeat + `command-ack` + `command-result`
6. smokes

Criterio de saida: upload com `curl`/XML fake funciona; arquivo em disco nao e legivel; download exige `superadmin`.

### Fase D - Package pfSense

Criterio de saida: pfSense real envia backup; comando `config_backup_now` funciona; deduplicacao e solicitacao manual coexistem conforme doc `64`.

### Fase E - Painel de backup

Criterio de saida: operador ve status por firewall; admin/superadmin solicita backup; polling de comando funciona.

### Fase F - Alertas de backup

Entregas: `config_backup_missing`, `config_backup_failed` no modulo de alertas existente.

### Fase G - Restore manual assistido

### Fase H - Criptografia ponta-a-ponta opcional

## Permissoes MVP (decisao fechada)

| Papel | Ver metadados | Solicitar backup | Download |
|-------|---------------|------------------|----------|
| superadmin | sim | sim | sim |
| admin | sim | sim | nao |
| operator | sim | nao | nao |
| readonly | sim | nao | nao |

## Definition of Done do modulo backup

- API recebe backup assinado por node real
- arquivo salvo esta criptografado em repouso
- metadados aparecem no painel do node
- retencao funciona (contagem e teto de disco)
- download exige `superadmin` e gera auditoria
- solicitacao manual completa o ciclo de comando mesmo com hash duplicado
- package pfSense envia backup sem crontab manual
- smokes criados e executados
- documentacao operacional atualizada

## O que nao fazer

- nao salvar XML bruto no banco ou em disco sem criptografia
- nao enviar backup por email como solucao final
- nao criar endpoint sem HMAC
- nao ativar restore automatico no MVP
- nao aumentar limite global sem rota especifica
- nao reorganizar toda a documentacao junto com mudanca de codigo
- nao ativar backup automatico em todos os clientes no primeiro release

## Proximo passo recomendado

1. aplicar `infra/ispconfig/nginx.monitor-pfsense.conf` no host ISPConfig
2. rodar smokes de origem e limite de backup em producao
3. criar e injetar `BACKUP_ENCRYPTION_KEY_BASE64`
4. medir `config.xml` em homologacao
5. iniciar Fase C conforme `docs/67-CHECKLIST-REVISAO-PLANO-BACKUP-2026-06-08.md`
