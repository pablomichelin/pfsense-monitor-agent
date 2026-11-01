# 199 — Nova revisão de bugs, erros e melhorias

Data: 01/11/2026, America/Sao_Paulo. Base examinada: `1ecb6f8d99c6f1cbf3903c0287b0818f8d06e924`, API **0.13.0**, painel **1.14.0**, package **0.5.26**. A revisão anterior e suas provas continuam em [198](198-FECHAMENTO-ESTABILIZACAO-E-RECUPERACAO-2026-11-01.md).

Esta rodada investiga e propõe correções. Não altera código de execução, banco, agendamento, credenciais ou appliances. Os oito firewalls excluídos e HA/CARP permanecem fora do escopo. Não houve instalação de dependências, build ou repetição de suítes aprovadas.

## Método e limites

Foram abertas quatro frentes independentes: autenticação/permissões, frontend, durabilidade/backend e package. A coordenação revisou recuperação externa e operação. As duas frentes de durabilidade e package foram interrompidas pelo bloqueio automático de segurança da ferramenta, sem relatório final; não houve tentativa de contornar o bloqueio. Assim, esta rodada não representa consenso de quatro revisores nem nova aprovação integral do agente e da máquina de estados.

Os achados distinguem: comportamento reproduzido em memória com dados sintéticos; observação atual agregada de produção; e hipótese de concorrência apoiada pelo código, ainda sem execução em PostgreSQL. PoCs com dependências simuladas provam o fluxo dos métodos examinados, não substituem teste HTTP ou concorrência real. Não foram lidos valores de senhas, XMLs ou identidades de clientes para produzir o relatório.

P1 significa corrigir primeiro pelo potencial de seleção de identidade errada ou perda da recuperação. P2 significa falha funcional ou de proteção que merece bloco próprio. Não há evidência nesta rodada de exploração ou corrupção dos backups atuais.

## Resultado consolidado

**15 achados sustentados por código, reprodução sintética ou observação atual: dois P1, doze P2 e um P3.** Separadamente, dois riscos P2 de concorrência ainda precisam de prova em PostgreSQL. A continuidade de sessões após troca de senha foi reclassificada como melhoria de política, sem entrar nessa contagem. As reproduções de frontend são lógicas, em memória; não foram executadas no navegador publicado.

| Ordem | Grupo | Resultado |
|---|---|---|
| 1 | F01 — P1 | Seleção na segunda página da instalação pode gerar comando para outro firewall |
| 2 | A01 — P1 | Retenção externa pode substituir cópias boas antes de validar recuperação |
| 3 | A03–A05 — P2 | Permissão de reset por rota alternativa, falso sucesso de escopo e tentativas MFA sem orçamento |
| 4 | F02–F09 — P2 | Resultado atribuído a outro técnico, redirecionamento externo, resumo incompleto, permissões e atualização/consulta de estados |
| 5 | A06 — P2 | Um segredo histórico persiste em comando terminal; resposta atual de histórico o oculta |
| 6 | F10 — P3 | Confirmações sem controle completo de foco do teclado |
| A provar | C01–C02 — P2 potencial | Exclusão/cadastro concorrentes e duas rotações de credenciais |

Não são dezessete falhas demonstradas em produção. A numeração preserva a origem e o grau de prova de cada item.

## A01 — P1: retenção externa não depende de recuperação comprovada

**Fontes:** `scripts/backup-controller-dr.py:109–134,364–404`; `scripts/controller-dr-common.py:137–154`; `scripts/verify-controller-dr.py:208–231`; `infra/systemd/monitor-pfsense-dr.service` e `.timer`.

O emissor copia os arquivos cifrados, verifica estabilidade do arquivo e comprimento `size + 28`, e calcula um novo hash do ciphertext. Ele não verifica a autenticação AES-GCM nem compara o XML recuperado com seu hash original. O receptor verifica tamanho/hash do transporte, publica e remove os conjuntos além dos sete mais recentes. A restauração/GCM existe no verificador separado, mas o serviço diário executa somente o backup.

**Gatilho e impacto:** corrupção de um arquivo.enc que preserve seu comprimento pode entrar em novos conjuntos com checksum de transporte válido. Com execuções sucessivas, a retenção pode remover a última cópia comprovadamente recuperável antes de detectar o problema. Um arquivo afetado não implica que todos os dados de todos os conjuntos estejam perdidos.

