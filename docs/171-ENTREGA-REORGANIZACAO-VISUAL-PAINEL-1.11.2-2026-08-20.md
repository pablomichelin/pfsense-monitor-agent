# 171 — Entrega da reorganização visual do painel 1.11.2

**Data:** 2026-08-20

**Plano:** `docs/170-PLANO-REORGANIZACAO-VISUAL-PAINEL-2026-08-20.md`

**Versão entregue:** painel web `1.11.2`

**Escopo:** somente apresentação e organização do frontend

## Resultado

As fases 0–9 do plano 170 foram consolidadas no painel publicado. A entrega reduz a carga visual, prioriza exceções e preserva rotas, filtros, query strings, colunas, informações e ações existentes.

Não houve alteração de API, banco, autenticação, sessão, MFA, RBAC, SSE, package pfSense, Zabbix ou contratos de infraestrutura nesta trilha visual.

## Entregas por fase

### Fase 0 — baseline e contratos

- plano 170 e protótipo visual revisados antes da continuidade;
- estado Git preexistente inventariado e preservado;
- contratos de navegação e autorização em `buildNavGroups`/`evaluateRouteAccess` mantidos;
- rotas, query strings, ações e estados críticos inventariados antes da publicação.

### Fase 1 — fundação global

- sidebar dividida entre Operação e Administração;
- Administração recolhível, com expansão automática do grupo ativo;
- Minha conta, Sessões, tema e Sair reunidos no menu do usuário;
- menu corrigido para permanecer acima do conteúdo e aceitar seleção;
- shell responsivo com drawer mobile, scrim, fechamento por Escape, armadilha de foco e retorno do foco ao acionador;
- cabeçalhos e superfícies compactados;
- tabelas base com cabeçalho fixo e área de rolagem controlada.

### Fase 2 — dashboard

- seção “Precisa de atenção” posicionada antes da saúde geral e das matrizes;
- offline e degradados aparecem primeiro;
- números, links, matrizes de versão e indicador de tempo real preservados.

### Fase 3 — inventário e detalhe

- filtros rápidos visíveis para Cliente, Status e Busca;
- filtros técnicos mantidos em “Mais filtros”;
- presets Todos, Com problema, Offline, Degradados, Backup atrasado, Sem backup e Package desatualizado;
- query string `preset` compatível com os parâmetros anteriores;
- ordenação, seleção, colunas, barra contextual e ações em lote preservadas;
- detalhe mantém todas as abas, dados, histórico, confirmações e gates existentes, com hero compacto.

### Fase 4 — alertas e backups

- Alertas compactados, ordenados por criticidade e idade;
- filtros rápidos Abertos, Críticos, Reconhecidos e Todos;
- filtros técnicos preservados em Diagnóstico;
- paginação 10/25/50 sem remover campos ou ações;
- Backups priorizados por Falharam, Atrasados, Nunca enviados e Em dia;
- tabela de backups com cabeçalho e coluna Firewall fixos;
- paginação, filtros, ordenação e links para o firewall preservados.

### Fase 5 — instalação

- fluxo guiado, filas operacionais e ferramentas avançadas mantidos na organização progressiva existente;
- comandos, overrides, preflight, diagnóstico, evidências, pós-instalação e desinstalação preservados sem alteração de conteúdo;
- nenhuma execução contra firewall foi realizada.

### Fase 6 — usuários, permissões e técnicos

- navegação administrativa compactada sem alterar ações existentes;
- Permissões ganhou o modo “Mostrar diferenças”;
- coluna de permissão fixa, códigos técnicos e imutabilidade do superadministrador preservados;
- Técnicos mantém abas, matriz expansível, cadastro modal, ações em lote, confirmações e backup gate.

### Fase 7 — administração complementar

- Cadastro, Clientes, Notificações, Política MFA e Grupos/tags receberam a hierarquia compacta comum;
- feature flags, estados somente leitura, formulários, bloqueios e ações existentes foram preservados.

### Fase 8 — auditoria, conta, sessões e login

