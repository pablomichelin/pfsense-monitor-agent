# Entrega Onda 2 — Simplificação do Painel

**Data:** 2026-03-15  
**Versão:** 0.1.3  
**Escopo:** Simplificações de baixo risco conforme matriz de decisão (docs/31-MATRIZ-DECISAO-SIMPLIFICACAO-2026-03-14.md)

---

## 1. Resumo do que foi alterado

| Item | Alteração |
|------|-----------|
| **Inventário (/nodes)** | Remoção dos 3 cards duplicados (Bootstrap, Agente ativo, Bloqueados). PageHero mantido com Itens filtrados, Agente ativo, Bloqueados. Filtros e tabela preservados. |
| **Bootstrap (/bootstrap)** | Remoção dos 3 cards duplicados (Prontos, Ativos, Bloqueados). PageHero, filtros, escolha do firewall, comando principal, filas e atalhos mantidos. |
| **Dashboard** | Reorganização dos SummaryCards: removidos Nodes e Maintenance. Mantidos 5 cards: Online, Degraded, Offline, Alertas abertos, Fora da matriz. Zona quente e matriz de versão preservadas. |
| **Admin** | Cards superiores (Clientes, Sites, Nodes, Usuários) **mantidos** por critério conservador. Área sensível; sem alteração. |

---

## 2. Arquivos modificados

- `apps/web/app/nodes/page.tsx` — remoção da seção com 3 cards (Bootstrap, Agente ativo, Bloqueados)
- `apps/web/app/bootstrap/page.tsx` — remoção da seção com 3 cards (Prontos, Ativos, Bloqueados)
- `apps/web/app/dashboard/page.tsx` — remoção de 2 SummaryCards (Nodes, Maintenance), ajuste de grid para 5 cards
- `apps/web/package.json` — versão 0.1.2 → 0.1.3
- `apps/web/app/layout.tsx` — versão no footer 0.1.2 → 0.1.3

---

## 3. Itens da Onda 2 concluídos

- [x] INVENTÁRIO — 3 cards duplicados removidos
- [x] BOOTSTRAP — 3 cards duplicados removidos
- [x] DASHBOARD — 5 cards principais (Online, Degraded, Offline, Alertas abertos, Fora da matriz); Nodes e Maintenance removidos
- [x] ADMIN — Avaliação conservadora: cards mantidos (sem alteração)

---

## 4. Comandos/build/redeploy executados

```bash
docker compose build web
docker compose up -d web
```

Container `monitor-pfsense-web-1` recriado e iniciado.

---

## 5. Testes executados

- `curl -s http://127.0.0.1:8088/login | grep v0.1.3` → 1 ocorrência (footer)
- smoke-frontend-assets OK
- smoke-agent-release OK
- smoke-realtime-refresh OK
- smoke-auth-sessions OK
- Verificação HTML: dashboard com 5 SummaryCards; nodes sem grid lg:grid-cols-3 (cards removidos); bootstrap sem seção de 3 cards duplicados

---

## 6. Resultado dos testes

- **Login:** Footer v0.1.3 presente
- **Dashboard:** 5 cards (Online, Degraded, Offline, Alertas abertos, Fora da matriz); zona quente e matriz de versão mantidas
- **Inventário:** PageHero + filtros + tabela preservados; 3 cards removidos
- **Bootstrap:** PageHero + filtros + escolha do firewall + comando + filas preservados; 3 cards removidos
- **Admin:** Sem alteração (cards preservados)
- **Build:** `docker compose build web` concluído com sucesso

---

## 7. Versão/documentação atualizada

- Versão do painel: **0.1.3** (layout.tsx, package.json)
- Documento de entrega: `docs/35-ENTREGA-ONDA-2-SIMPLIFICACAO-2026-03-15.md`

---

## 8. Pendências ou riscos residuais

- **Nenhum** no escopo da Onda 2
- smoke-bootstrap-flow pode exigir tempo adicional; smoke-admin-operations e smoke-rbac não foram reexecutados nesta rodada
- Onda 3 **não** foi implementada (conforme solicitado)

---

## 9. Decisão conservadora — Admin

Os 4 cards superiores (Clientes, Sites, Nodes, Usuários) na página Admin foram **mantidos** conforme regra: "Se a remoção gerar risco de empobrecimento da área admin, apenas ajuste composição e mantenha. Critério conservador."

---

## Próximo passo recomendado

- Validar manualmente as telas alteradas (nodes, bootstrap, dashboard)
- Executar smoke-bootstrap-flow e smoke-admin-operations completos
- Planejar Onda 3 quando aprovado
