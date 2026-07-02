# Hotfix — Backup atrasado respeita agendamento do agente

**Data:** 2026-06-24

## Problema

O inventário (`/nodes`) e a frota de backups marcavam firewalls como **Backup atrasado** após **36 horas** fixas, ignorando agendamentos **semanais** ou **mensais** configurados no pacote pfSense.

## Causa raiz

`deriveBackupVisualStatus` usava `BACKUP_LATE_HOURS = 36` (API e bloco de detalhe no frontend). O agente já calculava vencimento com `backup_schedule_due` (hours/daily/weekly/monthly), mas o controlador **não recebia nem persistia** a política de agendamento.

## Decisão de design

| Aspecto | Escolha |
|---------|---------|
| Fonte da política | Heartbeat (`config_backup`) a cada ~30s; reforço nos headers do upload de backup |
| Persistência | `nodes.config_backup_policy_json` (JSONB) |
| Cálculo de atraso | Próximo slot após o último backup bem-sucedido (mesma lógica do agente) |
| Grace period | **6 horas** após o slot vencido (tolerância a loop/backoff/skew) |
| Timezone | `site.timezone` quando disponível; senão UTC |
| Fallback | Sem política reportada: mantém **36h** (comportamento legado documentado) |
| Backup desabilitado no agente | Status **ok** se já existir backup armazenado |

## Arquivos alterados

- `apps/api/src/nodes/backup-schedule.util.ts` (novo)
- `apps/api/src/nodes/backup-policy.util.ts` (novo)
- `apps/api/src/nodes/backup-visual-status.util.ts`
- `apps/api/src/nodes/nodes.service.ts`
- `apps/api/src/ingest/dto/heartbeat.dto.ts`
- `apps/api/src/ingest/ingest.service.ts`
- `apps/api/src/backups/backups-ingest.controller.ts`
- `apps/api/src/backups/backups-ingest.service.ts`
- `apps/api/src/backups/backups-download.service.ts`
- `apps/api/prisma/schema.prisma` + migration `20260624150000_node_config_backup_policy`
- `apps/web/lib/api.ts`
- `apps/web/components/node-config-backups-section.tsx`
- `packages/pfsense-package/.../monitor-pfsense-agent.sh`
- `scripts/test-backup-late-status-logic.sh` (novo)

## Deploy

1. **API + Web + migração** — obrigatório (`prisma migrate deploy`, rebuild/restart containers).
2. **Agente pfSense** — necessário para popular a política nos nodes existentes (heartbeat + headers de backup). Até lá, nodes sem política continuam no fallback de 36h.
3. Após deploy do agente, status corrige automaticamente no próximo heartbeat (~30s) ou upload de backup.

## Testes

```bash
bash scripts/test-backup-late-status-logic.sh
cd apps/api && npm run build
cd apps/web && npm run build
```
