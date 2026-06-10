# 75. Checklist de testes — RBAC, escopo e permissões

Data: `2026-06-09`
Plano mestre: `22-plano-mestre-rbac-usuarios-permissoes-escopo-2026-06-09.md`

Use este checklist em **cada fase** antes do encerramento.

## Comandos base (sempre)

```bash
cd apps/api && npm run build      # se API alterada
cd apps/web && npm run build      # se web alterada
docker compose up -d --build      # na raiz
scripts/run-smoke-suite.sh
```

## Fase A — Correções urgentes

- [x] `scripts/smoke-rbac-roles.sh` verde (2026-06-09)
- [x] `scripts/smoke-rbac-node-detail.sh` verde (2026-06-09)
- [x] Operator abre detalhe do firewall sem erro 500
- [x] Readonly abre detalhe do firewall sem erro 500
- [x] Admin vê seção bootstrap no detalhe
- [x] Operator não vê menu Instalação
- [x] Heartbeat/agente inalterado (sem alteracao em ingest)

## Fase B — Escopo por cliente

- [x] Migration `user_client_scopes` aplicada
- [x] `scripts/smoke-rbac-client-scope.sh` verde
- [x] User com escopo Cliente A não lista nodes do Cliente B
- [x] `GET /nodes/:id` com ID de outro cliente → 403
- [x] `GET /dashboard/summary` reflete só escopo
- [x] `GET /alerts` filtrado por escopo
- [x] `GET /nodes/:id/config-backups` bloqueado cross-cliente
- [x] Superadmin continua vendo tudo
- [x] Usuários existentes migrados com escopo all-clients

## Fase C — Permissões granulares

- [x] `scripts/smoke-rbac-permissions.sh` verde
- [x] `GET /api/v1/auth/me` retorna permissões
- [x] Download backup exige `backups.download`
- [x] Delete client exige `clients.delete`
- [x] Frontend oculta botões sem permissão (validação API mantida)

## Fase D — Perfil Cliente

- [x] Role `client` criável
- [x] Cliente vê só firewalls da própria empresa
- [x] Cliente não acessa `/admin`, `/audit`, `/bootstrap`
- [x] Cliente não baixa config.xml

## Fase E — UX administrativa

- [x] Menu separado Operação / Administração
- [x] Tela usuários permite definir escopo
- [x] `middleware.ts` protege rotas admin
- [x] Confirmação em ações críticas (rekey, delete, download)

## Fase F — Auditoria e endurecimento

- [x] Logs de login/logout com IP
- [x] Download backup gera audit com `actor_role`
- [x] Negações relevantes registradas
- [x] `AUTH_BOOTSTRAP_LOGIN_ENABLED` documentado/testado

## Regressão geral (todas as fases)

- [ ] `scripts/smoke-admin-operations.sh`
- [ ] `scripts/smoke-bootstrap-flow.sh`
- [ ] `scripts/verify-sse-stream.sh`
- [ ] Monitoramento realtime no dashboard
- [ ] Backup manual + ingest (se ambiente com chave configurada)

## Registro de execução

| Fase | Data | Responsável | Resultado | Observações |
|------|------|-------------|-----------|-------------|
| A | 2026-06-09 | agente | OK | painel 0.1.21; smokes rbac node detail + roles |
| B | 2026-06-09 | agente | OK | API/web 0.2.0; smoke client-scope |
| C | 2026-06-09 | agente | OK | API/web 0.2.1; smoke permissions |
| D | 2026-06-09 | agente | OK | API/web 0.2.2; smoke client-profile |
| E | 2026-06-09 | agente | OK | API/web 0.2.3; middleware, menu, permissoes |
| F | 2026-06-09 | agente | OK | API 0.2.4; audit_logs, access.denied, rate limit |
