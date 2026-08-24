# 170 — Plano de reorganização visual e redução de complexidade do painel

**Data:** 2026-08-20  
**Status:** planejamento — nenhuma alteração de código autorizada por este documento  
**Escopo primário:** `apps/web`  
**Versão-base observada:** painel `1.11.0`  

## 1. Objetivo

Reorganizar visualmente o painel Monitor-Pfsense para que o trabalho diário fique mais rápido, previsível e legível, sem remover informações, sem reduzir capacidades e sem alterar contratos funcionais.

O problema principal não é a quantidade de informação existente. O problema é que informação operacional, contexto, configuração avançada, histórico e ações perigosas frequentemente aparecem com peso visual semelhante. Isso obriga o operador a ler telas inteiras para descobrir o que exige atenção.

Este plano cria camadas claras de prioridade:

1. o que exige atenção agora;
2. o que é usado no trabalho diário;
3. detalhes técnicos, históricos e opções avançadas sob demanda.

Todas as informações atuais devem continuar acessíveis. A reorganização pode usar abas, drawers laterais, acordeões, menus contextuais, agrupamentos, paginação e filtros rápidos, mas não pode eliminar dados ou funcionalidades.

## 2. Resultado esperado

Ao final da trilha, o painel deve permitir que um operador:

- identifique problemas críticos em poucos segundos;
- encontre um firewall, alerta, backup, usuário ou evento sem percorrer páginas muito longas;
- diferencie claramente consulta, operação, administração e ações destrutivas;
- acesse detalhes técnicos somente quando necessário;
- navegar com a mesma lógica visual em todas as telas;
- usar os temas claro e escuro com contraste, hierarquia e densidade equivalentes;
- concluir os fluxos atuais sem qualquer mudança de contrato, RBAC ou comportamento de backend.

## 3. Restrições inegociáveis

### 3.1. Nada pode deixar de funcionar

- Não remover rotas, campos, filtros, colunas, botões, abas, ações, textos de negócio ou informações existentes.
- Não alterar contratos da API, DTOs, Server Actions, formatos de payload, endpoints ou códigos de erro.
- Não alterar ingestão, heartbeat, SSE, autenticação, sessão, MFA, RBAC, escopo por cliente ou regras de auditoria.
- Não alterar o agente ou package pfSense.
- Não executar ações reais em firewalls durante testes visuais.
- Não alterar banco de dados, migrations, Zabbix, Nginx, ISPConfig ou portas do host.
- Não adicionar comandos remotos, restore automático ou novas permissões.
- A reorganização deve ser compatível com links existentes e parâmetros de URL.
- Estados de filtro, ordenação, paginação, aba e retorno devem continuar representáveis por URL quando já forem hoje.

### 3.2. Informação preservada, apresentação reorganizada

É permitido:

- mover informação secundária para drawer, aba ou acordeão;
- recolher opções avançadas por padrão;
- paginar ou virtualizar listas, preservando acesso a todos os registros;
- criar filtros rápidos que coexistam com os filtros completos;
- transformar cards repetidos em tabelas ou listas densas;
- mover ações perigosas para menus ou zonas de perigo claramente identificadas;
- criar cabeçalhos fixos, colunas fixas e barras contextuais;
- reduzir decoração e tamanho de componentes sem eliminar conteúdo.

Não é permitido:

- ocultar permanentemente informação;
- trocar labels por ícones sem texto acessível;
- usar cor como único indicador de estado;
- reduzir contraste ou tamanho de fonte abaixo do aceitável;
- consolidar ações com semânticas diferentes em um único comando ambíguo.

## 4. Diagnóstico consolidado

### 4.1. Navegação

- A sidebar pode exibir aproximadamente 16 destinos para um superadministrador.
- Quando recolhida, a sequência de ícones é difícil de memorizar.
- Administração, conta, tema e logout competem com as rotas operacionais.
- Logout aparece em mais de uma superfície.
- O seletor de tema ocupa espaço permanente no header, embora seja uma preferência ocasional.

### 4.2. Hierarquia visual

