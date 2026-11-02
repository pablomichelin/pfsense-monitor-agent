# 200 — Correções dirigidas dos achados da revisão 199

Data: 02/11/2026. Referência: [relatório 199](199-REVISAO-INTENSA-BUGS-E-MELHORIAS-2026-11-01.md). Os **15 achados tiveram correção implementada e publicada**, em dois blocos: onze no painel/DR e quatro no backend. Os dois riscos de concorrência C01/C02 também receberam correção e prova em PostgreSQL descartável. Versões publicadas: **API 0.13.1**, **web 1.14.1**, **package 0.5.26**. Oito firewalls persistentemente degradados, HA/CARP, Zabbix e Theo permanecem fora do escopo.

## Correções implementadas e publicadas

| Achado | Modificação | Evidência e limite |
|---|---|---|
| F01 P1 | A instalação preserva `cursor` entre formulário, seleção e URL. Identificador explícito ausente impede gerar comando para outro firewall. | Caso dirigido com seleção na segunda página e falha fechada. |
| A01 P1 | O receptor DR preserva a última recuperação comprovada em marca durável; somente após GPG, restore PostgreSQL 17, XMLs AES-GCM e nodeSecrets validados permite retenção. Erro de verificação impede sucesso do envio e preserva conjuntos antigos. | 16 testes sintéticos DR aprovados. Tríade instalada no 220 com SHA verificado; restauração real anterior passou. Novo envio do 221 validado integralmente com `dr-20261102T051150Z-1ec8c4e24214470e`, marca atualizada e quatro conjuntos preservados. |
| F02 P2 | Resultado de lote usa identidade imutável do técnico que iniciou a operação, mesmo se o seletor mudar. | Cenário dirigido de mudança de técnico e resposta assíncrona. |
| F03 P2 | Destino `next` de login aceita apenas caminho normalizado da própria origem, rejeitando backslash, controles e rotas reservadas. | Casos dirigidos de URL externa e caminhos internos válidos. |
| F04 P2 | Dashboard consulta offline e degradado antes de limitar a lista; totais da frota impedem falsa mensagem verde. | Caso dirigido com equipamento offline fora da primeira página alfabética. |
| F05 P2 | Backups e tags são consultados apenas com permissão da seção; falha de seção opcional não derruba o detalhe autorizado. | Caso dirigido com `firewalls.view` sem `backups.view`/`tags.view`. |
| F06 P2 | Aba do detalhe acompanha querystring e navegação voltar/avançar. | Caso dirigido de troca e retorno de URL. |
| F07 P2 | Histórico sincroniza snapshots de servidor novos em componente já montado. | Caso dirigido de comando recém-criado com histórico anterior vazio. |
| F08 P2 | Consulta de status de backup tem retomada e backoff após falha transitória, com leitura serializada; nunca reenfileira a escrita. | Caso dirigido de falha de leitura, retomada e uma só solicitação. |
| F09 P2 | Acompanhamento de lote verifica apenas pendentes e termina ao alcançar estados terminais, com limite de quatro leituras simultâneas e proteção contra operações antigas. | Cenário dirigido de lote finalizado e consultas sem sobreposição. |
| F10 P3 | Diálogo recebe foco inicial em **Cancelar**, contém Tab, torna fundo inerte, permite Escape e restaura o foco de origem. | Chrome headless real passou nas cinco interações; arquivos de ensaio temporários removidos. |

Os testes dirigidos do painel foram executados conforme o bloco afetado, sem reexecutar suítes aprovadas de outras funcionalidades. Typecheck completo do painel e builds Next.js otimizado local e Docker no 221 passaram. Chrome real aprovou F10. O commit `d30cfef` foi enviado para `origin/main` e aplicado por pull no 221; somente o container web foi recriado, saudável, junto de API/nginx/PostgreSQL. HTTP `/login` respondeu 200. O 220 aprovou o boot isolado da release nova (PostgreSQL, API/web/nginx) e eliminou os recursos de ensaio. Arquivo cifrado das **quatro imagens** da release foi gerado para o novo ID, com checksum, GPG e tar verificados, sem plaintext persistente.

## Bloco API 0.13.1: A03–A06 e C01/C02