- Auditoria mantém filtros, IDs, payload sob demanda, ordem e paginação existentes;
- Minha conta mantém identificação, perfil, permissões e MFA;
- Sessões separadas em Ativas, Expiradas/revogadas e Todas;
- busca por IP/agente e paginação 10/25/50 adicionadas;
- sessão atual permanece destacada e sem ação de revogação;
- Login e MFA visual consolidados em um único card, preservando erros e redirect `next`.

### Fase 9 — consolidação

- versão do painel elevada de `1.11.0` para `1.11.2` durante a trilha;
- build e deploy publicados;
- índices e histórico atualizados;
- não houve remoção oportunista de componentes ou CSS em worktree compartilhada.

## Arquivos da trilha visual

### Frontend

- `apps/web/package.json`
- `apps/web/app/alerts/page.tsx`
- `apps/web/app/backups/page.tsx`
- `apps/web/app/dashboard/page.tsx`
- `apps/web/app/globals.css`
- `apps/web/app/login/page.tsx`
- `apps/web/app/nodes/page.tsx`
- `apps/web/app/sessions/page.tsx`
- `apps/web/components/app-header.tsx`
- `apps/web/components/app-shell-layout.tsx`
- `apps/web/components/app-sidebar.tsx`
- `apps/web/components/backups/backups-fleet-table.tsx`
- `apps/web/components/page-hero.tsx`
- `apps/web/components/permissions-matrix-editor.tsx`
- `apps/web/components/ui/data-table.tsx`
- `apps/web/components/user-menu.tsx` (novo)

### Documentação

- `00_inicio.md`
- `LEITURA-INICIAL.md`
- `docs/00-INDICE-OPERACIONAL.md`
- `docs/HISTORICO-E-LINHA-DO-TEMPO.md`
- este documento

O repositório já continha muitas outras alterações, inclusive backend, tema e documentação, antes desta trilha. Elas não foram revertidas, absorvidas ou declaradas como parte desta entrega.

## Validações executadas

### Build e publicação

- `cd apps/web && npm run build`: aprovado;
- imagem publicada: `sha256:f4e610e43ad9774ca5051b65ee7653533310981772947951d755d83ea44f5223`;
- rodapé autenticado: `Monitor-Pfsense v1.11.2`;
- `docker compose ps`: API, banco, nginx e web saudáveis;
- LAN `http://192.168.100.221:3031/healthz`: HTTP 200;
- público `https://pfs-monitor.systemup.inf.br/healthz`: HTTP 200;
- público `/login`: HTTP 200;
- `smoke-frontend-assets.sh` no endpoint LAN: aprovado.

Durante a recriação houve uma janela transitória de `502` nos heartbeats enquanto a API reiniciava. Após a subida não foram observados novos `5xx`; os quatro containers terminaram saudáveis.

### Navegador autenticado

- perfil validado dinamicamente: Superadministrador;
- menu do usuário selecionável e acima do conteúdo;
- Claro, Escuro e Sistema alternados com estado correto;
- drawer mobile abre, move foco para dentro, fecha por Escape e devolve foco ao botão;
- rotas e deep links preservaram pathname/query string;
- nenhuma ação de escrita, revogação, instalação, backup, package ou técnico foi disparada.

### Viewports

| Cenário | Dimensão | Rota de referência | Resultado |
|---|---:|---|---|
| Mobile estreito | 390×844 | `/dashboard` | aprovado |
| Tablet | 768×1024 | `/nodes?preset=degraded` | aprovado |
| Notebook | 1366×768 | `/alerts?status=open&per_page=10` | aprovado |
| Desktop | 1440×900 | `/nodes?preset=problem` | aprovado |
| Desktop amplo | 1920×1080 | `/dashboard` | aprovado |
| Zoom 200% efetivo | 720×450 | `/sessions?view=active&per_page=10` | aprovado |

Não foi detectado overflow horizontal no documento nesses cenários; tabelas largas mantêm rolagem própria.

## Matriz de rotas e perfis

### Contrato preservado