- Quase todas as páginas começam com um `PageHero` grande.
- Cards, tabelas, filtros, alertas e ações usam superfícies de peso semelhante.
- Há excesso de bordas, cards aninhados e grade decorativa sob conteúdo denso.
- Indicadores saudáveis usam tanta cor quanto exceções.
- Atualização em tempo real recebe destaque comparável ao conteúdo operacional.

### 4.3. Tipografia e legibilidade

Na base atual foram observadas muitas ocorrências de texto pequeno, monoespaçado e em caixa alta. A fonte monoespaçada deve ser reservada a IDs, versões, comandos e valores técnicos. Labels operacionais e descrições devem usar tipografia normal e contraste estável.

### 4.4. Densidade e páginas longas

- Inventário, backups, alertas, auditoria e sessões podem gerar páginas muito extensas.
- Usuários repete grandes matrizes de clientes para cada registro.
- Alertas usa cards completos para cada evento.
- Instalação mistura seleção, execução, preflight, comandos, diagnóstico, evidências, desinstalação e inventário de agentes na mesma superfície.
- Permissões apresenta uma matriz extensa sem mecanismos suficientes de foco e comparação.

## 5. Princípios do novo sistema visual

### 5.1. Exceção primeiro

Estados críticos, falhas, atrasos e bloqueios devem aparecer antes de estados saudáveis. Cores fortes ficam reservadas a situações que pedem atenção.

### 5.2. Divulgação progressiva

O primeiro nível mostra o necessário para decidir. O segundo mostra detalhes operacionais. O terceiro concentra contexto técnico e opções avançadas.

### 5.3. Uma ação primária por contexto

Cada página, card, drawer ou etapa deve ter uma ação principal claramente reconhecível. Ações secundárias usam menor ênfase. Ações destrutivas ficam isoladas.

### 5.4. Padrões repetíveis

- Cabeçalho compacto de página.
- Faixa de indicadores compacta.
- Filtros rápidos + filtros avançados.
- Tabela/lista + drawer de detalhes.
- Barra contextual para seleção em lote.
- Estado vazio com orientação clara.
- Paginação consistente.

### 5.5. Temas equivalentes

Claro e escuro devem ter a mesma hierarquia e semântica. Não basta inverter paletas: contraste, profundidade de superfície, foco, hover, seleção e estados desabilitados precisam ser verificados nos dois temas.

## 6. Arquitetura visual proposta

### 6.1. Shell e sidebar

Manter como destinos operacionais principais:

- Dashboard;
- Firewalls;
- Alertas;
- Backups;
- Instalação.

Administração permanece acessível em grupo expansível, contendo todos os destinos atuais e respeitando RBAC:

- Cadastro;
- Clientes;
- Usuários;
- Permissões;
- Notificações;
- Política MFA;
- Grupos e tags;
- Técnicos;
- Auditoria.

Conta, Sessões, Tema e Sair passam a formar o menu do usuário. Nenhum destino é removido.

Requisitos:

- grupo da rota atual expandido automaticamente;
- estado recolhido preservado;
- tooltips com texto completo na sidebar recolhida;
- item ativo inequívoco;
- navegação por teclado;
- nenhuma alteração na função `buildNavGroups` que enfraqueça RBAC;
- versão mobile com drawer, foco preso e fechamento por Escape;
- um único logout visualmente principal.

### 6.2. Header global

- Breadcrumb permanece.
- Seletor de tema passa para menu do usuário ou controle compacto.
- Email pode ficar dentro do menu do usuário.
- Status de SSE/realtime torna-se indicador discreto.
- Header não deve competir com o título da página.

### 6.3. Cabeçalho de página

Criar variante compacta do `PageHero`:

- eyebrow opcional;
- título;
- descrição preservada em uma ou duas linhas;
- ação principal à direita;
- stats em faixa curta, sem cards excessivamente altos;
- aside operacional discreto;
- variante detalhada apenas quando realmente necessária.

### 6.4. Tipografia

