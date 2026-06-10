# Trilha: Correção REAL da Semântica de Deleção e Saneamento dos Dados Operacionais

**Data:** 2026-03-15  
**Status:** Implementado  
**Versões:** Painel 0.1.15, API 0.1.5, Package 0.2.0 (inalterado)

---

## 1. Contexto

A trilha anterior (doc 56) não foi concluída de fato na validação em navegador: apenas o item ativo do menu funcionou. Esta trilha corrige de forma definitiva:

- listagens contaminadas por entidades deletadas/inativas
- erro técnico do delete de usuário
- exibição de resíduos em Minha conta e em listagens operacionais

Regra operacional obrigatória: o sistema deve manter visíveis apenas informações de clientes e firewalls existentes de fato. Não deixar resíduos operacionais visíveis de entidades deletadas.

---

## 2. O que foi realmente corrigido

### 2.1 Delete de usuário (Escopo 1)

**Problema:** Ao clicar em Deletar usuário, ocorria:  
`Body cannot be empty when content-type is set to 'application/json'`

**Causa:** O frontend enviava `DELETE` com header `Content-Type: application/json` e sem body; o Fastify (ou pipeline) rejeitava.

**Correções:**

- **Frontend (`apps/web/lib/api.ts`):** Só incluir `Content-Type: application/json` quando há body. Para `DELETE` sem body, não enviar esse header.
- **Backend (`apps/api/src/main.ts`):** No hook `preParsing`, tratar também `DELETE` com `application/json` e body vazio (injetar `{}`), além do já existente para `POST`.

**Critério de aceitação:** Deletar usuário funciona sem erro, com confirmação, sem quebrar proteção contra auto-delete ou exclusão do último superadmin.

---

### 2.2 Listagem de clientes (Escopo 3)

**Problema:** Clientes deletados (inativos) continuavam aparecendo na operação.

**Causa:** `GET /api/v1/nodes/filters` (getFilters) retornava todos os clientes e sites, sem filtrar por status. A página /admin/clientes filtrava no frontend, mas outros consumidores (dropdowns, etc.) e a própria página podiam receber inativos.

**Correções:**

- **Backend (`apps/api/src/nodes/nodes.service.ts`):**
  - Clientes: `where: { status: 'active' }`.
  - Sites: `where: { status: 'active', client: { status: 'active' } }`.
  - Inclusão de sites nos clientes: apenas sites ativos.
  - Resposta passou a incluir `inactive_client_count` (count de clientes inativos) para a página de Clientes exibir "Inativos (N)" sem listar inativos.
- **Frontend:** Tipo `NodesFiltersResponse` com `inactive_client_count` opcional; página `/admin/clientes` usa `filterOptions.clients` (todos ativos) e `filterOptions.inactive_client_count` para o bloco "Inativos (N)".

**Critério de aceitação:** Cliente inativo/deletado não aparece na listagem operacional principal; apenas clientes ativos são retornados em getFilters.

---

### 2.3 Minha conta / Sessões (Escopo 4)

**Problema:** Minha conta ainda mostrava entradas antigas (ex.: sessões já revogadas), poluindo a tela operacional.

**Causa:** `GET /api/v1/auth/sessions` (listSessions) retornava todas as sessões do usuário, incluindo revogadas.

**Correção:**

- **Backend (`apps/api/src/auth/auth.service.ts`):** listSessions passou a filtrar `revokedAt: null`. Apenas sessões não revogadas são retornadas (ativas ou expiradas mas não revogadas). Ordenação por `createdAt` desc.

**Critério de aceitação:** Minha conta não exibe sessões revogadas; apenas sessões operacionalmente relevantes (não revogadas).

---

### 2.4 Listagem de usuários (Escopo 2)

**Situação:** A listagem de usuários já estava filtrando por padrão apenas ativos (`listUsers` com `status: 'active'`). Usuários inativos só aparecem com "Ver inativos". Não foi necessária alteração adicional além da correção do delete.

**Critério de aceitação:** Tela de usuários não exibe entulho operacional; resíduos inativos só com opção explícita "Ver inativos".

---

### 2.5 Deleção e cleanup (Escopo 5)

**Revisão:**

- **Firewall (node):** Continua hard delete com cascade (credentials, tokens, heartbeats, services, gateways, alerts). Nenhuma alteração.
- **Cliente:** Não há delete físico; "deletado" = status inactive. getFilters agora retorna só ativos; inativos não aparecem nas listagens operacionais.
- **Usuário:** deleteUser já implementado (revoga sessões, remove usuário); listagem padrão só ativos; delete corrigido (body/Content-Type).
- **Sessões humanas:** listSessions só retorna não revogadas.

Nenhuma alteração em heartbeat, ingest ou package.

---

## 3. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `apps/web/lib/api.ts` | Content-Type só quando há body; tipo `NodesFiltersResponse` com `inactive_client_count` opcional. |
| `apps/api/src/main.ts` | Hook preParsing: tratar DELETE com application/json e body vazio (injetar `{}`). |
| `apps/api/src/nodes/nodes.service.ts` | getFilters: clientes e sites apenas status active; count inativos; retorno com `inactive_client_count`. |
| `apps/api/src/auth/auth.service.ts` | listSessions: `where: { revokedAt: null }`. |
| `apps/web/app/admin/clientes/page.tsx` | Usar apenas `filterOptions.clients` e `filterOptions.inactive_client_count` para ativos e bloco Inativos. |
| `apps/web/package.json` | 0.1.14 → 0.1.15. |
| `apps/api/package.json` | 0.1.4 → 0.1.5. |
| `apps/web/app/layout.tsx` | Footer v0.1.15. |

---

## 4. Versões

| Componente | Versão |
|------------|--------|
| **Painel** | 0.1.14 → **0.1.15** |
| **API** | 0.1.4 → **0.1.5** |
| **Package pfSense** | 0.2.0 (inalterado) |

---

## 5. Restrições respeitadas

- Nenhuma alteração em heartbeat, package, ingest.
- Site não reintroduzido na UX.
- Correção no backend e no frontend; não mascaramento por layout.
- Auditoria técnica preservada no contexto correto.

---

## 6. Validação manual recomendada

1. **Delete de usuário:** Em /admin/usuarios, clicar em Deletar em um usuário (não o próprio); confirmar; deve concluir sem erro "Body cannot be empty".
2. **Clientes:** Em /admin/clientes, verificar que só aparecem clientes ativos; inativos apenas na contagem "Inativos (N)" se houver.
3. **Minha conta:** Em /sessions, verificar que só aparecem sessões não revogadas (ativas ou expiradas sem revogação).
4. **Usuários:** Em /admin/usuarios, listagem principal só usuários ativos; "Ver inativos" para os demais.

---

## 7. Referências

- `docs/56-TRILHA-NAVEGACAO-ADMIN-E-SANEAMENTO-CICLO-VIDA-2026-03-15.md`
- `00_inicio.md`, `LEITURA-INICIAL.md`, `CORTEX.md`, `00-README.md`
