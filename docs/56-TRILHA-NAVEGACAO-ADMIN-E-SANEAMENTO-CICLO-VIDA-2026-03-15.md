# Trilha: Correção de Navegação Administrativa e Saneamento do Ciclo de Vida

**Data:** 2026-03-15  
**Status:** Implementado e documentado  
**Versões:** Painel 0.1.14, API 0.1.4, Package 0.2.0 (inalterado)

---

## 1. Objetivo da trilha

Corrigir quatro problemas observados no uso do portal, após a consolidação do modelo operacional Cliente → Firewall:

1. **Minha conta** ainda gigante (cards altos, pouca densidade).
2. **Menu** marcando Cadastro + Usuários ou Cadastro + Clientes ao mesmo tempo.
3. **Usuários residuais** (teste, smoke, de firewalls removidos) dominando a listagem.
4. **Clientes/firewalls removidos** ou inativos continuando a aparecer; deleção não limpando o que deveria.

---

## 2. Escopo implementado

### 2.1 Estado ativo do menu (Escopo 2)

| Problema | Solução |
|----------|---------|
| Em `/admin/usuarios` ficavam ativos Cadastro e Usuários | Apenas o item cujo `href` é o **prefixo mais longo** da rota atual fica ativo. |
| Em `/admin/clientes` ficavam ativos Cadastro e Clientes | Regra: match exato ou longest matching path wins. |

- **Arquivo:** `apps/web/components/app-nav.tsx`
- **Lógica:** `getActiveHref(pathname, items)` retorna o `href` mais longo que ainda é prefixo de `pathname`. Apenas esse item recebe `isActive`.
- **Resultado:** Em `/admin` só Cadastro ativo; em `/admin/usuarios` só Usuários; em `/admin/clientes` só Clientes.

### 2.2 Minha conta / Sessões (Escopo 1)

| Problema | Solução |
|----------|---------|
| Hero com 3 stats e descrição longa | Hero com 2 stats (Ativas, Total) e descrição curta. |
| Cards grandes por sessão | Tabela compacta: uma linha por sessão. |
| Muito espaço vertical | Colunas: Status, Última atividade, Criação, Expiração, IP, Agente, Ação. Revogar em botão enxuto. |

- **Arquivo:** `apps/web/app/sessions/page.tsx`
- **Alterações:** Título "Minha conta"; `space-y-8` → `space-y-4`; seção em tabela responsiva; dados em formato curto (data/hora); ação "Revogar" em botão pequeno.
- **Resultado:** Página claramente mais compacta e operacional.

### 2.3 Gestão real de usuários (Escopo 3)

| Problema | Solução |
|----------|---------|
| Só "Salvar" por usuário | Editar (Salvar), desativar/ativar (status), **Deletar** com confirmação. |
| Usuários residuais dominando | Listagem padrão apenas **ativos**; link "Ver inativos" para inativos. |
| Sem exclusão de usuário | Backend: `DELETE /api/v1/admin/users/:id`; proteção: não deletar a si mesmo nem o último superadmin ativo. |

**Backend**

- **admin.service.ts:** `listUsers(query?: ListUsersQueryDto)` — filtro `status`: default `'active'`. `deleteUser(userId, actorId?, actorIp?)` — revoga sessões do usuário, grava auditoria, deleta usuário; bloqueia auto-exclusão e exclusão do último superadmin ativo.
- **admin.controller.ts:** `GET users?status=active|inactive`, `DELETE users/:id`.
- **dto/list-users-query.dto.ts:** `status?: 'active' | 'inactive'`.

**Frontend**

- **lib/api.ts:** `getUsersList(params?: { status?: 'active' | 'inactive' })`, `deleteUser(id)`.
- **lib/admin.ts:** `deleteUserAction(formData)`.
- **admin/usuarios/page.tsx:** Chama `getUsersList(showInactive ? { status: 'inactive' } : undefined)`. Link "Ver inativos" / "Ver apenas ativos". Passa `currentUserId` para as abas.
- **admin-usuarios-tabs.tsx:** Botão "Deletar" por linha (exceto para o próprio usuário); `confirm()` antes de enviar. Form com `deleteUserAction`.