- Texto operacional padrão: mínimo visual de 13–14 px.
- Fonte monoespaçada apenas para IDs, versões, comandos, hashes, IPs e timestamps técnicos.
- Reduzir caixa alta e tracking em labels comuns.
- Títulos de página, seção, card e label devem ter quatro níveis claramente diferentes.
- Textos secundários devem atingir WCAG AA nos dois temas.

### 6.5. Superfícies e cor

- Reduzir cards aninhados.
- Usar borda somente quando ela explica agrupamento ou interação.
- Reduzir a grade decorativa atrás de tabelas e formulários.
- Estados saudáveis devem ser mais neutros.
- Vermelho, âmbar e verde fortes ficam restritos a estados semânticos.
- Ciano indica ação ou navegação, não decoração generalizada.
- Não usar somente cor: manter label, ícone ou texto de estado.

### 6.6. Padrão de listas e tabelas

Criar um padrão reutilizável com:

- cabeçalho fixo;
- primeira coluna fixa quando necessário;
- paginação no topo e rodapé para listas longas;
- quantidade por página configurável;
- busca clara;
- filtros rápidos;
- filtros avançados recolhíveis;
- ordenação visível;
- estado hover/selecionado inequívoco;
- drawer de detalhes para conteúdo extenso;
- ações de linha agrupadas;
- barra contextual de lote;
- estado vazio e erro padronizados;
- responsividade sem esconder informação permanentemente.

## 7. Plano por tela

### 7.1. Dashboard

Nova ordem recomendada:

1. faixa “Precisa de atenção”;
2. zona quente;
3. saúde geral da frota;
4. versões e indicadores informativos;
5. atalhos para inventário completo.

Mudanças:

- destacar offline, degradados, alertas críticos, backup problemático e package desatualizado;
- compactar os KPIs atuais em uma faixa;
- indicadores zero/saudáveis ficam neutros;
- cards críticos funcionam como links para listagens filtradas;
- matrizes de versão continuam disponíveis, abaixo das exceções;
- manter todos os números e links atuais;
- realtime vira indicador discreto.

### 7.2. Firewalls (`/nodes`)

- Manter busca, cliente e status como filtros rápidos.
- Mover criticidade, tags, grupos e ordenação completa para “Mais filtros”.
- Criar chips/presets: Com problema, Offline, Degradados, Backup atrasado, Sem backup, Package desatualizado e Todos.
- Tornar os stats do topo clicáveis quando representarem filtros.
- Manter todas as colunas existentes.
- Cabeçalho da tabela fixo.
- Congelar coluna Firewall quando houver scroll horizontal.
- Paginar ou virtualizar sem reduzir acesso aos registros.
- Preservar ordenação por coluna e parâmetros atuais.
- Seleção abre uma única barra contextual sticky.
- Operações de backup, package e técnicos ficam em abas ou menus dentro da barra contextual.
- Exibir claramente quantos itens estão selecionados e se a seleção é da página ou do filtro.
- Não executar fallback automático para todos os itens.

### 7.3. Detalhe do firewall

- Compactar o hero.
- Manter status, contato, versão pfSense, package e backup em resumo persistente.
- Manter todas as abas atuais.
- Separar visualmente abas operacionais e administrativas.
- Colocar “Excluir host” em menu de ações e zona de perigo, mantendo confirmação.
- Histórico de comandos pode virar aba própria ou seção recolhida.
- Ações operacionais continuam sujeitas a RBAC, confirmação, backup gate e flags.
- Métricas, alertas, backup e configuração mantêm todos os dados atuais.

### 7.4. Alertas

- Substituir cards completos repetidos por lista/tabela compacta.
- Uma linha mostra prioridade, status, firewall, título, tipo e idade.
- Drawer lateral exibe descrição, cliente/local, contexto, timestamps, reconhecimento, resolução e ações.
- Preservar todos os campos atuais.
- Filtros rápidos: Abertos, Críticos, Reconhecidos e busca.
- Filtros técnicos ficam em “Diagnóstico”.
- Agrupar ou separar resolvidos; não removê-los.
- Paginação real.
- Ordenar exceções críticas e antigas de forma previsível.
- Ações de reconhecer/resolver continuam com RBAC e retornos atuais.

