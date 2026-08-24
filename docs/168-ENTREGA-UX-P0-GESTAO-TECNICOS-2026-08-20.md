# 168 — UX P0: reorganização gestão de técnicos

**Data:** 2026-08-20  
**Versão:** painel **1.10.15**

## Objetivo

Reduzir confusão na tela de gestão de técnicos em `/nodes` e `/admin/tecnicos`: cadastro separado de ação em lote, seleção unificada, layout em coluna e rótulos sem ambiguidade.

## Mudanças (somente painel)

- Abas **Técnicos** e **Ação em lote** (com contagem de firewalls selecionados).
- Seleção do técnico por **clique na linha** da tabela (badge “selecionado”); removido dropdown duplicado na ação.
- Cadastro via botão **+ Novo técnico** (modal) em vez de formulário no rodapé.
- Ação em lote em **coluna única** (`max-w-lg`): senha, checkbox “Gerar senha automaticamente”, opções avançadas em `<details>`.
- Barra de contexto: alvo + técnico ativo + botão Trocar.
- Renomeações:
  - **Alterar senha** (antes “Resetar senha”)
  - **Remover dos firewalls** (antes “Excluir”)
  - **Remover do cadastro** (cadastro central, distinto da remoção nos pfSense)
- Auto-switch para aba **Ação em lote** quando há firewalls selecionados.
- Atalho “Ir para ação em lote” após selecionar técnico com seleção ativa.

## Sem alteração de contrato

- Server Actions, payloads de API e fluxos de confirmação `CONFIRMAR` inalterados.
- Comportamento de senha vazia = gerada automaticamente preservado quando checkbox desligado e campo vazio.

## Arquivo alterado

- `apps/web/components/nodes/fleet-technician-management-panel.tsx`
