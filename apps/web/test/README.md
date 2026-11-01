# Testes sintéticos do frontend

Da raiz do repositório, com as dependências já disponíveis:

```sh
# Bloco inicial (17 aprovados; não repetir nesta rodada)
node --test apps/web/test/frontend-flows.test.mjs
# Regressões do bloco final Arendt
node --test apps/web/test/frontend-final-regressions.test.mjs
./apps/web/node_modules/.bin/tsc --project apps/web/tsconfig.json --noEmit --incremental false
```

Os testes executam as fontes TypeScript/TSX em memória usando o TypeScript já
declarado no projeto. As chamadas de API, navegação, eventos e relógio são
simulados. Não utilizam credenciais, ambiente remoto nem ações em firewalls.
O pequeno simulador de hooks verifica handlers e efeitos; ele não substitui
React DOM, navegador ou teste de integração com Next.js.

## Arquivos desta rodada

Todos os caminhos abaixo são relativos a `apps/web/`:

| Fluxo | Arquivos |
| --- | --- |
| Token e cadastro | `lib/admin.ts`, `components/agent-token-form.tsx`, `components/admin-cadastro-cards.tsx`, `app/admin/page.tsx` |
| Usuários | `app/admin/usuarios/page.tsx`, `components/admin-usuarios-tabs.tsx` |
| Alertas e páginas | `app/alerts/page.tsx`, `lib/pagination.ts` |
| Tabelas pf | `components/nodes/fleet-pf-tables-panel.tsx`, `lib/table-ip.ts` |
| Técnicos e inventário | `app/admin/tecnicos/page.tsx`, `app/nodes/page.tsx`, `components/nodes/fleet-inventory-section.tsx`, `components/nodes/fleet-technician-management-panel.tsx`, `components/admin-technician-targets.tsx`, `lib/technician-batch-limit.ts`, `lib/api.ts` |
| Falhas de carga | `app/nodes/[id]/page.tsx`, `components/nodes/node-detail-metrics-tab.tsx`, `components/nodes/node-detail-overview-tab.tsx` |
| SSE | `components/realtime-refresh.tsx`, `app/api/realtime/dashboard/route.ts` |
| Testes e roteiro | `test/frontend-flows.test.mjs`, `test/frontend-final-regressions.test.mjs`, `test/source-harness.mjs`, `test/README.md` |

Alterações concorrentes de versão em `package.json`/`package-lock.json` pertencem
à integração e não foram feitas nesta rodada de frontend.

## Validação posterior no navegador, com API sintética

- Token: selecionar firewall depois do vigésimo, emitir, copiar e ocultar;
  fechar/reabrir o card e navegar. Credencial não deve aparecer na URL,
  histórico de navegação nem armazenamento local. Testar erro e nova emissão.
- Usuários: superadmin recebe controles; admin com `users.view` é negado antes de consultar usuários/sessões.
  Conferir edição, senha, exclusão e revogação de sessão.
- Alertas: conferir perfis com apenas acknowledge, apenas resolve, ambos e
  nenhum; filtros e página devem permanecer após ação simulada.
- Tabelas pf: atrasar a resposta da consulta e do polling, alterar IP/máscara
  e seleção; respostas antigas não podem repor resultados. Testar IPv4 /24,
  IPv6 /128 e escolha de uma entrada listada. Simular polling com respostas
  acima de 5 segundos sem sobreposição. Somente simular a remoção.
- Técnicos: conferir `has_global_client_scope` true/false/ausente, combinado
  com manage e password_reset. Cadastro global exige true + manage;
  operações por firewall permanecem disponíveis conforme suas permissões.
  Técnico sem primeiro vínculo deve gerar orientação clara ao usuário restrito.
  Em /admin/tecnicos, selecionar alvos explicitamente e conferir o cap retornado
  por `batch_max_size`; 101 alvos com limite 100 devem ser bloqueados.
  Alterar alvos invalida a confirmação e preserva resultados de lotes anteriores.
- Carga: simular 500, lista vazia, recurso desligado, 401 e 403. Erro não pode
  virar “nenhum item” ou “desligado”; falha no histórico preserva o snapshot.
- SSE: conectar, reconectar, encerrar, enviar JSON inválido, eventos fora do
  node e eventos durante o throttle; conferir atualização após o primeiro open,
  atualização final e limpeza ao sair.
- Inventário: conferir aviso ao atingir 1.000 itens, limite atual da API sem
  offset. Verificar desktop/mobile e formatação visual das mensagens.

Não executar o smoke visual legado com credenciais reais para esta rodada.

Paginação além de 1.000 firewalls permanece melhoria futura fora deste bloco.
