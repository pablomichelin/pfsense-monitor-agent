# 74. Trilha RBAC — Fase F: auditoria e endurecimento

Data de abertura: `2026-06-09`
Status: `encerrada`
Plano mestre: `22-plano-mestre-rbac-usuarios-permissoes-escopo-2026-06-09.md`
Pré-requisito: `docs/73-TRILHA-RBAC-FASE-E-UX-ADMINISTRATIVA-2026-06-09.md`

## Objetivo

Rastreabilidade corporativa e redução de superfície de ataque sem alterar ingest do agente.

## Escopo entregue

### Banco

- Migration `20260609170000_audit_logs_hardening`
- Colunas `actor_role`, `client_id`, `result` em `audit_logs`

### Backend (`apps/api` 0.2.4)

- `AuditService` centralizado + `AccessDeniedAuditFilter` (`access.denied` em 403 autenticados)
- Login/logout/download de backup gravam `actor_role`; download inclui `client_id`
- `AUTH_BOOTSTRAP_LOGIN_ENABLED` (default `true`) desabilita login via credenciais de `.env`
- Rate limit em `GET /api/v1/agent/package-release` (60 req/min por IP)

### Documentação

- `05-seguranca-e-endurecimento.md` — política de backups, bootstrap e auditoria

### Frontend (`apps/web` 0.2.3)

- Linha de auditoria exibe `actor_role` e `result` quando presentes

### Scripts

- `scripts/smoke-rbac-audit-hardening.sh`

## Critérios de aceite

1. `auth.login` registra `actor_role`, `result=success` e IP.
2. 403 autenticado gera `access.denied` com `result=denied`.
3. Download de backup registra `actor_role` e `client_id`.
4. `AUTH_BOOTSTRAP_LOGIN_ENABLED=false` bloqueia login só por env.
5. `package-release` retorna 429 após excesso de requisições.

## Smoke obrigatório

```bash
scripts/smoke-rbac-audit-hardening.sh
scripts/run-smoke-suite.sh
```

## Encerramento

- Data: `2026-06-09`
- API: `0.2.4`
- Smoke: `scripts/smoke-rbac-audit-hardening.sh` verde
- Trilha RBAC encerrada em `docs/76-ENCERRAMENTO-TRILHA-RBAC-2026-06-09.md`