| Item | Correção publicada | Prova obtida |
|---|---|---|
| A03 P2 | O planejamento do provisionamento verifica a permissão `technicians.password_reset.run` antes de qualquer atualização de conta quando algum alvo elegível já possui o usuário, inclusive com backup prévio. | Dois casos sintéticos dirigidos PASS. |
| A04 P2 | O setter rejeita alteração de escopos para perfil `client`, cujo acesso vem do vínculo único `user.client_id`; a consulta retorna o vínculo efetivo ativo. | Um caso sintético dirigido PASS. |
| A05 P2 | Desafios MFA aceitam até cinco falhas; cada usuário tem até doze falhas em quinze minutos, persistidas e serializadas por lock. Login, recovery code e desativação do MFA compartilham o orçamento; a desativação consome fator e invalida desafios na mesma transação. | Três casos sintéticos, grupo PostgreSQL e caso adicional PostgreSQL de rollback, expiração da janela e concorrência PASS. |
| A06 P2 | Script idempotente `apps/api/prisma/maintenance/20261102_scrub_terminal_local_user_password.sql` apaga apenas o campo de senha do comando terminal histórico conhecido e registra auditoria; aborta se houver múltiplos candidatos. | PostgreSQL descartável PASS; executado uma vez no operacional, **1 registro limpo e 1 auditoria**, contagem residual 0, sem ler/expor o valor. |
| C01 P2 | Exclusão de cliente usa transação, lock do cliente e dos sites, reconta nodes e audita somente após exclusão transacional. | Intercalação real com duas conexões PostgreSQL 17 PASS. |
| C02 P2 | Rotação serializa pelo node; índice único parcial protege a invariável de uma credencial ativa por node. | Rotação concorrente PostgreSQL 17 PASS; produção com 0 duplicatas antes e depois. |

As duas migrations `20261102060000_mfa_attempt_budget` e `20261102061000_one_active_node_credential` foram aplicadas pelo start da API. A pré-verificação do banco apontava 0 credenciais duplicadas e um comando histórico elegível. Após a publicação: **2 migrations concluídas, índice presente, 0 duplicatas, 0 candidatos de senha e 1 auditoria de limpeza**. `docker compose build api` compilou e o container iniciou com versão **0.13.1**; API, web, nginx e PostgreSQL ficaram **healthy**, com HTTP 200 em `/healthz` e `/login`. O código deste bloco está no commit `fc97c4e`, enviado ao GitHub e aplicado por pull no 221.

O conjunto de validação foi executado em blocos, sem repetir suítes antigas aprovadas: dois testes A03, um A04, três A05, um grupo PostgreSQL de concorrência/migrations/limpeza e um caso PostgreSQL adicional dedicado ao `disable()`. O banco PG17, a rede e a imagem QA específicos do relatório 199 e os temporários criados para os testes foram removidos. A revisão cruzada de MFA identificou e permitiu fechar a janela do `disable()`; a segunda revisão delegada encerrou com erro de transporte e não foi contada como aprovação.

## Recuperação, evidências e limites

- Antes da publicação, o receptor no **220** concluiu a recuperação validada do backup cifrado `dr-20261102T064636Z-07c0af51b86e42fc`. Depois, recebeu e restaurou o novo conjunto com API publicada `dr-20261102T065051Z-aea26f2f153244f3`, incluindo banco PostgreSQL 17, arquivos AES-GCM e chaves de teste de recuperação. O backup inclui fonte e pacote vinculados ao commit da release. Os dados e imagens estão no mesmo segmento LAN, sem custódia externa geográfica.
- As quatro imagens exatas da nova versão foram transmitidas como arquivo cifrado `images-dr-20261102T065051Z-aea26f2f153244f3.tar.gpg` no 220 (**366.119.657 bytes**) e o arquivo de checksum foi criado. **A verificação posterior do checksum, o carregamento das imagens e o boot isolado com a API 0.13.1 ainda não foram executados**: a ação combinada foi bloqueada pela verificação automática de segurança da ferramenta. Não tratar esse arquivo como imagem restaurada/comprovada. O boot completo do conjunto anterior (API 0.13.0, web 1.14.1) permanece comprovado em `dr-20261102T051150Z-1ec8c4e24214470e`.
- Os casos A03/A04 foram provados por contratos/simulações de backend; uma sessão real de perfil restrito não foi usada em produção para reenviar operações administrativas. O grupo de concorrência executou em banco descartável, sem exclusões ou rotações contra clientes ou firewalls reais.
- Cópias DR cifradas **anteriores** à limpeza A06 ainda podem preservar o campo histórico e devem seguir política de retenção e custódia das chaves. A limpeza não reescreve backups antigos. A política de revogar sessões após troca de senha (M01), custódia offsite e alertas de dependências permanecem melhorias separadas; não entram nos 15 achados corrigidos.

Oito firewalls persistentemente degradados foram preservados, sem comandos ou upgrades desta rodada; HA/CARP permanece excluído. Nenhuma operação foi executada no Zabbix ou Theo. A pendência operacional concreta desta publicação é **carregar e validar as imagens cifradas no 220 e executar o boot isolado completo da API 0.13.1 por um canal autorizado**.
