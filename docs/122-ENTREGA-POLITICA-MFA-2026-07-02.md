# 122 — Entrega: Política MFA e endurecimento administrativo

**Data:** 2026-07-02  
**Fase do plano 117:** Fase 4 — Política MFA  
**Componentes alterados:** API, web, docs (sem package pfSense)  
**Versões:** API `0.6.4` · web `1.4.5` · package `0.4.7` (sem bump nesta entrega)

**Referências:** `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md`, `docs/103-ENTREGA-FECHAMENTO-AUDITORIA-MFA-RATELIMIT-PACKAGE-2026-06-24.md`

---

## Escopo entregue

### Dados (Prisma)

| Tabela | Papel |
|--------|-------|
| `mfa_policy_settings` | Singleton (`id=default`): perfis com MFA exigido + flag blocking |

Migration: `20260702140000_mfa_policy_settings`

### API (`/api/v1/security/mfa-policy`)

| Método | Rota | Permissão |
|--------|------|-----------|
| GET | `/` | `security.mfa_policy.view` |
| PATCH | `/` | `security.mfa_policy.manage` |

**Resolução efetiva:** banco → override por env quando `MFA_ENFORCED_ROLES` / `MFA_ENFORCEMENT_BLOCKING` estão definidos (break-glass).

**Anti-lockout:** PATCH com `enforcement_blocking=true` rejeitado se não houver superadmin ativo com MFA habilitado **e** ao menos um código de recuperação não consumido.

**Auditoria:** `security.mfa_policy.update` (metadata: perfis, blocking, mode).

**Usuários:** `GET /api/v1/admin/users` passa a expor `mfa_enabled`, `mfa_enrollment_required`, `mfa_recovery_codes_remaining`.

### RBAC

Permissões novas:

- `security.mfa_policy.view` — superadmin, admin
- `security.mfa_policy.manage` — superadmin

### Painel web

- Rota `/admin/mfa-politica` — matriz por perfil, modo soft/blocking, conformidade, prontidão blocking
- Menu Administração → Política MFA
- Indicadores MFA na aba Usuários (`/admin/usuarios`)
- Enrollment existente em `/conta` reaproveitado

### Modos operacionais

| Modo | Condição | Comportamento |
|------|----------|---------------|
| **off** | Nenhum perfil exigido | MFA opcional |
| **soft** | Perfis exigidos, blocking=false | Banner/`mfa_enrollment_required`; APIs admin liberadas |
| **blocking** | Perfis exigidos, blocking=true | `MfaEnrollmentGuard` bloqueia `/api/v1/admin/*` até enrollment |

Default seguro: off (nenhum perfil) + blocking=false.

---

## Runbook de recuperação (anti-lockout)

### Antes de ligar blocking

1. Enroll MFA no superadmin operacional (`/conta` → MFA TOTP).
2. Guardar **recovery codes** offline (exibidos uma única vez).
3. Testar login com TOTP e com um recovery code.
4. Confirmar painel `/admin/mfa-politica` → **Prontidão blocking: Pronto**.

### Rollback imediato (emergência)

1. **Break-glass via env:** definir `MFA_ENFORCED_ROLES=` (vazio) ou remover a variável; `MFA_ENFORCEMENT_BLOCKING=false`; reiniciar container `api`.
2. **Via painel** (se ainda há sessão admin): `/admin/mfa-politica` → desmarcar perfis e/ou modo **Soft**; salvar.
3. **Usuário trancado em blocking:** login normal → enrollment em `/conta` (rotas admin bloqueadas até MFA ativo).

### Perda de TOTP + recovery codes

- Outro superadmin com MFA pode rotacionar senha / orientar novo enrollment (governança existente).
- Sem superadmin com acesso: break-glass env (item 1) + bootstrap documentado em `05-seguranca-e-endurecimento.md`.

---

## Testes executados

| Teste | Resultado |
|-------|-----------|
| `npm run build` (API) | OK |
| `npm run build` (web) | OK |
| `node --test apps/api/test/mfa-policy-anti-lockout.test.mjs` | OK (9/9) |
| `docker compose build api web && up -d` | OK |
| `prisma migrate deploy` (container) | OK — 24 migrations, sem pendências |

Cenários cobertos nos unitários:

- env override sobre banco;
- blocking bloqueado sem superadmin qualificado;
- soft enforcement permitido sem readiness blocking;
- modos off/soft/blocking.

---

## Gates

| Gate | Status |
|------|--------|
| Contrato API documentado | OK |
| RBAC + auditoria | OK |
| Anti-lockout | OK (guard + testes) |
| Builds | OK |
| Doc 122 | OK |
| Plano 117 Fase 4 | Concluída |

---

## Próximo passo

**Fase 5** — Backup avançado: diff, drift e retenção (`docs/117` §12).