### 7.5. Backups

- Cards-resumo funcionam como filtros.
- Ordem padrão: Falharam, Atrasados, Nunca enviados, Em dia.
- Lista compacta com status, último backup, idade e ação.
- Drawer contém detalhes completos e links existentes.
- Cabeçalho fixo e paginação.
- Preservar filtros e ordenação atuais.
- Destacar problemas; backup saudável usa tratamento discreto.
- Nenhuma mudança em criptografia, download, retenção, diff, drift ou armazenamento.

### 7.6. Instalação (`/bootstrap`)

Transformar a tela em fluxo guiado:

1. selecionar firewall;
2. preparar instalação;
3. instalar e verificar.

Preservar integralmente:

- filtros;
- seleção de firewall;
- comando principal;
- heartbeat normal/light;
- overrides;
- preflight;
- diagnóstico;
- evidências;
- comandos pós-instalação;
- desinstalação;
- filas de prontos, ativos e bloqueados.

Organização:

- fluxo principal sempre visível;
- overrides, diagnóstico, evidências e desinstalação em “Ferramentas avançadas”;
- lista de agentes ativos em aba própria;
- fila de prontos e bloqueios em aba/segmento operacional;
- comandos com área de cópia clara e sem truncar conteúdo;
- etapa atual e conclusão visíveis;
- nenhuma execução automática adicionada.

### 7.7. Cadastro (`/admin`)

- Manter como hub administrativo.
- Cabeçalho compacto.
- Ações de criação preservadas.
- Cards podem ser reduzidos e agrupados por “Cadastros” e “Acessos”.
- Evitar duplicação entre atalhos e cards quando ambos apontarem ao mesmo lugar; se mantidos, diferenciar navegação de ação.

### 7.8. Clientes

- Busca e resumo no topo.
- Lista/tabela de clientes com expansão ou drawer.
- Firewalls do cliente dentro do detalhe.
- Criação, edição e exclusão preservadas.
- Bloqueio de exclusão quando houver firewalls permanece explícito.
- Ações destrutivas separadas.

### 7.9. Usuários

- Trocar formulários gigantes repetidos por tabela de usuários.
- Filtros por perfil, status e busca.
- Clique abre drawer de edição.
- Drawer preserva email, nome, perfil, status, senha, clientes permitidos e ações.
- Escopo de clientes recebe busca, agrupamento e seleção em lote.
- Manter todos os clientes acessíveis.
- Sessões ficam em aba própria.
- Excluir usuário permanece em zona de perigo com confirmação.
- Não alterar RBAC, semântica de deleção ou revogação de sessão.

### 7.10. Permissões

- Cabeçalho e coluna de permissão fixos.
- Categorias recolhíveis.
- Seleção de perfis a comparar.
- Modo “Mostrar diferenças”.
- Legenda para permitido, negado e imutável/herdado, se aplicável.
- Edição de perfil em drawer ou modal.
- Preservar toda a matriz e todos os códigos técnicos.
- Superadministrador continua imutável quando essa for a regra atual.

### 7.11. Notificações, Política MFA e Grupos/tags

- Aplicar cabeçalho compacto e padrão lista + drawer.
- Separar configuração diária de opções avançadas.
- Manter todas as feature flags e estados atuais.
- Mostrar claramente configuração inativa, bloqueada ou somente leitura.
- Nenhuma mudança no dispatcher, enforcement ou contratos.

### 7.12. Técnicos

- Preservar abas Técnicos e Ação em lote já entregues.
- Manter seleção de técnico por linha e seleção de firewalls vinda de `/nodes`.
- Matriz técnico × firewall em lista compacta com expansão ou drawer.
- Cadastro em modal permanece.
- Separar visualmente cadastro central, provisionamento, alteração de senha, remoção dos firewalls e remoção do cadastro.
- Manter confirmações, proteção de `admin`/`root`, backup gate e comportamento de senha.

