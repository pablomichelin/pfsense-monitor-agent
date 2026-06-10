# Entrega: Desmembramento da Interface Administrativa e Hierarquia de Telas

**Data:** 2026-03-15  
**Status:** Implementado (Fases 1, 2 e 3)  
**Versões:** Painel 0.1.9, API 0.1.3 (inalterada), Package 0.2.0 (inalterado)

---

## 1. Resumo do que foi reorganizado

- **Dashboard** (`/dashboard`): mantido como estava; sem alterações de escopo.
- **Cadastro** (`/admin`): página enxuta com apenas cadastro inicial (Novo cliente, Novo firewall, Novo usuário, Token do agente, Novo site em avançado), bloco de atalhos e sem tabelas/seções pesadas.
- **Inventário**: permanece em `/nodes`; removida do admin a tabela “Últimos nodes”; substituída por link “Ver firewalls”.
- **Usuários**: nova tela `/admin/usuarios` (superadmin) com lista de usuários, edição inline e gestão de sessões por usuário.
- **Clientes e sites**: nova tela `/admin/clientes-sites` (admin/superadmin) com edição de clientes e edição de sites.
- **Tokens**: removida do admin a seção “Tokens do agente por node recente”; emissão de token permanece no admin; listar/revogar tokens segue no detalhe do firewall (`/nodes/[id]`).
- **Navegação**: itens “Usuários” (superadmin) e “Clientes e sites” (admin) adicionados ao menu; atalhos na própria página `/admin` para Ver firewalls, Usuários, Clientes e sites, Auditoria.

---

## 2. Nova divisão de telas

| Área | Rota | Conteúdo |
|------|------|----------|
| Dashboard | `/dashboard` | Resumo, zona quente, matriz, lista operacional (inalterado) |
| Cadastro inicial | `/admin` | Hero com stats (Clientes, Sites, Firewalls, Usuários); atalhos; Novo cliente, Novo firewall, Novo usuário, Token, Novo site |
| Usuários | `/admin/usuarios` | Lista de usuários, edição, sessões por usuário, revogar (superadmin) |
| Clientes e sites | `/admin/clientes-sites` | Editar clientes, editar sites (admin/superadmin) |
| Inventário | `/nodes` | Lista de firewalls com filtros e exclusão (inalterado) |
| Detalhe firewall | `/nodes/[id]` | Bootstrap, tokens, rekey, etc. (inalterado) |
| Auditoria | `/audit` | Leitura de eventos (inalterado) |

---

## 3. O que saiu de cada tela

**Da página `/admin` (antes uma única página longa):**

- Removido: grid de 4 cards grandes (Clientes, Sites, Nodes, Usuários) — substituído por stats no hero.
- Removido: tabela “Últimos nodes no inventário” — substituído por link “Ver firewalls” → `/nodes`.
- Removido: seção “Tokens do agente por node recente” — listar/revogar tokens permanece no detalhe do node.
- Removido: seção “Usuários e papéis” (lista + edição + sessões) — movida para `/admin/usuarios`.
- Removido: grid “Editar clientes” e “Editar sites” — movido para `/admin/clientes-sites`.
- Adicionado: bloco “Atalhos” com links para Ver firewalls, Usuários, Clientes e sites, Auditoria.
- Hero: stats passam a incluir Clientes, Sites, Firewalls, Usuários em linha (sem 4 cards separados).

---

## 4. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `apps/web/lib/admin.ts` | `buildAdminRedirectUrl` e `adminRedirect` com `returnTo` opcional; `updateClientAction`, `updateSiteAction`, `updateUserAction`, `revokeUserSessionAdminAction` passam `returnTo` e revalidam `/admin/usuarios` e `/admin/clientes-sites` |
| `apps/web/app/admin/page.tsx` | Removidas tabela de nodes, seção de tokens por node, usuários e papéis, editar clientes/sites; hero com 4 stats; bloco Atalhos; uso de `AdminSectionMessage` |
| `apps/web/app/admin/usuarios/page.tsx` | **Novo** — lista usuários, edição com `returnTo`, sessões por usuário, revogar (superadmin) |
| `apps/web/app/admin/clientes-sites/page.tsx` | **Novo** — editar clientes e editar sites com `returnTo` (admin/superadmin) |
| `apps/web/components/admin-section-message.tsx` | **Novo** — componente compartilhado de mensagem por seção |
| `apps/web/app/layout.tsx` | Novos itens de nav: Usuários (superadmin), Clientes e sites (admin); versão 0.1.9 |
| `apps/web/package.json` | Versão 0.1.8 → 0.1.9 |

---

## 5. Versões atualizadas

- **Painel:** 0.1.8 → **0.1.9**
- **API:** 0.1.3 (inalterada)
- **Package:** 0.2.0 (inalterado)

---

## 6. Evidências de validação

- `npm run build` em `apps/web` concluído com sucesso (Next.js 15.5.12).
- Rotas geradas: `/admin`, `/admin/usuarios`, `/admin/clientes-sites`, demais inalteradas.
- Nenhuma alteração em `apps/api`, package pfSense ou fluxos de bootstrap/exclusão.

---

## 7. Documentação criada/atualizada

- **Criado:** `docs/48-ANALISE-DESMEMBRAMENTO-INTERFACE-ADMIN-2026-03-15.md` (análise e proposta).
- **Criado:** `docs/49-ENTREGA-DESMEMBRAMENTO-INTERFACE-ADMIN-2026-03-15.md` (este arquivo).
- **A atualizar:** `00_inicio.md`, `LEITURA-INICIAL.md`, `00-README.md` com registro da trilha e versão 0.1.9.

---

## 8. Riscos remanescentes

- **Baixo:** formulários em `/admin/usuarios` e `/admin/clientes-sites` usam `returnTo` em hidden input; se o usuário alterar o valor, o redirect pode ir para outra rota — restrito a caminhos que começam com `/admin` no servidor.
- **Nenhuma** alteração em contratos de API, RBAC ou trilhas encerradas (docs 44–47).

---

## 9. Referências

- `docs/48-ANALISE-DESMEMBRAMENTO-INTERFACE-ADMIN-2026-03-15.md`
- `00_inicio.md` — trilhas encerradas
- `CORTEX.md` — regras do projeto
