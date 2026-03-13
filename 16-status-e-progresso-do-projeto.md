# Status e Progresso do Projeto

## Objetivo

Definir como o progresso do projeto sera acompanhado ao longo das fases e tarefas.

## Regra principal

O projeto deve sempre manter um status visivel de progresso.

Cada tarefa registrada deve informar:

- percentual da fase atual
- percentual do plano total

## Estrutura de acompanhamento

O acompanhamento deve existir em dois niveis:

### 1. Progresso da fase

Cada fase do roadmap tera:

- status textual
- percentual da fase

Exemplos:

- `nao iniciada`
- `em andamento`
- `bloqueada`
- `concluida`

Exemplo de exibicao:

- `Fase 1 - MVP do controlador: 100%`

### 2. Progresso total do plano

O projeto tambem deve manter um percentual consolidado do plano total.

Exemplo:

- `Plano total: 92%`

## Regra por tarefa

Cada tarefa relevante deve ser registrada no minimo com:

- nome
- fase
- status
- percentual da tarefa, quando aplicavel
- impacto na fase
- impacto no plano total

Formato minimo recomendado:

- `Tarefa: Homologar bootstrap inicial do agente`
- `Fase atual: 100%`
- `Plano total: 92%`

## Regra de atualizacao

Ao final de cada iteracao relevante:

- atualizar o status da fase atual
- atualizar o percentual total do plano
- registrar a tarefa concluida ou alterada

## Fonte de verdade

Os pontos de referencia para progresso devem ficar em:

- `12-roadmap-de-fases.md`
- `LEITURA-INICIAL.md`

Se houver um arquivo operacional de tarefas no futuro, ele deve seguir esta mesma regra.

## Regra de calculo

Diretriz inicial:

- usar progresso pragmatico por entregaveis concluidos
- evitar percentuais arbitrarios sem base em marcos reais

Recomendacao:

- cada fase deve ter entregas claras
- cada entrega concluida incrementa o percentual da fase
- o percentual total deriva da soma ponderada das fases

## Exibicao recomendada em novos chats

Ao retomar o projeto em um novo chat, informar no inicio:

- fase atual
- percentual da fase atual
- percentual total do plano
- tarefa em andamento

Snapshot atual de referencia em `2026-03-12`:

- fase atual: `Fase 1 - MVP do controlador`
- percentual da fase atual: `100%`
- percentual total do plano: `92%`
- tarefa em andamento: `retomar a homologacao do bootstrap inicial do agente em pfSense CE 2.8.1 real, com base na bateria local de smokes, no checklist operacional e no preflight automatizado do bootstrap`
- escopo do servidor/controlador: `100%`

## Decisao desta fase

Fica decidido que:

- o projeto tera status formal de progresso
- cada tarefa exibira percentual da fase e percentual do plano total
- esse controle passa a ser obrigatorio nas proximas iteracoes de desenvolvimento
