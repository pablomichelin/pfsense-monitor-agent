# 85 — Entrega front-end Fase 6 (Conta separada + polimento PT-BR)

**Data:** 2026-06-09  
**Versão painel:** `0.7.0`  
**API:** `0.2.6` (sem alteração)  
**Plano:** `29-plano-fase6-conta-separada-polimento-ptbr-2026-06-09.md`  
**Trilha:** `docs/85-TRILHA-FRONTEND-FASE6-CONTA-SEPARADA-POLIMENTO-PTBR-2026-06-09.md`

---

## 1. Resumo

Nova rota **`/conta`** com perfil do usuário (e-mail, perfil, sessão atual). **`/sessions`** focada apenas em sessões ativas e revogação. Menu **Conta** sem duplicata de rota. Polimento PT-BR pontual em labels e mensagens.

---

## 2. Decisão de API

| Decisão | Detalhe |
|---------|---------|
| Sem novo endpoint | Não existe troca de senha self-service na API |
| Dados de perfil | `GET /api/v1/auth/me` |
| Sessões | `GET /api/v1/auth/sessions` + `POST .../revoke` (inalterado) |
| Senha na UI | Texto informativo — administrador redefine em Usuários |

---

## 3. Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `29-plano-fase6-conta-separada-polimento-ptbr-2026-06-09.md` | Plano Fase 6 |
| `docs/85-TRILHA-FRONTEND-FASE6-CONTA-SEPARADA-POLIMENTO-PTBR-2026-06-09.md` | Trilha executável |
| `apps/web/app/conta/page.tsx` | Página Minha conta |

---

## 4. Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `apps/web/app/sessions/page.tsx` | Foco sessões; PT-BR |
| `apps/web/lib/route-policy.ts` | Menu: `/conta` + `/sessions` |
| `apps/web/components/breadcrumbs.tsx` | Breadcrumbs Conta › Minha conta / Sessões |
| `apps/web/lib/auth.ts` | revalidate `/conta`; mensagens PT-BR |
| `apps/web/lib/rbac-labels.ts` | Usuários, Configurações, Instalação |
| `apps/web/components/node-config-backups-section.tsx` | Coluna Ação |
| `apps/web/package.json` | Versão `0.7.0` |

---

## 5. Menu Conta

| Item | Rota |
|------|------|
| Minha conta | `/conta` |
| Sessões | `/sessions` |

---

## 6. Como validar

1. Login — menu **Conta** exibe dois itens distintos
2. Abrir `/conta` — e-mail, perfil e link para Sessões
3. Abrir `/sessions` — tabela de sessões; revogar outra sessão funciona
4. Breadcrumbs: Conta › Minha conta e Conta › Sessões
5. Logout e login preservados
6. Rodapé exibe `v0.7.0`

---

## 7. Build e deploy

```bash
cd apps/web && npm run build
cd /Dados/Monitor-Pfsense && docker compose up -d --build
```

---

## 8. Próxima fase

Fase 7 — Auditoria com filtros amigáveis (`docs/86` planejado).