### 7.13. Auditoria

- Filtros rápidos visíveis; filtros técnicos em “Mais filtros”.
- Lista compacta com data, ação, ator, alvo e resultado.
- Drawer exibe payload e detalhes completos.
- Paginação no topo e rodapé.
- Agrupamento opcional por data ou tipo.
- Manter ordem cronológica, filtros, IDs e payload fail-closed.
- Não reduzir informação de auditoria.

### 7.14. Minha conta e MFA

- A tela já possui complexidade aceitável.
- Aplicar cabeçalho compacto.
- Manter identificação, perfil, permissões, MFA e orientação de senha.
- Fluxo MFA não pode ser alterado apenas por conveniência visual.
- QR code deve permanecer com fundo adequado e legível nos dois temas.

### 7.15. Sessões

- Separar Ativas e Expiradas/revogadas em abas ou filtros.
- Ativas aparecem primeiro.
- Paginação obrigatória para listas extensas.
- Busca/filtro por IP, agente e período.
- Drawer ou expansão para dados completos.
- Revogar preserva confirmação e não pode afetar a sessão atual sem indicação explícita.

### 7.16. Login

- Consolidar título e formulário para evitar dois cards com mensagem semelhante.
- Preservar branding, descrição e campos.
- Tema continua disponível, preferencialmente em controle discreto.
- Manter mensagens de erro, MFA e redirects `next`.
- Não alterar cookies, autenticação ou fluxo server-side.

## 8. Componentes reutilizáveis previstos

Antes de refatorar páginas, definir contratos de UI para:

- `CompactPageHeader` ou variante compacta do `PageHero`;
- `KpiStrip`;
- `QuickFilters`;
- `AdvancedFilters`;
- `DataTable` ampliado;
- `Pagination`;
- `DetailDrawer`;
- `ContextualBatchBar`;
- `UserMenu`;
- `OverflowActionsMenu`;
- `EmptyState`;
- `LoadingState`;
- `ErrorState`;
- `DangerZone`;
- `CommandBlock`;
- `StepFlow` para instalação.

Cada componente deve preservar HTML semântico, foco, teclado, ARIA, temas e responsividade.

## 9. Fases de execução

### Fase 0 — Baseline e inventário de contratos

Objetivo: congelar o comportamento atual antes de mudar apresentação.

Entregas:

- mapa de rotas por perfil/RBAC;
- inventário de filtros, parâmetros de URL, ações e estados por página;
- screenshots desktop/mobile nos dois temas;
- resultados dos builds e smokes atuais;
- lista de textos, colunas e dados que não podem desaparecer;
- checklist dos fluxos de maior risco.

Gate: nenhuma refatoração começa sem baseline aprovado.

### Fase 1 — Fundação visual global (P0)

- shell;
- sidebar agrupada;
- menu do usuário;
- header compacto;
- hierarquia tipográfica;
- redução de ruído de superfície;
- estados e cores;
- componentes base de tabela, drawer, paginação e filtros.

Gate: todas as rotas continuam acessíveis conforme RBAC e ambos os temas passam na revisão visual.

### Fase 2 — Dashboard (P0)

- exceções primeiro;
- KPIs compactos;
- zona quente priorizada;
- matrizes preservadas abaixo.

Gate: todos os números e links atuais permanecem corretos.

### Fase 3 — Inventário e detalhe (P0/P1)

- filtros rápidos/avançados;
- presets;
- tabela fixa/paginada;
- barra de lote;
- detalhe compacto;
- histórico e ações reorganizados.

Gate: seleção, ordenação, filtros, retorno, backup em lote, package e técnicos mantêm comportamento atual.

### Fase 4 — Alertas e backups (P1)

- listas compactas;
- drawers;
- filtros rápidos;
- paginação;
- exceções primeiro.

Gate: reconhecimento, resolução, download e navegação por firewall preservados.

### Fase 5 — Instalação (P1)

- fluxo guiado;
- ferramentas avançadas;
- filas em abas/segmentos.