**Prova nova, isolada:** um envelope AES-GCM sintético com tag alterada foi rejeitado pela decifragem real do Node, mas aceito por `materialize_refs`. Em diretório temporário privado, um oitavo fluxo com tamanho/hash válidos, cujo conteúdo não era arquivo GPG recuperável, foi publicado e provocou a exclusão do mais antigo. Saída resumida: `gcm_rejects_corrupt_payload=true`, `sender_materialize_accepts_corrupt_payload=true`, `receiver_publishes_transport_without_restore_check=true`, `oldest_transport_set_pruned=true`, `retained_count=7`. As sete fixtures anteriores eram conjuntos sintéticos de transporte, não backups reais aprovados. Todos os diretórios da prova foram removidos.

**Contraprova:** o verificador manual detecta corrupção GCM e já existe recuperação aprovada em rodada anterior. O defeito é a falta de vínculo entre essa prova e a retenção automática, não ausência de ferramenta de recuperação.

**Correção proposta:** verificar os arquivos referenciados antes da publicação e manter estado explícito de recuperação aprovada no destino. Preservar pelo menos um conjunto aprovado até que um sucessor tenha passado pela restauração/verificação. Uma falha de verificação deve bloquear a remoção da última cópia boa e gerar alerta.

**Aceite dirigido:** conjunto íntegro; ciphertext corrompido com mesmo tamanho; dump inválido com transporte íntegro; falha do verificador; retenção com sete conjuntos e um sucessor reprovado. Executar esse grupo uma vez após desenvolver o bloco.

## M01 — melhoria: definir efeito da troca de senha sobre sessões e desafios MFA

**Fontes:** `apps/api/src/admin/admin.service.ts:1324–1354`; `apps/api/src/auth/auth.service.ts:233–249`; `apps/api/src/auth/mfa.service.ts:275–299`.

`updateUser` substitui o hash da senha, mas revoga sessões somente ao desativar o usuário. Sessão e desafio MFA anteriores não têm vínculo com uma versão da credencial. Uma troca usada para conter comprometimento deixa acesso anterior válido até expiração/revogação própria.

**Evidência:** o agente executou métodos reais em memória com dependências sintéticas; uma sessão/CSRF continuou válida após a alteração. Um desafio anterior também foi aceito com verificador de fator simulado. Isso não demonstra bypass do TOTP. Exige sessão obtida anteriormente ou desafio anterior acompanhado de fator válido. A tela não precisa prometer logout para que a limitação de contenção exista.

**Contraponto final:** o revisor de autenticação retirou a classificação inicial de bug P2 contratual: a tela oferece troca cadastral e revogação separada, sem prometer logout. A continuidade observada permanece factual, mas a nova política é proposta, não defeito contratual confirmado. Não entra na contagem dos quinze achados.

**Melhoria proposta:** definir explicitamente a política de troca/reset e, quando a intenção for conter comprometimento, revogar sessões e consumir desafios pendentes atomicamente. Avaliar versão de credencial para impedir emissão concorrente baseada na senha anterior. Informar ao administrador o efeito aplicado.

## A03 — P2: provisionar conta existente contorna a permissão específica de reset

**Fontes:** `apps/api/src/technicians/technician-accounts-batch.controller.ts:42–64`; `apps/api/src/technicians/technicians.service.ts:799–818,1061–1120`.

`batch-provision` exige `technicians.manage`. Quando o usuário já existe no snapshot, o planejador converte o provisionamento em `local_user_set_password`, sem exigir `technicians.password_reset.run`. A rota própria de reset exige essa permissão.

**Evidência:** guard e planejador reais exercitados em memória: reset direto negado, provisionamento permitido e operação de reset capturada. Nenhum comando foi enviado. Depende de perfil com a primeira permissão sem a segunda, técnico visível e alvo autorizado/elegível; os controles de escopo e backup não são eliminados.

**Correção proposta:** autorizar a operação efetivamente planejada antes de alterar o cadastro ou criar follow-up, incluindo o caminho que precisa de backup prévio. Não confiar somente no nome da rota.

## A04 — P2: remover escopos de perfil client responde sucesso sem remover acesso

