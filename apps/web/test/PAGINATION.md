# Paginação além de 1.000 — bloco de 31/10/2026

Base: `5758a43`. Escopo local; sem versão, build de publicação, commit, push ou implantação. Sem mudança nas regras de saúde nem intervenção nos oito firewalls excluídos.

## Contrato

- `GET /nodes`: preserva `items`, `generated_at`, filtros, permissões, versões semânticas e defaults (`limit=500`, máximo 1.000 por resposta). Adiciona `total`, `limit`, `next_cursor`, `previous_cursor`. `cursor` é opaco; manter os filtros e a ordenação ao reutilizá-lo. Alterar filtro, ordem ou ator invalida o cursor com HTTP 400. Omitir cursor reinicia. `limit` agora exige inteiro.
- Ordenação global usa a regra anterior e UUID como último desempate. O cursor contém somente chaves de ordenação, sem tokens ou segredos. Não é credencial nem substitui RBAC: todas as páginas e totais reaplicam o escopo atual.
- `GET /alerts`: novos `page` (1–1.000.000), `limit` (1–1.000), `sort_by=legacy|attention`. **Opt-in**: fornecer `page` ou `limit` ativa paginação; sem ambos permanece a lista completa do contrato antigo. `limit` padrão do modo paginado é 500. Novos campos `total`, `page`, `limit`, `total_pages`; campos antigos preservados. Página acima do total retorna a última; conjunto vazio retorna página 1. Totais são do filtro completo, nunca só da página. Ordem antiga é preservada por padrão; `attention` ordena gravidade, mais antigos e ID, como a interface. Permissões de reconhecer/resolver não mudam.
- Painel: inventário, tokens, técnicos, membros de grupos e bootstrap usam páginas de 50; alertas usam 10/25/50 no servidor. Busca dos seletores consulta todo o escopo autorizado. Nenhum deles concatena páginas automaticamente. Técnicos retêm apenas a seleção explícita limitada pelo teto da API; grupos preservam membros fora da página ao editar.
- Seleções do inventário são reiniciadas ao mudar página/filtro/ordem. Lotes de backup da tela referem-se explicitamente à página atual. Token é limpo ao trocar busca/página/alvo e continua apenas em estado local. Respostas antigas de busca são descartadas; falhas não viram lista vazia silenciosa.

## Custo e limites

Nodes deriva saúde e agenda de backup com os utilitários existentes, em snapshot `RepeatableRead` por requisição. Lê blocos de 250 e mantém só uma página ordenada (mais o bloco); contagem de alertas usa `_count`, sem carregar IDs de todos os alertas. Memória O(250 + limit); leitura O(N) do escopo em cada página, com timeout de transação de 60 s. Sem índice/materialização adicional, não se afirma latência constante para frotas muito grandes. Medir no staging antes da publicação.

Cursores garantem desempate e continuidade para dados estáveis. Cada requisição tem snapshot próprio: alterações simultâneas nos campos ordenados/filtros podem deslocar linhas entre páginas; Início atualiza a navegação. Saúde é recalculada com o relógio atual, sem congelar classificação na data do cursor. Alertas em modo legado continuam potencialmente grandes por compatibilidade; **todos os chamadores do painel enviam paginação**. As telas de resumo do dashboard e a visão de backup têm seus contratos próprios e não foram redesenhadas neste bloco.

## Validação dirigida

Executar da raiz, após dependências e Prisma Client locais estarem disponíveis:

```sh
node --test apps/web/test/pagination-over-1000.test.mjs
node apps/web/test/pagination-types.mjs
```

O grupo usa fontes reais, Prisma sintético, DTOs reais e handlers/hooks de UI em memória. Inclui mais de 1.000 nodes/alertas, escopo, filtros, todas as ordens em ambos os sentidos, ida/volta, empates, limites, contratos legados, erro e busca concorrente, seleção e token em alvo >1.000. O coletor recebe 100.001 linhas sem reter a frota. Não constitui ensaio PostgreSQL, navegador real, carga de produção ou homologação de appliances. Build agregado e verificação de publicação ficam com o pai. Os mocks de duas suítes anteriores foram ajustados ao novo contrato, sem reexecução cumulativa.

Resultado desta rodada: 12 casos únicos aprovados. A primeira execução aprovou 11/12; o caso de UI de alertas falhou apenas por espaços extras da representação JSX no harness. Ajustada a asserção para aceitar whitespace e reexecutado **somente esse caso**, aprovado. Nenhum dos 11 casos já aprovados foi repetido. Tipagem dirigida: API 5 entradas e painel 18 entradas, com dependências importadas, sem emissão de arquivos, aprovada na primeira execução. `git diff --check` do escopo aprovado. Sem npm install, build global, banco real, navegador real ou ação em servidor/firewall nesta rodada. Não foram criados contêineres, redes ou cópias de trabalho.
