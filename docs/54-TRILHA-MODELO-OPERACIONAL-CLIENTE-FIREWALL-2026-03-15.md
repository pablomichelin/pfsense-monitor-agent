# Trilha: Correção do Modelo Operacional e Limpeza da Interface Administrativa

**Data:** 2026-03-15  
**Status:** Implementado e documentado  
**Versões:** Painel 0.1.12, API 0.1.3 (inalterada), Package 0.2.0 (inalterado)

---

## 1. Objetivo central

Alinhar a interface ao modelo operacional real do projeto:

- operar por **Cliente**
- dentro do cliente, operar por **Firewall**
- **Site** não existe como entidade visível na UX (pode existir internamente no backend por compatibilidade técnica, 100% invisível para o operador)

---

## 2. Decisão funcional aplicada

A UX principal do sistema trabalha apenas com:

- **Cliente**
- **Firewall**

Removido da interface operacional:

- Novo site
- Gestão manual de site
- Menu “Clientes e sites” (substituído por “Clientes”)
- Listagem visual de sites como entidade principal
- Textos explicando site para o usuário final
- Cards ou ações incentivando criação de site

Site permanece no backend quando necessário; criação e associação são automáticas (createNode com `client_id` usa ou cria site internamente).

---

## 3. Escopo implementado

### 3.1 Cadastro (/admin)

| Requisito | Implementação |
|-----------|----------------|
| Apenas Novo cliente e Novo firewall na superfície | Grid principal com só esses dois cards. |
| Remover “Novo site” da UX | Card e seção “Novo site” removidos; sem CTA nem texto operacional sobre site. |
| Cadastros avançados sem site | Seção avançada contém apenas Novo usuário e Token do agente. |
| CreateNode sem expor site | Formulário envia apenas `client_id`; backend resolve site (0/1/2+ sites) internamente; quando há 2+ sites, backend usa o primeiro site. |
| Token do agente sem “site” na lista | Opções do select exibem “cliente — node_uid” em vez de “cliente / site / node_uid”. |

- **Backend (admin.service.ts):** Quando apenas `client_id` é enviado e o cliente tem 2+ sites, o backend usa o primeiro site em vez de retornar 400. Assim a UX nunca precisa exibir seletor de site.
- **CreateNodeForm:** Removidos estado e select de site; sempre envia só `client_id`. Texto de ajuda sem menção a site.
- **AdminCadastroCards:** Removido card “Novo site”; removida dependência de `createSiteAction`; descrições dos cards sem “site”.
- **Admin page:** Descrição do hero sem “site”; atalho “Clientes e sites” → “Clientes” (link para `/admin/clientes`).

### 3.2 Usuários (/admin/usuarios)

| Requisito | Implementação |
|-----------|----------------|
| Página compacta, sem “parede de conteúdo” | Abas reais: **Usuarios** e **Sessoes**. |
| Primeira visualização compacta | Tab Usuários: lista em linha (email, nome, role, status, senha opcional, Salvar). |
| Sessões separadas | Tab Sessões: lista de sessões por usuário, com revogar; não domina a mesma dobra do cadastro. |
| Hero e textos reduzidos | Hero com 2 stats (Usuarios, Sessoes), descrição curta. |

- **AdminUsuariosTabs (client):** Componente com estado `tab`; tab Usuarios (formulários em linha compactos); tab Sessoes (blocos por usuário com sessões e botão Revogar).
- **admin/usuarios/page.tsx:** Passa usuários e sessões (como `Record<string, SessionItem[]>`) para o componente de abas; hero compacto.

### 3.3 Clientes (ex–Clientes e sites)

| Requisito | Implementação |
|-----------|----------------|
| Nome alinhado ao uso real | Área renomeada para **Clientes**; rota `/admin/clientes`. |
| Não listar sites como protagonista | Coluna “Editar sites” removida. Apenas “Editar clientes” (clientes ativos). |
| Apenas entidades ativas/úteis | Listagem mostra só clientes com `status === 'active'`. Inativos citados em bloco separado (contagem), sem lista operacional. |
| Firewalls visíveis por cliente | Por cliente: “N firewalls” + link “Ver no inventario” (`/nodes?client_id=...`). |

