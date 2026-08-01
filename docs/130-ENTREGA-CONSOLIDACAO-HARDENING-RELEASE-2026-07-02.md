# 130 — Entrega: Consolidação, hardening e release (plano 117)

**Data:** 2026-07-02  
**Fase do plano 117:** Fase 12 — Consolidação, hardening e release  
**Componentes alterados:** API, web, package, docs  
**Versões finais trilha 117:** API `0.7.0` · web `1.5.1` · package `0.4.9` (código)

---

## Escopo entregue

### Plano 117 — status final

| Fase | Status |
|------|--------|
| 0–8 | Concluída (docs 118–126) |
| 9 Certificados | Concluída — `docs/127-...` |
| 10 Vault/capacidades | Concluída — `docs/128-...` |
| 11 pfREST/aliases | Concluída — `docs/129-...` |
| 12 Consolidação | Concluída — este documento |

**Progresso:** 13/13 unidades = **100%** da trilha 117.

### Hardening aplicado nesta fase

- Feature flags novas com default **off** (capabilities, vault, pfREST read/apply)
- RBAC backend em todos os endpoints pfREST/vault
- Auditoria em credenciais, list/compare aliases, preview/apply
- Segredos pfREST cifrados; UI só exibe hint
- Client components isolados de `lib/api.ts` via server actions
- Builds API/web verdes; testes unitários ampliados

### Testes executados

```bash
cd apps/api && npm run build
node --test test/certificate-expiration.test.mjs test/node-capabilities-pfsense-api.test.mjs test/operational-actions.util.test.mjs
cd apps/web && npm run build
```

Resultado: **20/20** testes API amostrados OK; builds OK.

### Pendências reais (fora do escopo 117)

- Homologação pfREST em lab com pacote `pfSense-restapi` instalado
- Certificados TLS self-signed nos firewalls (fetch Node pode exigir CA interna — decisão infra)
- Enablement gradual em staging — **checklist:** `docs/134-CHECKLIST-ENABLEMENT-POS-PLANO-117-2026-07-02.md`
- Trilha pos-117: `docs/125-PLANO-PFREST-GERENCIAMENTO-CENTRALIZADO-2026-07-02.md`

### Próxima trilha sugerida

1. Piloto read-only estável em 1–3 firewalls lab
2. Plano 125 (gerenciador centralizado) — aliases centralizados, change batches
3. Revisão periódica de smokes (`scripts/run-smoke-suite.sh`) com flags habilitadas em staging

---

## Documentos de entrega consolidados (117)

| Doc | Fase |
|-----|------|
| 118 | Baseline |
| 119 | Notificações |
| 120 | Dashboard frota |
| 121 | Tags/grupos |
| 122 | MFA |
| 123 | Backup avançado |
| 124 | Observabilidade |
| 125 | Jobs/comandos |
| 126 | Ações operacionais |
| 127 | Certificados |
| 128 | Vault/capacidades |
| 129 | pfREST/aliases |
| 130 | Consolidação (este) |
| 131 | 10 revisões de código pós-plano |
| 134 | Checklist enablement/homologação pós-117 |
