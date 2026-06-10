# 67. Checklist e revisao do plano de backup pfSense

Data: `2026-06-08`

## Objetivo

Consolidar a revisao tecnica do plano, registrar o que foi corrigido e servir como checklist unico para implementacao.

## Revisao executada em 2026-06-08

### Problemas encontrados na primeira analise

1. Fase B marcada como feita, mas repo ainda com origem `192.168.100.244`
2. Sem volume Docker para `data/pfsense-config-backups`
3. Limite `5m` nao detalhado nas duas camadas nginx
4. Header `X-Backup-Id` sem definicao
5. Maquina de estados do comando incompleta
6. Conflito deduplicacao vs "Solicitar backup agora"
7. Alertas no MVP vs Fase F ambiguos
8. Permissoes com "talvez" no rollout
9. `backup-force` listado sem uso
10. Docs `65` e `66` redundantes com `63` e `64`

### Correcoes aplicadas

| Item | Acao |
|------|------|
| Origem canonica | `infra/ispconfig/nginx.monitor-pfsense.conf` -> `192.168.100.221:3031` |
| Nginx interno | `location = /api/v1/ingest/config-backup` com `5m` |
| Volume Docker | `compose.yaml` + `data/pfsense-config-backups/.gitkeep` |
| Smoke limite backup | `scripts/verify-config-backup-upload-limit.sh` |
| X-Backup-Id | definido no doc `64` (tentativa vs artefato) |
| Comandos | `command-ack` e `command-result` obrigatorios no doc `64` |
| Deduplicacao manual | comando sempre `succeeded` com `duplicate` quando aplicavel |
| Alertas MVP | removidos do MVP; status visual apenas; Fase F para `AlertType` |
| Permissoes | tabela fechada no doc `63` |
| backup-force | removido do MVP |
| Retencao | contagem `30` + teto `250 MB`/node |
| HA/CARP | backup por `Node` independente |
| Rollout | `--config-backup-enabled no` padrao producao |
| Docs | `65` e `66` enxutos; `63` e `64` expandidos |

## Checklist Fase B (antes de codar)

- [x] Origem canonica no repositorio (`192.168.100.221:3031`)
- [x] Limite `5m` por rota no nginx interno (compose)
- [x] Limite `5m` por rota na referencia ISPConfig
- [x] Volume `data/pfsense-config-backups` no compose
- [x] Script `verify-config-backup-upload-limit.sh`
- [x] Backup e restore PostgreSQL validados
- [x] `verify-origin-contract.sh` passou em producao
- [ ] Aplicar snippet no ISPConfig real do host
- [ ] `verify-config-backup-upload-limit.sh` passar em producao
- [ ] Criar `BACKUP_ENCRYPTION_KEY_BASE64` fora do repo
- [ ] Injetar chave no `.env.api` do servidor
- [ ] Revogar senha Gmail antiga
- [ ] Medir tamanho de `config.xml` em pfSense de homolog

## Checklist Fase C (backend)

- [ ] Migration `NodeConfigBackup` + `NodeCommand` com FK
- [ ] `common/node-request-auth.service.ts`
- [ ] `CONFIG_BACKUP_*` e `BACKUP_*` em `app-config.ts`
- [ ] `POST /api/v1/ingest/config-backup`
- [ ] `POST /api/v1/ingest/command-ack`
- [ ] `POST /api/v1/ingest/command-result`
- [ ] Extensao heartbeat com `commands[]`
- [ ] Criptografia AES-256-GCM em disco
- [ ] Retencao (contagem + teto MB)
- [ ] Endpoints humanos (list, download, request, status)
- [ ] Auditoria completa
- [ ] Smokes `smoke-config-backup-*`

## Checklist Fase D (package)

- [ ] `backup-config` e `backup-status` no agente
- [ ] Leitura de `commands[]` no heartbeat
- [ ] `command-ack` antes do upload
- [ ] `X-Backup-Id` gerado pelo agente
- [ ] Aba `Backup` na GUI pfSense
- [ ] Flags no instalador
- [ ] Bump versao + release SHA256
- [ ] Homolog com XML real

## Checklist Fase E (painel)

- [ ] Bloco backups em `nodes/[id]/page.tsx`
- [ ] Status visual (36h)
- [ ] Botao solicitar + estados
- [ ] Polling 5s durante comando ativo
- [ ] Download superadmin auditado

## Checklist Fase F (alertas)

- [ ] `AlertType.config_backup_missing`
- [ ] `AlertType.config_backup_failed`
- [ ] Regra 36h no lifecycle/reconcile

## Melhorias adicionais identificadas na re-revisao

### Prioridade alta (fazer na implementacao)

1. **Job de expiracao de comandos** — cron ou interval no NestJS para `pending -> expired`
2. **Reconciliacao comando/upload** — se upload OK mas comando nao atualizado, corrigir no heartbeat seguinte
3. **Backup do volume de arquivos** — incluir `data/pfsense-config-backups` no runbook operacional junto com PostgreSQL
4. **Teste de tamanho em lote** — script que lista nodes e, apos homolog, registra tamanho medio/max de config

### Prioridade media (pos-MVP ou durante se couber)

5. **Cancelamento de solicitacao** — `POST .../requests/:id/cancel` para admin
6. **Rate limit** por node na rota de backup (middleware ou nginx `limit_req`)
7. **Metricas** — contador de backups/dia, falhas, duplicados (logs estruturados bastam no MVP)
8. **Documentar restore manual** — doc operacional em `docs/` quando Fase G iniciar

### Prioridade baixa

9. **Pagina global `/backups`** — Fase posterior
10. **Rotacao de chave com re-encrypt** — Fase H
11. **Migrar docs historicos `192.168.100.244`** — trilha documental separada, sem bloquear codigo

## Criterios de qualidade do plano (pos-revisao)

| Criterio | Antes | Depois |
|----------|-------|--------|
| Prontidao para implementar | 6/10 | 8.5/10 |
| Consistencia interna | 6/10 | 9/10 |
| Seguranca | 8/10 | 9/10 |
| Operacionalizacao | 7/10 | 8.5/10 |

Bloqueadores restantes para Fase C: apenas itens operacionais da Fase B no host (ISPConfig, chave, medicao XML).

## Ordem de leitura para implementador

1. `docs/67-...md` (este arquivo)
2. `docs/64-...md` (contrato)
3. `docs/63-...md` (fases)
4. `docs/65-...md` (UI/deploy)
5. `docs/66-...md` (decisao, se houver duvida de escopo)
