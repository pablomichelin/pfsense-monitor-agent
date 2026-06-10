# Entrega: Polimento do Cadastro Inicial no Admin

**Data:** 2026-03-15  
**Status:** Implementado  
**Versões:** Painel 0.1.10, API 0.1.3 (inalterada), Package 0.2.0 (inalterado)

---

## 1. Resumo do que foi simplificado no /admin

- **Antes:** Cinco formulários completos sempre visíveis (Novo cliente, Novo firewall, Novo usuário, Token do agente, Novo site), gerando “parede de cadastro”.
- **Depois:** Cada card exibe, por padrão, apenas **título + descrição + botão de ação** (ex.: “Criar cliente”, “Criar firewall”). Ao clicar no botão, o card expande e mostra o formulário no mesmo lugar. **Apenas um card expandido por vez** (ao abrir outro, o anterior recolhe).
- **Auto-expansão:** Se a URL tiver `?section=client|node|user|agent-token|site` (redirect após criar), o card correspondente abre ao carregar para exibir a mensagem de sucesso/erro.
- Card “Governança de usuários” (quando a sessão não é superadmin) permanece estático, sem expandir (só conteúdo informativo).

---

## 2. Solução adotada para reduzir o peso visual

**Formulários sob demanda por card (acordeão leve):**

- Componente **AdminCollapsibleCard**: card reutilizável com título, descrição e, quando colapsável, botão de ação ou formulário + link “Fechar” conforme o estado.
- Componente **AdminCadastroCards** (client): mantém o estado `expandedSection` (qual card está aberto); renderiza os cinco cards (quatro no grid principal + um em “Cadastros avançados”) e os formulários quando expandidos; inicializa o estado com `activeSection` da URL quando presente.
- Nenhuma nova rota, modal ou drawer; mesma API e server actions.

---

## 3. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `apps/web/components/admin-collapsible-card.tsx` | **Novo** — Card colapsável com título, descrição, actionLabel, estado expandido e children (form). Opção `collapsible={false}` para card estático. |
| `apps/web/components/admin-cadastro-cards.tsx` | **Novo** — Client component com estado `expandedSection`; renderiza os 5 cards (cliente, firewall, usuário ou RBAC, token, site) e os formulários; importa actions de `@/lib/admin`. |
| `apps/web/app/admin/page.tsx` | Removidos Card local e formulários inline; passa a renderizar apenas PageHero, Atalhos e `<AdminCadastroCards ... />` com dados e params da URL. |
| `apps/web/package.json` | Versão 0.1.9 → 0.1.10 |
| `apps/web/app/layout.tsx` | Footer: v0.1.9 → v0.1.10 |

---

## 4. Versões atualizadas

- **Painel:** 0.1.9 → **0.1.10**
- **API:** 0.1.3 (inalterada)
- **Package:** 0.2.0 (inalterado)

---

## 5. Evidências de validação

- `npm run build` em `apps/web` concluído com sucesso (Next.js 15.5.12).
- Rotas `/admin`, `/admin/usuarios`, `/admin/clientes-sites` e demais inalteradas.
- Nenhuma alteração em `apps/api`, package pfSense, RBAC ou fluxos de bootstrap/exclusão.
- Comportamento: cards fechados por padrão; um clique em “Criar X” abre o formulário; abrir outro card fecha o anterior; `?section=node` abre o card “Novo firewall” ao carregar.

---

## 6. Documentação criada/atualizada

- **Criado:** `docs/50-ANALISE-POLIMENTO-CADASTRO-INICIAL-ADMIN-2026-03-15.md` (análise e decisão).
- **Criado:** `docs/51-ENTREGA-POLIMENTO-CADASTRO-INICIAL-ADMIN-2026-03-15.md` (este arquivo).
- **A atualizar:** `00_inicio.md`, `LEITURA-INICIAL.md`, `00-README.md` com registro da trilha e versão 0.1.10.

---

## 7. Riscos remanescentes

- **Muito baixo:** Comportamento puramente de apresentação; mesma página, mesmas actions e formulários; sem mudança de contrato. Nenhuma alteração em trilhas encerradas (docs 44–49).

---

## 8. Referências

- `docs/50-ANALISE-POLIMENTO-CADASTRO-INICIAL-ADMIN-2026-03-15.md`
- `docs/49-ENTREGA-DESMEMBRAMENTO-INTERFACE-ADMIN-2026-03-15.md`
- `00_inicio.md`, `CORTEX.md`
