# 123 — Entrega: Backup avançado (diff, drift e retenção)

**Data:** 2026-07-02  
**Fase do plano 117:** Fase 5 — Backup avançado  
**Componentes alterados:** API, web, docs (sem package pfSense)  
**Versões:** API `0.6.5` · web `1.4.6` · package `0.4.7` (sem bump nesta entrega)

**Referências:** `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md` §12, `docs/64-ESPECIFICACAO-MODULO-BACKUP-PFSENSE-2026-06-08.md`

---

## Escopo entregue

### Backend (`apps/api/src/backups/`)

| Recurso | Rota | Permissão |
|---------|------|-----------|
| Diff estruturado | `GET /api/v1/nodes/:id/config-backups/diff?from=&to=` | `backups.view` |
| Status drift | `GET /api/v1/nodes/:id/config-backups/drift` | `backups.view` |
| Reconhecer drift | `POST /api/v1/nodes/:id/config-backups/drift/acknowledge` | `backups.manage` |
| Política retenção (leitura) | `GET /api/v1/nodes/:id/config-backups/retention-policy` | `backups.view` |
| Política retenção (escrita) | `PATCH /api/v1/nodes/:id/config-backups/retention-policy` | `backups.manage` |
| Exportação assistida | `GET /api/v1/nodes/:id/config-backups/:backupId/export-guide` | `backups.download` |

**Diff:** parser por seções top-level do `config.xml`; política **fail-closed** (seção desconhecida mascarada); campos sensíveis (`password`, `secret`, `privkey`, etc.) redigidos; descriptografia só em memória; auditoria `backup.config.diff`.

**Drift:** comparação entre os dois últimos backups `stored`; alerta quando seções sensíveis (`filter`, `system`, `openvpn`, `ipsec`, `nat`, …) mudam; estado em `config_backup_policy_json.drift_state`; deduplicação por `alert_key`; auditoria `backup.config.drift_detected` / `backup.config.drift_acknowledged`.

**Retenção:** overrides por node em `config_backup_policy_json` (`retention_count`, `retention_max_bytes`); fallback para env global; retenção preserva backup mais recente; auditoria `backup.config.retention_policy_update`.

**Exportação assistida:** guia operacional manual — **sem restore automático** no pfSense.

### RBAC

- Nova permissão: `backups.manage` (superadmin, admin)
- Migration: `20260702150000_backup_advanced_permissions`

### Feature flags (default seguro: off)

| Env | Default | Efeito |
|-----|---------|--------|
| `BACKUP_DIFF_ENABLED` | `false` | Habilita diff e export-guide |
| `BACKUP_DRIFT_ENABLED` | `false` | Habilita detecção/consulta/reconhecimento de drift |

### Painel web

Aba **Backup** do detalhe do firewall (`/nodes/[id]`):

- Indicador de drift com reconhecimento (admin)
- Formulário de retenção por node
- Diff viewer (seletor de duas versões, seções colapsáveis, aviso de mascaramento)

---

## O que não foi entregue

- Restore automático de `config.xml` no pfSense (proibido pelo plano)
- AlertType dedicado no módulo de alertas (drift usa estado + auditoria; integração com notificações externas fica para homologação futura)
- Diff textual cego como fonte única (apenas complementar estruturado)

---

## Impacto

| Área | Mudança |
|------|---------|
| API | Novos endpoints; util diff/drift; retenção por node |
| Dados | Migration permissão; campos JSON aditivos em `config_backup_policy_json` |
| UI | Componentes `backup-diff-viewer`, `backup-advanced-panel` |
| Agente/package | Nenhum |

---

## Rollback

1. `BACKUP_DIFF_ENABLED=false` e `BACKUP_DRIFT_ENABLED=false`; reiniciar API
2. Backups criptografados existentes permanecem válidos
3. Overrides de retenção podem ser limpos via PATCH com `null`

---

## Testes executados

```bash
cd apps/api && npm run build
node --test test/backups-config-diff.test.mjs test/backups-retention-policy.test.mjs
cd ../web && npm run build
```

Resultado: **9/9** testes unitários API; builds API e web OK.

---

## Homologação sugerida

1. Aplicar migration e redeploy API/web
2. Definir `BACKUP_DIFF_ENABLED=true` e `BACKUP_DRIFT_ENABLED=true` em homolog
3. Comparar dois backups reais de um node piloto; validar mascaramento
4. Alterar regra de firewall em lab; confirmar drift e reconhecimento
5. Ajustar retenção do node; confirmar purge preservando backup mais novo

---

## Próximo passo

**Fase 6** — Observabilidade histórica e rollups (`docs/117` §13): amostragem periódica do snapshot + rollups horários/diários.