- **Nova rota /admin/clientes:** Página que usa `getNodesFilters` e `getNodesList`; lista apenas clientes ativos com formulário de edição (nome, código, status); exibe `node_count` e link para inventário filtrado.
- **Redirect /admin/clientes-sites → /admin/clientes:** Mantida compatibilidade de links antigos.
- **Nav e atalhos:** Item de menu “Clientes” (href `/admin/clientes`); atalho na página Cadastro atualizado.

---

## 4. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `apps/api/src/admin/admin.service.ts` | createNode: quando `client_id` e 2+ sites, usar primeiro site (não retornar 400). |
| `apps/web/components/create-node-form.tsx` | Removido select e estado de site; sempre envia `client_id`; texto sem “site”. |
| `apps/web/components/admin-cadastro-cards.tsx` | Removido card Novo site; removido createSiteAction; descrições sem site; token options “cliente — node_uid”. |
| `apps/web/app/admin/page.tsx` | Descrição hero sem site; atalho Clientes → /admin/clientes. |
| `apps/web/app/layout.tsx` | Nav: “Clientes” (href /admin/clientes); versão 0.1.12. |
| `apps/web/app/admin/clientes/page.tsx` | **Novo** — página Clientes: só clientes ativos, edição, link para inventário. |
| `apps/web/app/admin/clientes-sites/page.tsx` | Substituído por redirect para /admin/clientes. |
| `apps/web/app/admin/usuarios/page.tsx` | Hero compacto; uso de AdminUsuariosTabs; dados serializáveis. |
| `apps/web/components/admin-usuarios-tabs.tsx` | **Novo** — abas Usuarios e Sessoes; formulários compactos; sessões por usuário. |
| `apps/web/package.json` | Versão 0.1.10 → 0.1.12. |

---

## 5. Versões

| Componente | Versão |
|------------|--------|
| **Painel** | 0.1.11 → **0.1.12** |
| **API** | 0.1.3 (inalterada) |
| **Package pfSense** | 0.2.0 (inalterado) |

---

## 6. Restrições respeitadas

- Nenhuma alteração em heartbeat, ingest, package.
- Backend: apenas mudança mínima em createNode (uso do primeiro site quando 2+), sem alterar assinaturas públicas.
- Compatibilidade: createNode continua aceitando `site_id`; chamadas que enviam `site_id` seguem válidas.
- Rotas antigas: /admin/clientes-sites redireciona para /admin/clientes.

---

## 7. Critérios de aceitação

### Cadastro
- Existem apenas “Novo cliente” e “Novo firewall” como ações principais.
- “Novo site” não aparece em nenhum lugar da UX.
- Nenhuma ação operacional visível para site.

### Usuários
- Página compacta com abas Usuarios e Sessoes.
- Sem parede de conteúdo; navegação óbvia.

### Clientes
- Página não lista sites como protagonista.
- Exibe apenas clientes ativos para operação; inativos apenas citados.
- Modelo Cliente → Firewall (link para inventário).

### Documentação
- Nova doc (este arquivo); 00_inicio, LEITURA-INICIAL e 00-README atualizados; versão 0.1.12.

---

## 8. Validação

- `npm run build` em `apps/web` concluído com sucesso.
- Rotas `/admin`, `/admin/clientes`, `/admin/clientes-sites` (redirect), `/admin/usuarios` geradas.

---

## 9. Referências

- `00_inicio.md` — trilhas encerradas, próxima tarefa
- `LEITURA-INICIAL.md` — estado atual
- `CORTEX.md` — regras do projeto
- `docs/47-SIMPLIFICACAO-MODELO-CADASTRO-CLIENTE-FIREWALL-2026-03-15.md`
- `docs/49-ENTREGA-DESMEMBRAMENTO-INTERFACE-ADMIN-2026-03-15.md`
- `docs/53-ENTREGA-SIMPLIFICACAO-VISUAL-CADASTRO-AUDIT-BOOTSTRAP-2026-03-15.md`
