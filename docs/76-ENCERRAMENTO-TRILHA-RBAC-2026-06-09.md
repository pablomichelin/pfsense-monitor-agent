# 76. Encerramento — Trilha RBAC (usuários, permissões e escopo)

Data de encerramento: `2026-06-09`
Status: **trilha encerrada**
Plano mestre: `22-plano-mestre-rbac-usuarios-permissoes-escopo-2026-06-09.md`

## Resumo executivo

A trilha RBAC reestruturou autenticação humana, autorização, escopo por cliente, perfil de cliente final, UX administrativa e auditoria corporativa — **sem alterar ingest do agente/heartbeat**.

Versões finais:

| Componente | Versão |
|------------|--------|
| API | `0.2.4` |
| Painel web | `0.2.3` (na data do encerramento; ver `docs/77` para `0.2.5`) |

## Fases entregues

| Fase | Doc | Versão | Entrega principal |
|------|-----|--------|-------------------|
| A | `docs/69` | painel `0.1.21` | Bootstrap desacoplado; menu Instalação restrito |
| B | `docs/70` | API/web `0.2.0` | `user_client_scopes`; escopo por cliente |
| C | `docs/71` | API/web `0.2.1` | Permissões granulares; `/auth/me` expõe permissões |
| D | `docs/72` | API/web `0.2.2` | Perfil `client`; vínculo `users.client_id` |
| E | `docs/73` | API/web `0.2.3` | Menu Operação/Administração; `middleware.ts`; matriz read-only |
| F | `docs/74` | API `0.2.4` | `audit_logs` padronizado; `access.denied`; endurecimento |

Matriz de referência: `23-matriz-permissoes-e-escopo-rbac-2026-06-09.md`

## Smokes validados (encerramento)

```bash
scripts/smoke-rbac-roles.sh
scripts/smoke-rbac-node-detail.sh
scripts/smoke-rbac-client-scope.sh
scripts/smoke-rbac-permissions.sh
scripts/smoke-rbac-client-profile.sh
scripts/smoke-rbac-admin-ux.sh
scripts/smoke-rbac-audit-hardening.sh
scripts/run-smoke-suite.sh
```

Checklist completo: `docs/75-CHECKLIST-TESTES-RBAC-ESCOPO-2026-06-09.md` (fases A–F marcadas).

## Artefatos principais no código

- `apps/api/src/auth/access-policy.service.ts` — escopo global / por cliente / perfil `client`
- `apps/api/src/auth/permissions.service.ts` — catálogo seedado `role_permissions`
- `apps/api/src/audit/audit.service.ts` — auditoria centralizada
- `apps/api/src/audit/access-denied.filter.ts` — `access.denied` em 403 autenticados
- `apps/web/middleware.ts` — proteção de rotas por permissão
- `apps/web/lib/route-policy.ts` — menu e política de rotas

## Flags operacionais

| Flag | Default | Uso |
|------|---------|-----|
| `RBAC_SCOPE_ENABLED` | `true` | Escopo por cliente |
| `RBAC_PERMISSIONS_ENABLED` | `true` | Permissões granulares |
| `AUTH_BOOTSTRAP_LOGIN_ENABLED` | `true` | Login via credenciais `.env`; **desligar em produção** após bootstrap |

Documentação de segurança atualizada: `05-seguranca-e-endurecimento.md`

## Fora de escopo (Fase G — opcional)

Não implementar sem decisão explícita:

- `Node.client_id` direto e depreciação gradual de `Site`
- `backups.restore` com fluxo controlado
- Roles customizáveis editáveis na UI
- Página global `/backups`

## Não reabrir sem decisão explícita

Esta trilha está **encerrada**. Correções pontuais podem ocorrer, mas não reabrir fases A–F nem redesenhar RBAC sem novo plano mestre.

## Próximas trilhas sugeridas (independentes)

1. Homologação / expansão em novos firewalls
2. Fase B serviços (`21-evolucao-servicos-e-fase-b-2026-03-13.md`)
3. Fase G RBAC opcional (se aprovada pelo produto)

## Referências

- Diagnóstico baseline: `docs/68-DIAGNOSTICO-RBAC-USUARIOS-PERMISSOES-2026-06-09.md`
- Plano mestre: `22-plano-mestre-rbac-usuarios-permissoes-escopo-2026-06-09.md`
- Histórico: `docs/HISTORICO-E-LINHA-DO-TEMPO.md` (seção RBAC 2026-06-09)
