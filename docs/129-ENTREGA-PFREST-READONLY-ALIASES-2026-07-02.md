# 129 — Entrega: Piloto pfREST read-only e aliases

**Data:** 2026-07-02  
**Fase do plano 117:** Fase 11 — Piloto pfREST read-only e aliases  
**Componentes alterados:** API, web, docs  
**Versões antes:** API `0.7.0` · web `1.5.1` · package `0.4.9`  
**Versões depois:** API `0.7.0` · web `1.5.1` · package `0.4.9`

**Referências:** `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md` §18 · depende Fase 10

---

## Escopo entregue

### 11A — Read-only

- `GET /api/v1/nodes/:id/pfsense-api/aliases` — lista aliases via pfREST
- `GET /api/v1/nodes/:id/pfsense-api/aliases/compare-backup` — diff pfREST × último `config.xml` armazenado
- Parser de aliases em backup (`pfsense-aliases.util.ts`) + cliente pfREST (`pfrest-client.ts`)
- UI: `NodePfsenseApiPanel` com tabela de divergências

### 11B — Alias push piloto (guardrails)

- `POST .../aliases/preview` — preview + auditoria (`pfsense.alias.manage`)
- `POST .../aliases/apply` — escrita via pfREST (`pfsense.alias.apply`)
- **Desligado por padrão:** `PFSENSE_ALIAS_APPLY_ENABLED=false`
- Gate de backup recente (`PFSENSE_ALIAS_REQUIRE_BACKUP_HOURS`, default 24h)
- Confirmação explícita `confirm_name` = nome do alias
- Auditoria before/after; rollback assistido (sem restore automático)

### Feature flags

| Variável | Default |
|----------|---------|
| `PFSENSE_API_ENABLED` | `false` |
| `PFSENSE_ALIAS_READ_ENABLED` | `false` |
| `PFSENSE_ALIAS_APPLY_ENABLED` | `false` |
| `PFSENSE_ALIAS_REQUIRE_BACKUP_HOURS` | `24` |

### RBAC (migration `20260702210000_pfsense_api_aliases`)

- `pfsense.alias.view`, `pfsense.alias.manage`, `pfsense.alias.apply`
- `pfsense.alias.apply` concedido apenas a `superadmin` por padrão

---

## O que não foi entregue

- CRUD central de aliases em lote / frota
- Gestão de regras firewall, NAT, VPN
- Apply em produção (requer piloto lab + flags)

---

## Rollback

1. `PFSENSE_ALIAS_APPLY_ENABLED=false` — remove capacidade de escrita
2. `PFSENSE_ALIAS_READ_ENABLED=false` — desliga read-only
3. Remover botões do painel permanece seguro; credenciais inertes

---

## Próximo passo

**Fase 12** — Consolidação, hardening e release (`docs/130-...`).