| Rota/grupo | Permissão existente |
|---|---|
| `/dashboard`, `/nodes`, `/nodes/[id]` | `firewalls.view` |
| `/backups` | `backups.view` |
| `/alerts` | `alerts.view` |
| `/bootstrap` | `bootstrap.view` |
| `/admin` | `inventory.global` ou escopo global conforme contrato atual |
| `/admin/clientes` | `clients.view` |
| `/admin/usuarios`, `/admin/permissoes` | `users.view` |
| `/admin/notificacoes` | `notifications.view` |
| `/admin/mfa-politica` | `security.mfa_policy.view` |
| `/admin/grupos` | `tags.view` ou `groups.view` |
| `/admin/tecnicos` | `technicians.view` |
| `/audit` | `audit.view` |
| `/conta`, `/sessions` | conta autenticada |

`buildNavGroups` e `evaluateRouteAccess` não foram alterados nesta trilha. Portanto, superadministrador, administrador, operador, somente leitura, cliente restrito e usuários sem permissões específicas continuam recebendo exatamente os destinos permitidos pela matriz existente.

### Smoke dinâmico

Com o perfil Superadministrador foram aprovadas:

- `/dashboard`;
- `/nodes?preset=problem`;
- `/nodes/[id]` nas abas `overview`, `metrics`, `alerts`, `backup` e `config`;
- `/alerts?status=open&severity=critical&per_page=10`;
- `/backups?backup_status=late&per_page=10`;
- `/bootstrap`;
- `/admin`, `/admin/clientes`, `/admin/usuarios`, `/admin/permissoes`, `/admin/notificacoes`, `/admin/mfa-politica`, `/admin/grupos`, `/admin/tecnicos`;
- `/audit`, `/conta` e `/sessions?view=active&per_page=10`.

Os demais perfis foram validados pelo contrato estático preservado, sem criar usuários, alterar RBAC ou tocar o banco. Não havia credenciais separadas desses perfis autorizadas para um smoke dinâmico.

## Limitações e decisões de segurança

- `npm run lint` não conclui porque o projeto ainda não possui configuração ESLint e o Next abre um prompt interativo de criação; não foi criada configuração fora do escopo.
- A suíte completa `scripts/run-smoke-suite.sh` não foi executada: ela cria clientes, sites e nodes temporários, envia heartbeat e testa operações administrativas. Somente o smoke de assets, estritamente de leitura, foi usado.
- O endpoint loopback `http://127.0.0.1:8088` não respondeu ao diagnóstico com timeout; o endpoint LAN oficial `http://192.168.100.221:3031` e o domínio público responderam HTTP 200. Nenhuma regra de rede ou infraestrutura foi alterada nesta trilha visual.
- Não foram testadas ações destrutivas nem ações reais contra firewalls.
- A imagem web anterior não está mais presente no cache local do Docker. O rollback depende de restaurar os arquivos anteriores pela fonte/backup da implantação e reconstruir somente o serviço web.
- `git diff --check` global continua apontando whitespace preexistente em `docs/SISTEMA-VISUAL-PAINEL.md`; o arquivo não pertence a esta trilha e não foi alterado para evitar absorver trabalho alheio.

## Rollback

O rollback não exige migration nem alteração de banco/API:

1. restaurar somente os arquivos frontend listados acima a partir da cópia anterior da implantação;
2. restaurar a versão anterior em `apps/web/package.json`;
3. executar `cd apps/web && npm run build`;
4. reconstruir e recriar somente o serviço `web`, sem dependências;
5. conferir `docker compose ps`, LAN `/healthz`, domínio público, login e rota autenticada;
6. se o endpoint upstream mudar durante a recriação, recriar apenas `api` e `nginx`, sem tocar o banco, conforme o runbook existente.

Imagem efetivamente publicada e validada para retorno após qualquer mudança futura: `sha256:f4e610e43ad9774ca5051b65ee7653533310981772947951d755d83ea44f5223`.

## Estado final do Git

- branch `main`, acompanhando `origin/main`;
- worktree permanece muito suja, como já estava antes da trilha;
- alterações preexistentes foram preservadas;
- nenhum `reset`, `checkout`, limpeza destrutiva, commit ou push foi executado;
- a entrega não foi commitada para não misturar alterações visuais com mudanças preexistentes de backend, package, tema e documentação.