**Resultado:** Página de usuários com gestão real; resíduos (inativos) fora da listagem principal; opção explícita para ver inativos.

### 2.4 Deleção e limpeza de resíduos (Escopo 4)

| Aspecto | Situação |
|---------|----------|
| Firewall (node) | Já era **hard delete** com cascade (credentials, tokens, heartbeats, services, gateways, alerts). Nenhuma alteração. |
| Cliente | Sem delete físico; uso de **status inactive**. Página Clientes já lista só ativos; inativos apenas citados em contagem. |
| Usuário | **deleteUser** implementado; revoga sessões e remove usuário; listagem padrão só ativos. |
| Listagens operacionais | Nodes: apenas existentes no banco. Clientes: apenas ativos na lista principal. Usuários: apenas ativos por padrão. |

- Nenhuma alteração em heartbeat, ingest ou package.
- Interface exibe apenas entidades existentes/ativas na operação diária; inativos acessíveis onde faz sentido (usuários: link "Ver inativos"; clientes: contagem).

---

## 3. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `apps/web/components/app-nav.tsx` | Longest-match para item ativo do menu. |
| `apps/web/app/sessions/page.tsx` | Hero reduzido; tabela compacta de sessões. |
| `apps/api/src/admin/dto/list-users-query.dto.ts` | **Novo** — query `status` para listUsers. |
| `apps/api/src/admin/admin.service.ts` | listUsers(query) com filtro status; deleteUser com proteções. |
| `apps/api/src/admin/admin.controller.ts` | GET users com Query; DELETE users/:id. |
| `apps/web/lib/api.ts` | getUsersList(params); deleteUser(id). |
| `apps/web/lib/admin.ts` | deleteUserAction. |
| `apps/web/app/admin/usuarios/page.tsx` | showInactive; getUsersList(showInactive ? { status: 'inactive' } : undefined); link Ver inativos/ativos; currentUserId. |
| `apps/web/components/admin-usuarios-tabs.tsx` | currentUserId; botão Deletar com confirmação; deleteUserAction. |
| `apps/web/package.json` | 0.1.13 → 0.1.14. |
| `apps/api/package.json` | 0.1.3 → 0.1.4. |
| `apps/web/app/layout.tsx` | Footer v0.1.14. |

---

## 4. Versões

| Componente | Versão |
|------------|--------|
| **Painel** | 0.1.13 → **0.1.14** |
| **API** | 0.1.3 → **0.1.4** |
| **Package pfSense** | 0.2.0 (inalterado) |

---

## 5. Restrições respeitadas

- Nenhuma alteração em heartbeat, ingest, package.
- Modelo Cliente → Firewall e UX não reabertos.
- Site não reintroduzido na UX.
- Correção mínima e segura no backend e frontend.
- Auditoria preservada (admin.user.delete, etc.).

---

## 6. Critérios de aceitação

### Menu
- Cadastro não fica ativo junto com Usuários/Clientes indevidamente.

### Minha conta
- Tela compacta; sem cards gigantes.

### Usuários
- Gestão real (editar, desativar, deletar); resíduos não dominam a listagem principal (padrão: ativos; "Ver inativos" opcional).

### Clientes / Firewalls
- Entidades deletadas (node) ou inativas (client) não aparecem na operação principal; listagens coerentes com ciclo de vida.

### Documentação
- Trilha documentada (este arquivo); índices e versões atualizados.

---

## 7. Referências

- `00_inicio.md` — trilhas encerradas, próxima tarefa
- `LEITURA-INICIAL.md` — estado atual
- `CORTEX.md` — regras do projeto
- `docs/54-TRILHA-MODELO-OPERACIONAL-CLIENTE-FIREWALL-2026-03-15.md`
- `docs/55-MICROTRILHA-VARREDURA-NOMENCLATURA-CLIENTE-FIREWALL-2026-03-15.md`
