# Análise: Polimento do Cadastro Inicial no Admin

**Data:** 2026-03-15  
**Status:** Análise concluída — implementação autorizada  
**Versões de referência:** Painel 0.1.9, API 0.1.3, Package 0.2.0

---

## 1. Contexto

Após a trilha de desmembramento da interface administrativa (docs 48, 49), o `/admin` ficou enxuto em termos de quantidade de seções (sem tabela de nodes, sem tokens por node, sem usuários/edição de clientes-sites na mesma página). O peso visual residual vem dos **formulários de cadastro**: todos os cards (Novo cliente, Novo firewall, Novo usuário, Token do agente, Novo site) exibem o formulário completo sempre visível, gerando sensação de “parede de cadastro”.

## 2. Problema

- Cinco formulários completos visíveis ao mesmo tempo.
- CreateNodeForm (Novo firewall) é o mais pesado (muitos campos).
- Dificulta foco em uma ação única e deixa a tela carregada.

## 3. Objetivo da trilha

Deixar o `/admin` mais leve e orientado a ação: atalhos claros, ações de criação objetivas, **formulários sob demanda**, menos blocos grandes sempre visíveis.

## 4. Solução adotada

**Formulários sob demanda por card (acordeão leve):**

- Cada card continua no mesmo lugar.
- **Estado inicial:** título + descrição + botão de ação (ex.: “Criar cliente”, “Criar firewall”).
- **Ao clicar no botão:** o card expande e exibe o formulário no mesmo lugar; **apenas um card expandido por vez** (ao abrir outro, o anterior recolhe).
- **Auto-expansão:** se a URL tiver `?section=client|node|user|agent-token|site`, o card correspondente abre ao carregar (para exibir mensagem de sucesso/erro após redirect).

## 5. Escopo

- **Mínimo:** cards colapsáveis na página `/admin`; sem novas rotas, modal ou drawer; mesma API e actions.
- **Opcional (futuro):** acessibilidade (aria-expanded, foco), persistência do último card em sessionStorage, ou painel único com abas.

## 6. Risco

**Baixo:** apenas apresentação (mostrar/ocultar conteúdo); mesma página, mesmas server actions, mesmos formulários; sem alteração de API, RBAC ou rotas.

## 7. Referências

- `docs/48-ANALISE-DESMEMBRAMENTO-INTERFACE-ADMIN-2026-03-15.md`
- `docs/49-ENTREGA-DESMEMBRAMENTO-INTERFACE-ADMIN-2026-03-15.md`
- `docs/47-SIMPLIFICACAO-MODELO-CADASTRO-CLIENTE-FIREWALL-2026-03-15.md`
- `00_inicio.md`, `CORTEX.md`
