# 201 — Plano-base de reorganização funcional e visual do Monitor pfSense

**Data:** 2026-11-02

**Baseline de código:** `0f52839` · web `1.14.1` · API `0.13.1` · package `0.5.26`

**Escopo:** apresentação e interação em `apps/web`, documentação e validação dirigida.

**Motivo:** a auditoria visual identificou telas compridas, filtros repetidos, formulários simultâneos e comandos de instalação duplicados. O plano 170 e a entrega 171 já implantaram a navegação inicial; este plano atua sobre os problemas restantes.

## Objetivo e ordem de execução

Facilitar o uso diário sem perder nenhuma função ou informação. Prioridade visual: decisão operacional → ação primária → detalhes sob demanda. O plano precede a implementação e define como aceitar ou reverter cada bloco.

| Bloco | Tela | Problema verificado | Melhoria proposta | Preservação obrigatória |
|---|---|---|---|---|
| A, P0 | `/admin/usuarios` | Uma ficha/formulário completa e matriz de clientes para cada usuário | Lista compacta pesquisável, painel de edição de uma pessoa por vez, sessões identificadas | Email, nome, perfil, status, clientes únicos e múltiplos, senha, MFA, sessões/revogação, exclusão com confirmação, RBAC e Server Actions |
| B, P0 | `/nodes` | Dois formulários GET replicam cliente, status e busca, alterando filtros inadvertidamente | Formulário único com filtros principais e avançados expandíveis; chips contextuais | Presets, cliente/site/status/tag/grupo/criticidade/busca, ordenação, cursor, colunas, seleção e ações em lote, permissões |
| C, P0 | `/bootstrap` | Comando principal duplicado em duas áreas da mesma página; contexto e diagnóstico misturados | Fluxo em etapas: filtrar/escolher, instalar, verificar; comandos únicos e diagnósticos recolhíveis | Escolha explícita, paginação, modos normal/light, overrides, preflight, verificação, instalação, desinstalação, evidência, URLs e links |
| D, P1 | `/alerts` | Indicadores repetidos e fichas muito altas | Indicadores sem repetição, cartões de alerta compactos e detalhes contextuais | Filtros, busca, paginação, vínculo ao firewall, metadados, reconhecimento e resolução, anotações e permissões |
| E, P1 | Shell, dashboard, detalhes e administração | Hierarquia irregular em alguns fluxos | Consistência de espaçamento, estados e opções avançadas, após blocos críticos | Rotas, abas, KPIs, alarmes, backup, opções de técnicos, notificações, tema e sessão |

## Contratos intocáveis

- Sem alterações na API, banco, migrations, SSE, workers, package, firewalls ou infraestrutura.
- Não modificar cálculo de saúde nem atuar nos **oito firewalls persistentemente degradados**. HA/CARP está fora do escopo.
- Não executar comandos reais em firewalls, instalação, alteração de usuários ou backups reais na validação visual.
- Preservar toda ação sensível com a confirmação atual; preservar RBAC por usuário/cliente e contratos de Server Actions.
- Preservar URLs, nomes dos parâmetros, retorno das ações, filtros, cursores e ordenação; não introduzir estado perdido ao abrir/fechar painéis.
- Temas claro/escuro, teclado, foco, leitores de tela, mobile e desktop fazem parte do aceite.
- Zabbix, Theo, nginx, ISPConfig e demais serviços do host 221 permanecem fora do escopo.

## Critérios de aceite por bloco

1. **A:** pesquisar por nome/email; um único formulário completo montado; alternar usuários sem herdar escopo/senha do anterior; exclusão impedida para a própria conta; sessões e revogação continuam acessíveis; leitura respeita permissões.
2. **B:** exatamente um controle com `name` por parâmetro de filtro; a busca mantém filtros avançados, preset e ordenação; filtros avançados ativos aparecem claramente; a paginação e o lote funcionam com os mesmos URLs.
3. **C:** exatamente um bloco visível do comando de instalação; firewall explicitamente selecionado nunca vira outro por engano; todos os comandos de diagnóstico/uninstall e overrides continuam alcançáveis.
4. **D:** dados de cada alerta ainda consultáveis, inclusive eventos resolvidos e campos técnicos; reconhecer/resolver com nota permanece íntegro; filtros e navegação não perdem parâmetros.
5. **E:** experiência consistente com cores semânticas e interações existentes; adiar mudanças cuja preservação não tenha sido demonstrada.

## Protocolo de validação sem reteste cumulativo

Implementar cada bloco integralmente; **somente então** executar uma validação dirigida do respectivo grupo. Havendo falha, corrigir e repetir apenas o teste afetado. Ao final, executar um typecheck e um build web e, se o ambiente permitir, um ciclo de navegação visual autenticado e responsivo, sem escritas operacionais. Registrar claramente o que foi comprovado e o que carece de ambiente; não reaproveitar screenshots de versões antigas como prova atual. Não criar contêineres, cópias intermediárias nem arquivos temporários persistentes no repositório.

## Publicação e reversibilidade

As melhorias têm impacto somente no frontend. Revisão do diff, validação dirigida e saúde do ambiente são condições para publicação. Se algum critério falhar, reverter apenas o bloco alterado antes de publicar. Incrementar versão web ao publicar, atualizar `LEITURA-INICIAL.md` e índice, e registrar evidências. A sincronização Git segue as regras do projeto após a entrega validada.

**Estado do documento:** plano-base estabelecido antes de alterações de frontend; execução e evidências serão registradas separadamente.