Gate: comandos gerados devem ser byte a byte equivalentes para as mesmas entradas, salvo formatação visual externa ao conteúdo copiado.

### Fase 6 — Usuários, permissões e técnicos (P1)

- tabelas + drawers;
- busca e filtros;
- matrizes sob demanda;
- ações perigosas separadas.

Gate: matriz RBAC, escopo por cliente, sessões e ações de técnico sem regressão.

### Fase 7 — Administração complementar (P2)

- cadastro;
- clientes;
- notificações;
- MFA política;
- grupos/tags.

Gate: feature flags, permissões e estados somente leitura preservados.

### Fase 8 — Auditoria, conta, sessões e login (P2)

- paginação;
- drawers;
- abas de estado;
- login consolidado;
- MFA visual preservado.

Gate: sessão, autenticação, auditoria e revogações passam nos smokes existentes.

### Fase 9 — Consolidação e encerramento

- revisão visual completa;
- remoção apenas de CSS/componentes comprovadamente órfãos;
- documentação atualizada;
- métricas antes/depois;
- encerramento formal da trilha.

## 10. Estratégia de implementação segura

### 10.1. Mudanças pequenas e reversíveis

- Uma fase por entrega.
- Evitar refatoração simultânea de várias páginas críticas.
- Não misturar mudança visual com mudança de backend.
- Não alterar API e package na mesma trilha visual.
- Preferir novos componentes compatíveis e migração página a página.
- Manter componentes antigos até a nova página ser validada.

### 10.2. Feature flags quando necessário

Para mudanças amplas de shell, tabela, drawer ou instalação, considerar flag visual com default seguro. A flag não deve alterar autorização nem comportamento do backend.

### 10.3. Compatibilidade de URL

Antes/depois de cada tela, validar:

- filtros por query string;
- ordenação;
- paginação;
- links de retorno;
- aba ativa;
- deep links;
- redirects de autenticação;
- links vindos de dashboard, alertas, auditoria e emails/notificações, quando existirem.

### 10.4. Ações destrutivas

Excluir, revogar, remover, resetar, reiniciar, atualizar, instalar e executar comandos devem preservar:

- RBAC;
- confirmação;
- texto inequívoco;
- escopo do alvo;
- auditoria;
- feedback de sucesso/erro;
- proteção contra duplo clique;
- gates de backup e feature flags existentes.

## 11. Matriz obrigatória de validação

### 11.1. Builds e smokes

Após cada fase que alterar `apps/web`:

1. bump de versão conforme `.cursor/rules/versioning.mdc`;
2. `cd apps/web && npm run build`;
3. executar smokes aplicáveis;
4. `scripts/run-smoke-suite.sh` quando a mudança alcançar fluxos compartilhados;
5. deploy conforme `.cursor/rules/build-and-deploy.mdc`;
6. conferir saúde dos containers;
7. validar acesso interno e externo;
8. nunca tocar Zabbix.

### 11.2. Perfis e RBAC

Validar pelo menos:

- superadministrador;
- administrador;
- operador;
- somente leitura;
- cliente com escopo restrito;
- usuário sem uma ou mais permissões específicas.

O menu, as rotas, os botões e os dados devem respeitar exatamente a matriz existente.

### 11.3. Rotas mínimas

- `/login`;
- `/dashboard`;
- `/nodes`;
- `/nodes/[id]` em todas as abas;
- `/backups`;
- `/alerts`;
- `/bootstrap`;
- `/admin`;
- `/admin/clientes`;
- `/admin/usuarios`;
- `/admin/permissoes`;
- `/admin/notificacoes`;
- `/admin/mfa-politica`;
- `/admin/grupos`;
- `/admin/tecnicos`;
- `/audit`;
- `/conta`;
- `/sessions`.

### 11.4. Viewports

- mobile estreito;
- tablet;
- notebook 1366×768;
- desktop 1440×900;
- desktop amplo;
- zoom 200%.

### 11.5. Temas e acessibilidade

