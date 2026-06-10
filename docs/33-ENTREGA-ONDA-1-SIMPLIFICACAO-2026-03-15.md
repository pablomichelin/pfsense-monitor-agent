# Entrega Onda 1 — Simplificação do Painel

**Data:** 2026-03-15  
**Versão:** 0.1.2  
**Escopo:** Simplificações de muito baixo risco conforme matriz de decisão (docs/31-MATRIZ-DECISAO-SIMPLIFICACAO-2026-03-14.md)

---

## 1. Resumo do que foi alterado

| Item | Alteração |
|------|-----------|
| **Login** | Remoção dos stats "Sessão", "Cookie", "Autoridade" do PageHero; remoção da seção "Controle de acesso" com 3 cards técnicos; layout simplificado para formulário único |
| **Sessions** | Remoção dos 3 cards duplicados (Total, Ativas, Revogadas) |
| **Menu** | Adicionado item "Auditoria" para admin/superadmin |
| **Alertas** | Tradução "Acknowledge" → "Reconhecer"; remoção dos 3 SummaryCards (Critical, Warning, Info) |

---

## 2. Arquivos modificados

- `apps/web/app/login/page.tsx`
- `apps/web/app/sessions/page.tsx`
- `apps/web/app/layout.tsx`
- `apps/web/app/alerts/page.tsx`
- `apps/web/package.json` (versão 0.1.1 → 0.1.2)

---

## 3. Itens da Onda 1 concluídos

- [x] LOGIN — PageHero stats e seção Controle de acesso removidos
- [x] SESSIONS — 3 cards duplicados removidos
- [x] MENU — Auditoria adicionada para admin/superadmin
- [x] ALERTAS — "Reconhecer" + remoção de 3 SummaryCards (Critical, Warning, Info)

---

## 4. Comandos/build/redeploy executados

```bash
docker compose build web
docker compose up -d web
```

Container `monitor-pfsense-web-1` recriado e iniciado.

---

## 5. Testes executados

- `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8088/login` → 200
- Verificação do HTML do login: PageHero simplificado, formulário presente, sem cards técnicos
- `scripts/run-smoke-suite.sh` — smoke-frontend-assets OK, smoke-agent-release OK, smoke-realtime-refresh OK, smoke-auth-sessions OK
- smoke-bootstrap-flow e smoke-admin-operations requerem AUTH_EMAIL/AUTH_PASSWORD em .env.api para execução completa

---

## 6. Resultado dos testes

- **Login:** Página carrega corretamente, layout simplificado
- **Sessions:** PageHero + lista preservados
- **Menu:** Item Auditoria visível apenas para ADMIN_ROLES (admin/superadmin)
- **Alertas:** Botão "Reconhecer", 3 cards (Open, Acknowledged, Resolved)
- **Build:** `docker compose build web` concluído com sucesso

---

## 7. Versão/documentação atualizada

- Versão do painel: **0.1.2** (layout.tsx, package.json)
- Documento de entrega: `docs/33-ENTREGA-ONDA-1-SIMPLIFICACAO-2026-03-15.md`

---

## 8. Pendências ou riscos residuais

- **Nenhum** no escopo da Onda 1
- Onda 2 e 3 não foram implementadas (conforme solicitado)

---

## Próximo passo recomendado

- Validar manualmente as telas alteradas (login, sessions, alertas, menu com admin)
- Executar smoke suite completo com AUTH_EMAIL/AUTH_PASSWORD configurados em .env.api
- Planejar Onda 2 quando aprovado
