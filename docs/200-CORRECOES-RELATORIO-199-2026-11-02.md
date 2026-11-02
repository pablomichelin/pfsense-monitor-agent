# 200 — Correções dirigidas dos achados da revisão 199

Data: 02/11/2026. Referência: [relatório 199](199-REVISAO-INTENSA-BUGS-E-MELHORIAS-2026-11-01.md). Esta documentação distingue fonte alterada, validação local e ativação operacional. A base publicada antes desta rodada permanece API **0.13.0**, web **1.14.0** e package **0.5.26**. Os oito firewalls degradados excluídos, o Zabbix, o Theo e HA/CARP estão fora do escopo.

## Correções implementadas localmente

| Achado | Modificação | Evidência e limite |
|---|---|---|
| F01 P1 | A instalação preserva `cursor` entre formulário, seleção e URL. Identificador explícito ausente impede gerar comando para outro firewall. | Caso dirigido com seleção na segunda página e falha fechada. |
| A01 P1 | O receptor DR preserva a última recuperação comprovada em marca durável; somente após GPG, restore PostgreSQL 17, XMLs AES-GCM e nodeSecrets validados permite retenção. Erro de verificação impede sucesso do envio e preserva conjuntos antigos. | 16 testes sintéticos DR aprovados. Tríade instalada no 220 com SHA verificado; restauração real do conjunto antes aprovado passou e registrou âncora. Falta novo envio ponta a ponta após atualizar 221. |
| F02 P2 | Resultado de lote usa identidade imutável do técnico que iniciou a operação, mesmo se o seletor mudar. | Cenário dirigido de mudança de técnico e resposta assíncrona. |
| F03 P2 | Destino `next` de login aceita apenas caminho normalizado da própria origem, rejeitando backslash, controles e rotas reservadas. | Casos dirigidos de URL externa e caminhos internos válidos. |
| F04 P2 | Dashboard consulta offline e degradado antes de limitar a lista; totais da frota impedem falsa mensagem verde. | Caso dirigido com equipamento offline fora da primeira página alfabética. |
| F05 P2 | Backups e tags são consultados apenas com permissão da seção; falha de seção opcional não derruba o detalhe autorizado. | Caso dirigido com `firewalls.view` sem `backups.view`/`tags.view`. |
| F06 P2 | Aba do detalhe acompanha querystring e navegação voltar/avançar. | Caso dirigido de troca e retorno de URL. |
| F07 P2 | Histórico sincroniza snapshots de servidor novos em componente já montado. | Caso dirigido de comando recém-criado com histórico anterior vazio. |
| F08 P2 | Consulta de status de backup tem retomada e backoff após falha transitória, com leitura serializada; nunca reenfileira a escrita. | Caso dirigido de falha de leitura, retomada e uma só solicitação. |
| F09 P2 | Acompanhamento de lote verifica apenas pendentes e termina ao alcançar estados terminais, com limite de quatro leituras simultâneas e proteção contra operações antigas. | Cenário dirigido de lote finalizado e consultas sem sobreposição. |
| F10 P3 | Diálogo recebe foco inicial em **Cancelar**, contém Tab, torna fundo inerte, permite Escape e restaura o foco de origem. | Chrome headless real passou nas cinco interações; arquivos de ensaio temporários removidos. |

Os testes dirigidos do painel foram executados conforme o bloco afetado, sem reexecutar suítes aprovadas de outras funcionalidades. Typecheck completo do painel passou após as alterações de fonte; **build Next.js otimizado aprovado** após esses ajustes, com checagem de tipos/rotas. `git diff --check` passou na inspeção local. O restore real do novo caminho e a publicação ainda devem ocorrer antes de declarar entrega em produção.

## Pendências do relatório original

| Achado | Situação atual | Próxima prova/correção |
|---|---|---|
| A03 P2 | Não alterado. | Validar permissão `technicians.password_reset.run` antes de enfileirar reset originado por provisionamento, inclusive backup prévio. |
| A04 P2 | Não alterado. | Rejeitar `client_ids=[]` para perfil `client` ou corrigir atomicamente o vínculo efetivo. |
| A05 P2 | Não alterado. | Orçamento atômico de tentativas MFA, com concorrência e desafios paralelos. |
| A06 P2 | Não alterado. | Limpeza seletiva, auditada e idempotente do resíduo histórico, sem ler/expor senha; considerar retenção dos backups anteriores. |
| C01/C02 | Riscos de concorrência ainda não comprovados. | Exercitar exclusão de cliente e rotação de credenciais em PostgreSQL descartável antes de introduzir locks/migration. |

O acesso a um grupo de código de autenticação/administradores foi recusado pela verificação automática de segurança da ferramenta durante esta rodada. Essa recusa não constitui correção, teste ou evidência de ausência de defeito. Permanecem **11 de 15 achados com ajuste local de fonte**, quatro pendentes e dois riscos a confirmar. A melhoria de política M01 permanece fora da contagem.

## Ativação e validação restantes

1. Confirmar autorização/navegação com perfis restritos no ambiente publicado, após o Chrome real ter aprovado foco, Escape, Tab/Shift+Tab, bloqueio do fundo e restauração de foco. O build local já passou e não precisa de nova suíte integral.
2. A instalação conjunta no 220, dependência `cryptography`, imagem PostgreSQL 17 e restauração real de conjunto anteriormente aprovado estão verificadas. Atualizar o emissor 221 e receber **um novo conjunto real**, confirmando resposta de sucesso somente após restore, marca de recuperação e retenção com cópia aprovada preservada. A falha fechada já tem prova sintética dirigida; não corromper backup real para repeti-la.
3. Resolver os quatro itens A03–A06 e, se comprovados, C01/C02 em blocos próprios. Planejar uma migração MFA somente após aceitar o contrato; não tocar em dados históricos por aproximação.
4. Registrar resultados finais, atualizar versões quando houver publicação, fazer commit/push e pull no servidor canônico, confirmar saúde de API/web/nginx/DB sem alterar Zabbix ou Theo. O package pfSense permanece inalterado.

Este relatório é o estado de trabalho da correção e **não declara implantação nem fechamento de 15/15**.