**Fontes:** `apps/api/src/admin/admin.service.ts:679–706`; `apps/api/src/auth/access-policy.service.ts:37–54`.

O setter aceita `client_ids: []` e apaga `user_client_scopes`. Para o perfil `client`, porém, a política consulta `users.client_id`, que permanece preenchido. A resposta vazia não representa o acesso efetivo.

**Evidência:** métodos reais em memória retornaram e armazenaram escopos vazios, mantendo acesso ao cliente original. Não permite escolher cliente arbitrário. O vínculo único desse perfil é intencional; o falso sucesso do setter é o problema.

**Correção proposta:** rejeitar esse setter para `client`, com orientação sobre o vínculo efetivo, ou encaminhar a uma alteração específica e atômica que respeite o contrato desse perfil. Exibir escopo efetivo na confirmação.

## A05 — P2: desafio MFA não limita tentativas inválidas

**Fonte:** `apps/api/src/auth/mfa.service.ts:270–299`.

Uma falha de fator apenas lança exceção. Não incrementa tentativas nem consome/bloqueia o desafio. O agente aplicou cem falhas sintéticas e depois fator simulado válido no mesmo desafio, aceito pelo método real. Não houve força bruta HTTP, medição de capacidade ou tentativa contra contas reais.

Exige desafio válido obtido após senha correta. Expiração e consumo atômico após sucesso funcionam. As configurações de aplicação/nginx examinadas não apresentaram controle correspondente; limites externos ao repositório não foram comprovados.

**Correção proposta:** orçamento atômico por desafio, limite adicional por usuário e tratamento de desafios paralelos, com resposta/auditoria que não exponha fatores. Validar limite, concorrência e expiração no mesmo grupo de autenticação.

## A06 — P2: resíduo histórico de senha em comando terminal

**Fontes/evidência:** consulta somente leitura agregada em `node_commands`, sem selecionar senha ou identidade. Existe **um** registro `local_user_create`, `failed`, criado em **01/08/2026**, com campo `payload_json.password` do tipo string não vazia. Nenhum follow-up de backup sucedido estava pendente; nenhum comando ativo estava além de `expires_at` na consulta.

É dado histórico remanescente, não prova de regressão do novo protocolo. O serializer atual aplica `scrubSensitiveCommandPayload` em `apps/api/src/commands/command-orchestrator.service.ts:78–82`; a função em `apps/api/src/technicians/technician-accounts.util.ts:270–311` remove senhas diretas e aninhadas das respostas de histórico. Portanto, armazenamento indevido está comprovado, mas exposição via histórico atual não foi demonstrada.

**Correção proposta:** limpeza seletiva, auditada e idempotente de segredos em estados terminais, preservando metadados. Revisar também a política dos backups que já carregam esse registro: limpar a origem não apaga cópias anteriores. Não consultar nem publicar o valor para fazer essa manutenção. Nenhuma limpeza foi executada nesta revisão.

## Frontend — contexto, navegação e acompanhamento

O revisor isolou oito cenários em memória e verificou permissões/acessibilidade por fonte. A coordenação conferiu diretamente os trechos dos dez itens. Isso comprova os fluxos descritos no código, com as limitações de renderização e integração indicadas abaixo.

### F01 — P1: instalação pode gerar comando para firewall diferente do selecionado

**Fonte:** `apps/web/app/bootstrap/page.tsx:245–247,275–284,422–438`.

Na segunda página, escolher B e enviar o formulário “Abrir” perde o cursor: existem campos ocultos de cliente/site/busca/bucket, mas não de cursor. A nova consulta volta à primeira página. O `node_id` explícito B não é encontrado nos itens e `selectedNode` cai silenciosamente no primeiro pendente ou primeiro item A. O comando é solicitado para A. Simulação do agente: **pedido B → comando A**; a coordenação confirmou consulta, fallback e formulário em fonte.

O resumo passa a mostrar A, permitindo perceber a troca, e nada é executado automaticamente. Copiar e executar esse comando, porém, pode associar um equipamento à identidade errada. Não se testou essa execução em appliance.