- Claro, Escuro e Sistema.
- WCAG AA para texto e controles.
- teclado completo;
- foco visível;
- leitor de tela para menus, tabs, drawers e modais;
- Escape fecha superfícies temporárias;
- foco retorna ao acionador;
- `prefers-reduced-motion` respeitado;
- estados não dependem somente de cor.

### 11.6. Estados de dados

Testar:

- vazio;
- um registro;
- muitos registros;
- loading;
- erro de API;
- dado parcial;
- texto longo;
- versão/hostname/cliente longos;
- sem permissão;
- feature flag desligada;
- item offline/degradado/maintenance/unknown;
- seleção em lote vazia/parcial/todos da página.

## 12. Critérios de aceite globais

Uma fase só pode ser considerada concluída quando:

- nenhuma informação do escopo desapareceu;
- nenhuma ação mudou de semântica;
- contratos e payloads permaneceram iguais;
- RBAC e escopo por cliente permaneceram corretos;
- build passou;
- smokes aplicáveis passaram;
- temas claro e escuro foram inspecionados;
- desktop e mobile foram inspecionados;
- links e query strings existentes continuam funcionando;
- ações perigosas mantêm confirmação e auditoria;
- não há erro novo no console;
- não há regressão de sessão, SSE ou autenticação;
- a documentação e a versão foram atualizadas quando houve código;
- existe procedimento de rollback testado.

## 13. Métricas de sucesso

Medir antes e depois:

- tempo para localizar um firewall degradado;
- tempo para localizar backups atrasados;
- tempo para reconhecer um alerta;
- tempo para encontrar e editar um usuário;
- tempo para identificar quem possui acesso a um firewall;
- quantidade de scroll para concluir cada tarefa;
- quantidade de controles visíveis no primeiro viewport;
- taxa de erro em seleção em lote;
- quantidade de cliques para chegar a detalhes avançados;
- percepção dos operadores sobre clareza e carga visual.

Metas sugeridas:

- exceções principais reconhecíveis em até 10 segundos;
- redução perceptível de scroll em Alertas, Usuários, Sessões e Instalação;
- no máximo uma ação primária dominante por contexto;
- nenhuma regressão funcional ou de RBAC.

## 14. Rollout e rollback

### Rollout

- implementar em ambiente controlado;
- validar internamente;
- deploy de uma fase por vez;
- smoke imediato após deploy;
- monitorar logs, sessão, SSE e erros de frontend;
- coletar feedback operacional antes da fase seguinte.

### Rollback

- cada fase deve ter commit isolado;
- registrar versão anterior do painel;
- manter imagem/container anterior disponível durante a janela de validação;
- rollback não pode exigir migration;
- se houver falha de navegação, sessão, RBAC, ação operacional ou perda de informação, retornar imediatamente à versão anterior;
- documentar causa antes de retomar a fase.

## 15. Protótipos obrigatórios antes da implementação ampla

Produzir protótipos de alta fidelidade, nos temas claro e escuro, para:

1. Dashboard;
2. Firewalls;
3. Alertas;
4. Instalação;
5. Usuários.

Os protótipos devem usar dados realistas e demonstrar:

- estado normal;
- estado crítico;
- filtros;
- drawer aberto;
- seleção em lote;
- lista longa;
- mobile;
- ações perigosas.

Somente após aprovação desses cinco padrões deve começar a migração das demais páginas.

## 16. Fora do escopo

- novas funcionalidades de backend;
- novos endpoints;
- mudança de banco;
- alteração do package pfSense;
- alteração do fluxo de heartbeat;
- mudança de regras de negócio;
- redefinição de RBAC;
- restore automático;
- mudanças em Zabbix ou infraestrutura;
- remoção de dados ou capacidades existentes.

## 17. Próximo passo recomendado

Executar somente a **Fase 0 — Baseline e inventário de contratos** e produzir os cinco protótipos. Não iniciar refatoração de código antes da aprovação visual e funcional desses artefatos.

Este documento é um plano. Sua criação não autoriza mudanças no painel, deploy, bump de versão ou alteração de ambiente.
