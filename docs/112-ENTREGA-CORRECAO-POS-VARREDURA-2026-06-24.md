# 112 — Entrega: correção pós-varredura read-only (plano 110)

**Data:** 2026-06-24  
**Status:** ✅ Entregue  
**Continua após:** [111-ENTREGA-CORRECAO-FALHAS-AUDITORIA-110-2026-06-24.md](./111-ENTREGA-CORRECAO-FALHAS-AUDITORIA-110-2026-06-24.md)

---

## Versões finais

| Componente | Versão |
|------------|--------|
| Package pfSense | **0.4.4** |
| API NestJS | **0.6.2** |
| Painel web | **1.4.3** |

---

## Resumo por achado

| ID | Sev. | Correção |
|----|------|----------|
| **A2-001** | Alto | Lock de upgrade OS: agente não adquire lock com PID do daemon; wrapper `run_pfsense_upgrade.sh` adquire/libera lock com PID próprio ao fim (sucesso/falha/`prepared_manual_confirm`). |
| **A2-002** | Alto | `run_pfsense_upgrade.sh`: `rmdir` → `rm -f` em arquivo lock; padrão alinhado ao agente (`pid` + `started_at`). |
| **SMOKE-001** | Alto | `smoke-rbac-admin-ux.sh` aceita redirect `/conta?access=denied` (W1/W3). Suite **14/14** verde. |
| **C6-001** | Médio | `resolveClientIp()` centralizado em `auth`, `admin`, `alerts`, `backups`, `pfsense-upgrade` controllers e `access-denied.filter.ts`. Tipo `ClientIpRequest` ampliado. |
| **W2-001** | Médio | `handlePageApiError` + redirect `/conta?access=denied` em `audit`, `alerts`, `admin/clientes`, `admin/permissoes`, `bootstrap` (403 parcial preservado no bootstrap-command). |
| **W2-002** | Médio | `/conta` lê `searchParams` (`access=denied`, `mfa=required`) e exibe banners explicativos. |
| **C2-001** | Médio | `MfaEnrollmentGuard` estendido a dashboard, nodes, alerts, backups e pfsense-upgrade; `POST /auth/login/mfa` retorna `mfa_enrollment_required` + `mfa_enforcement_blocking` como login inicial. |
| **DOC-001** | Médio | `.env.api.example` sincronizado (`SYSTEM_VERSION=0.6.2`, SHA256 package 0.4.4). |
| **MW-001** | Médio | Middleware distingue falha de rede/API (`network_error`) de 401; cookie de sessão presente → fail-open (não redireciona ao login). |
| **HOME-001** | Médio | `/` usa `resolveDefaultAuthenticatedPath()` — primeira rota permitida ou `/conta?access=denied`. |
| **PERM-001** | Médio | Comentários em `route-policy.ts` e `access-policy.service.ts`: `clients.create` ≠ escopo global para cadastro top-level. |
| **P7-CMT** | Baixo | Comentário `systemup_monitor_current_user_is_admin()` corrigido (fail-closed). |
| **DOC-002** | Baixo | Nota de supersessão em `LEITURA-INICIAL.md` L113 (package legado 0.2.27). |

---

## Não-regressões preservadas

- Hotfix 106: portal modal, `key={pathname}`, admin layout pass-through.
- Hotfix 109: `getUserEntry['item']` desempacotado.
- Melhorias visuais 109 intactas.

---

## Validação

```bash
cd /Dados/Monitor-Pfsense
./scripts/run-smoke-suite.sh          # 14/14 verde (~39s)
cd apps/web && npm run build            # OK (1.4.3)
cd apps/api && npm run build            # OK (0.6.2)
./scripts/release-pfsense-package.sh --no-push  # artefato 0.4.4
docker compose up -d --build api web    # OK
```

Artefato: `dist/pfsense-package/monitor-pfsense-package-v0.4.4.tar.gz`  
Config: `config/package-release.env` (`PACKAGE_RELEASE_SHA256=09e62161…`)

---

## Próximo passo

1. Publicar package **0.4.4** nos firewalls piloto.
2. Opcional: ligar `MFA_ENFORCED_ROLES` + `MFA_ENFORCEMENT_BLOCKING=true` após enrollment dos admins.