**Correção proposta:** preservar o cursor/contexto no formulário e nunca substituir um ID explícito por outro silenciosamente; resolver o selecionado individualmente com autorização ou exigir nova seleção. Conferir a identidade imutável antes de exibir o comando. **Aceite:** abrir B na segunda página com pelo menos 51 registros, alterar filtros e testar seleção ausente; comando e resumo devem corresponder ao ID solicitado ou apresentar erro explícito. A prova anterior do relatório 198 para alvo acima do milésimo não cobriu esta submissão específica de “Abrir”.

### F02 — P2: resultado de provisionamento pode acompanhar outro técnico

**Fonte:** `apps/web/components/nodes/fleet-technician-management-panel.tsx:423–426,793–796`.

Começar uma operação para T1 e selecionar T2 enquanto a resposta aguarda mantém resultado de T1, mas busca conta pelo `technicianId` atual, T2. A simulação confirmou T1 falho e T2 ativo fazendo T1 aparecer como “Provisionado”. Não demonstrou envio de comando para técnico errado; é atribuição incorreta do resultado. **Correção:** acompanhar `initialResponse.technician.id` e congelar identidade/ação/alvos da operação exibida.

### F03 — P2: parâmetro next pode redirecionar para outra origem

**Fontes:** `apps/web/lib/internal-path.ts:6–15`; `apps/web/middleware.ts:80–89`.

O sanitizador rejeita `//`, mas aceita uma barra seguida de barra invertida. Em `/login?next=%2F%5Caudit.example/path`, a normalização de `new URL` pode transformar o valor em destino externo. O agente reproduziu mudança de origem com domínio reservado de exemplo. Uma sessão autenticada também passa por esse redirecionamento. Não houve demonstração de extração de cookie ou credencial. **Correção:** rejeitar barras invertidas e controles, normalizar contra origem fixa e verificar a origem resultante antes de redirecionar.

### F04 — P2: resumo pode dizer que não há problemas apesar de equipamento offline

**Fonte:** `apps/web/app/dashboard/page.tsx:20–34,63–65`.

A consulta limita aos primeiros 200 por nome, depois filtra offline/degraded e toma seis. Com os primeiros 200 online e o 201º offline, a seção fica vazia e mostra “Nenhum firewall offline ou degradado no momento”. Simulação confirmou a divergência; indicadores consolidados continuam disponíveis. **Correção:** filtrar exceções no servidor antes do limite e condicionar a mensagem aos totais completos. Caso usa dados sintéticos; não altera a classificação dos oito firewalls excluídos.

### F05 — P2: permissões de seções opcionais derrubam todo o detalhe

**Fontes:** `apps/web/app/nodes/[id]/page.tsx:112–115,138–154`; `apps/api/src/backups/backups.controller.ts:44`.

Com `firewalls.view` e sem `backups.view`, a página autorizada do equipamento consulta backups incondicionalmente; o 403 causa redirecionamento da página inteira. `firewalls.update` sem `tags.view` também dispara consulta de tags cujo 403 é propagado. Prova contratual por fonte, sem sessão real desse perfil. Não amplia acesso. **Correção:** carregar/renderizar cada seção segundo sua permissão específica; uma seção não autorizada não deve impedir a leitura permitida das demais.

### F06 — P2: navegação para outra aba muda URL sem trocar o painel

**Fonte:** `apps/web/components/nodes/node-detail-tabs.tsx:33–48`.

`activeTab` lê `initialTab` somente na montagem. Navegar no mesmo pathname para `?tab=backup`, por exemplo pelo link “Solicitar backup agora” do upgrade, pode preservar overview. A simulação confirmou nova prop backup e estado overview. Botões diretos de aba e recarga funcionam. **Correção:** derivar aba da URL ou sincronizar parâmetros válidos; validar navegação, voltar/avançar e botões no mesmo caso de navegador.

### F07 — P2: atualização da página não incorpora comandos no histórico montado

**Fonte:** `apps/web/components/nodes/node-command-history-panel.tsx:64–89`.

O estado conserva o primeiro `initialHistory`. Se começa sem comandos ativos, o polling não inicia. Novas props trazidas pela atualização/SSE da página podem conter comando novo sem alterar esse estado. A simulação confirmou novas props com ativo, histórico vazio e nenhum timer. Comando e cancelamento podem ficar invisíveis até remontagem; polling já ativo pode atualizar. **Correção:** reconciliar snapshots recebidos e atualizar após ações, preservando IDs e a tentativa correta.

### F08 — P2: falha transitória de consulta deixa backup preso em aguardando

**Fonte:** `apps/web/components/node-config-backups-section.tsx:182–208,277–287`.

Depois de backup aceito, uma leitura de status falha. O catch cancela o timer, mantém comando ativo e deixa botão desabilitado. A simulação confirmou esse estado. O backup pode ter concluído normalmente; recarregar recupera a interface. **Correção:** separar erro da leitura e estado da ação, oferecer retomada e repetir apenas leituras transitórias com espera progressiva e sem sobreposição. Nunca reenviar a escrita para resolver falha de polling.

### F09 — P2: lote concluído continua consultando todos os alvos

**Fonte:** `apps/web/components/nodes/fleet-technician-management-panel.tsx:406–485`.

O efeito encerra conforme existência de IDs, não conforme conclusão de todos os resultados. Manter aberto o lote com backup prévio continua consultando status de backup e conta. A simulação confirmou consultas nos três ticks seguintes a `batchFinished=true`. Para N alvos nesse caminho, até `2N` leituras a cada cinco segundos continuam, além do acompanhamento dos batches. É contagem derivada do fluxo, não benchmark. Fechar resultado interrompe. **Correção:** retirar terminais e encerrar timer quando não houver pendências; limitar concorrência e impedir leituras sobrepostas.

### F10 — P3: diálogos não controlam foco do teclado

**Fonte:** `apps/web/components/confirm-dialog.tsx:52–105`.

O portal declara `aria-modal`, mas não move foco inicial, contém Tab ou torna fundo inerte. Pelo código, controles encobertos continuam alcançáveis ao abrir “Excluir host” pelo teclado. Escape já funciona. Revisão estática, sem navegador/leitor de tela. **Correção:** foco inicial seguro, contenção de Tab, fundo inerte e restauração do foco; testar confirmar/cancelar com teclado.

### Contrapontos entre os revisores

Frontend corroborou A03: esconder o botão específico de reset não mitiga o caminho de provisionamento, e a própria interface avisa que a senha existente será atualizada. Isso é distinto de F02, que acompanha a identidade errada no resultado.

Para A04, o formulário normal exige cliente único e não chama o setter separado; reduz a exposição no uso comum, mas não torna correta a resposta daquele endpoint. Para M01, salvar usuário não encadeia revogação; existe revogação manual por sessão em outra aba. O contraponto final retirou esse item da lista de bugs e preservou a proposta de política. Manter o cadastro do fator MFA não é, por si, defeito; a proposta trata de sessões e desafios de login anteriores, não de apagar o fator cadastrado.

Autenticação também considerou defensável a prioridade P1 de A01 sob seu gatilho de retenção. Ressalva incorporada: o emissor normal exige sucesso do GPG; a fixture de stream não GPG apenas isola a ausência de verificação no receptor. O cenário de corrupção AES dentro de um novo arquivo GPG válido sustenta a preocupação operacional. A ausência de orçamento MFA foi mantida após verificar nginx e guards Nest versionados; controles externos não foram aferidos.

## Riscos de concorrência ainda sem prova em PostgreSQL

### C01 — P2 potencial: exclusão de cliente pode apagar firewall recém-cadastrado

**Fontes:** `apps/api/src/admin/admin.service.ts:1785–1806`; `apps/api/prisma/migrations/20260311170000_init/migration.sql:185–197`.

A contagem que impede excluir cliente com firewalls e o DELETE são separados, sem bloqueio comum. Se outro fluxo confirmar um firewall entre ambos, a cascata cliente → site → node pode removê-lo sem a confirmação/auditoria da exclusão própria de firewall. A PoC do agente comprovou a ausência de rechecagem no método; a cascata foi simulada conforme as FKs. Não houve reprodução concorrente real. Cadastro já visível na primeira contagem é corretamente bloqueado.

**Próximo passo:** provar em PostgreSQL descartável a intercalação entre cadastro e exclusão. Se confirmada, usar bloqueio comum/verificação transacional e impedir cascata destrutiva que contorne a regra de produto. A auditoria atual também precede o DELETE, podendo anunciar sucesso antes de falha.

### C02 — P2 potencial: duas rotações concorrentes podem deixar duas credenciais ativas

**Fontes:** `apps/api/src/admin/admin.service.ts:2080–2101`; `apps/api/prisma/schema.prisma:546–559`; `apps/api/src/common/node-request-auth.service.ts:246–253`.

Cada transação rotaciona as credenciais encontradas e insere outra, sem lock prévio do node nem unicidade de credencial ativa. UPDATEs concorrentes podem não alcançar a inserção da outra transação. A autenticação seleciona somente a ativa mais recente; uma resposta administrativa pode entregar segredo que não será escolhido.

Modelo em memória do agente produziu duas ativas, simulando snapshot/espera de linha. Isso não substitui PostgreSQL real. Exige chamadas administrativas sobrepostas; não foi demonstrado reaproveitamento da credencial original rotacionada.

**Próximo passo:** caso dirigido com duas conexões e barreiras. Se confirmado, serializar pelo node e avaliar índice único parcial, com tratamento dos registros existentes antes de qualquer migration.

## Observação atual de operação

- HEAD local e do 221 coincidiram na base examinada; API, web, nginx e PostgreSQL estavam saudáveis.
- Backup externo diário terminou em **01/11, 05:20:32 -03**, `Result=success`, código zero; timer ativo. Novo conjunto: `dr-20261101T082004Z-ba9f58d6709e444d`, **433.248.064 bytes**, diretório `0700` no 220. Nesta rodada foram consultados metadados, não restaurado esse conjunto.
- Varredura agregada da última hora não encontrou as expressões selecionadas de rejeição de autenticação/erro/resultado indeterminado. É observação limitada por janela e termos, não atestado de ausência de todos os erros.
- Consulta somente leitura: zero comandos ativos vencidos e zero follow-ups sucedidos pendentes; um resíduo histórico de senha descrito em A06.

Saúde e sucesso do transporte não resolvem A01: um backup pode ser recebido corretamente sem ter sua recuperação comprovada.

## Melhorias propostas, sem execução automática

1. **Mostrar recuperação comprovada separada de backup recebido.** Informar horário do último conjunto recebido, último restaurado/verificado e motivo de eventual falha; alertar por atraso/idade e falha do serviço. Associar o estado à retenção de A01.
2. **Prévia das operações sensíveis.** Antes de provisionar em lote, mostrar quantos alvos criarão conta e quantos trocarão senha; conferir permissões da operação real e devolver resultado por alvo.
3. **Confirmar o efeito administrativo.** Retornar escopo efetivo, sessões revogadas e desafios invalidados, evitando que um sucesso HTTP esconda efeito diferente do solicitado.
4. **Auditoria transacional.** Registrar sucesso junto da mudança confirmada; separar tentativa, rejeição e conclusão. O delete de cliente exemplifica a necessidade.
5. **Reserva de cópia aprovada e custódia independente.** Destino fora da LAN e cópia independente da privada GPG continuam propostas conhecidas do relatório 198, não novas descobertas nem mudanças autorizadas neste turno.
6. **Contexto imutável e acompanhamento comum no painel.** Exibir cliente, firewall/UID, técnico e ação associados à resposta; centralizar leitura sem sobreposição, recuperação de falha e parada em estados terminais. Os casos F01/F02/F07–F09 mostram o benefício concreto.
7. **Política explícita de contenção de acesso.** Separar alteração cadastral de senha de uma ação que revoga sessões/desafios, com confirmação do efeito aplicado. Ver M01.

Continuam como melhorias previamente conhecidas, sem nova medição nesta rodada: reconciliação/quarentena de arquivos órfãos, limites seguros do journal, redução de ferramentas de build no runtime e materialização/indexação para frotas muito maiores. Não repetir os números antigos de auditoria de dependências como resultado novo.

## Organização da eventual correção

Desenvolver por blocos, depois validar cada grupo uma vez: **identidade da instalação**; **recuperação/retenção**; **autenticação/permissões/escopos**; **contexto e atualização do painel**; **dados históricos**; **concorrência administrativa**, começando pela prova em PostgreSQL. Repetir apenas caso/grupo afetado por falha ou alteração e registrar o motivo. Builds de publicação e saúde não exigem repetir grupos independentes.

Os critérios de cada achado são propostas de aceite, não testes já executados. Não há nova homologação integral de backend/package nesta rodada. Permanecem somente documentação útil e código/artefatos já existentes; as fixtures locais do novo experimento foram removidas.
