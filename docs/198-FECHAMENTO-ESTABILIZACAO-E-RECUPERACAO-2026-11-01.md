# 198 — Estabilização, recuperação e resultado geral

Data: 01/11/2026 — America/Sao_Paulo. Continuação do relatório 196.

As quatro pendências desta rodada foram encerradas: recuperação externa do controlador, causa das recusas atuais HTTP 401, recuperação durável de comandos e paginação acima de 1.000 equipamentos. API **0.13.0**, painel **1.14.0** e release do agente **0.5.26** publicados.

**58 agentes confirmaram 0.5.26.** Foram o laboratório, um canário CE 2.8.1 e 56 equipamentos do lote `13c5cb42-2d9b-4617-babd-7edcd627cbc7`, todos com upgrade concluído. Os **oito firewalls excluídos permaneceram 0.5.25**: zero comandos do lote e zero mudanças de versão nesse conjunto. As regras de saúde e os serviços Zabbix/Theo não foram alterados. HA/CARP foi retirado expressamente do escopo pelo usuário.

## Resultado por frente

| Frente | Entrega comprovada | Limite da prova |
|---|---|---|
| Recuperação externa | Backup cifrado antes de sair do 221, destino 220, retenção de sete conjuntos; PostgreSQL, arquivos.enc, configuração/chaves, fonte Git e pacote da release | Mesma LAN; não protege perda simultânea dos dois hosts |
| Recuperação da aplicação | Banco restaurado e API, painel e nginx iniciados no 220; rede isolada sem saída externa ou portas publicadas; configuração e camadas das imagens conferidas por hash portátil | Clone descartável, sem promoção ou troca de domínio/proxy de produção |
| HTTP 401 | Recusas medidas eram `unknown_node` do LAB 10, cujo UID estava ausente. Identidade recuperada com o mesmo segredo; DNS eHTTPS do laboratório corrigidos | Os 1.533 eventos históricos sem categoria não foram retrospectivamente atribuídos à mesma causa |
| Comandos duráveis | Payload cifrado antes do pickup, intenção persistida antes do running, CAS com um vencedor e outbox para reenvio do resultado; fence por tentativa em ACK, resultado e upload | Ambiguidade significa `indeterminate`; não existe promessa de efeito exatamente uma vez |
| Follow-up do backup | Claim, ownership, enqueue do filho, vínculo, scrub e auditoria na mesma transação; vínculo inicial do backup também atômico | Recovery não ressuscita comandos cancelados ou expirados |
| Paginação | Inventário, instalação e seletores usam páginas; alertas paginados na API;1.105 equipamentos e alertas exercitados em PostgreSQL real | Listagem de nodes ainda lê o escopo em blocos; custo O(N) por página |
| Agente 0.5.26 | LAB CE 2.9: journal nativo, ciclo real de conta, reinício e atualização remota25→26. Canário CE 2.8.1: upgrade e backup pelo novo protocolo. Demais 56 upgrades concluídos | Não houve teste de corte elétrico físico, de todas as arquiteturas ou de HA/CARP |

O protocolo novo depende da versão persistida>= 0.5.26. O legado 0.5.25 mantém scrub no pickup, não recebe reentrega sensível e rejeita ACK terminal. O campo `delivery_attempt` impede que uma resposta antiga altere a tentativa seguinte. Escritas após intenção de execução não recebem retry automático; leituras e backups idempotentes podem ter nova tentativa explicitamente numerada.

## Recuperação externa e rotina

Conjunto final: `dr-20261101T032626Z-06012f906d274018`, no 220, em `/var/backups/monitor-pfsense-dr/`. Fonte da aplicação preservada: commit `dc0f8c7e2803baa80514ea302b6e895c5a8463f7`. O bundle Git e o pacote/sidecar exatos estão dentro da cifra e cobertos pelo manifesto.

Imagens de execução preservadas em `/var/backups/monitor-pfsense-dr/images/runtime-dc0f8c7.tar.gpg`, com checksum. Cifra, integridade e carga pelo Docker verificadas. A identidade usa SHA-256 canônico de configuração, camadas, sistema e arquitetura, pois o ID apresentado pelo storage Docker muda entre 221 e 220. Tags móveis não substituem essa conferência.

O primeiro conjunto, `dr-20261101T023854Z-943c2e86f8634487`, teve o PostgreSQL restaurado e **todas** as referências.enc e credenciais verificadas com AES-GCM em memória. O conjunto final passou no grupo novo de boot: banco restaurado, manifesto, imagens correspondentes, bind do pacote recuperado e respostas de saúde/login da API, painel e nginx. Os recursos do ensaio foram removidos pelo helper.

Timer externo ativo no 221: diariamente às **05:15**, com até 10 minutos de dispersão e prioridade reduzida. Backup PostgreSQL local das 04:15 continua independente. Pública GPG no 221; privada somente no 220. Nenhum XML puro foi salvo no controlador ou no ensaio de recuperação.

Esse ensaio demonstra recuperação dos dados e inicialização da aplicação. A reposição de um controlador após desastre ainda exige ativação operacional deliberada de domínio/TLS/proxy, workers e integrações. Não se reutilizou senha de usuário real para simular aceite funcional completo do clone.

## Laboratório e publicação

No LAB 10, a conta descartável passou por backup prévio, criação, confirmação da senha e do usuário Unix, troca de senha confirmada contra o novo valor e recusa do antigo, e exclusão. Conta e cadastro de teste removidos. O journal permaneceu root:0700/0600 após reiniciar o serviço.

A atualização legada foi reconciliada antes de qualquer reinstalação quando o download falhou: primeiro por DNS, depois por conexão IPv6 sem resposta. O DNS dos domínios necessários e a preferência IPv4 foram corrigidos somente no laboratório. As duas tentativas anteriores foram canceladas após confirmar versão25, ausência de instalador e interrupção do processo anterior. O novo comando `25be0143-ee91-4adb-9440-414d2608f040` concluiu 25→26 e o heartbeat confirmou 26.

O canário CE 2.8.1 concluiu o upgrade `c33f01ec-2a07-4d09-93a8-10d654483788` e o backup com o protocolo novo `0338b35e-e462-4fea-b119-05e8db1be5f6`. Só então foram enfileirados os 56 alvos restantes, excluindo explicitamente os oito IDs preservados em auditoria. Resultado do lote: **56 succeeded, zero failed**. Sem upgrade de firmware ou reboot de firewall.

SHA-256 da release 0.5.26: `eb55210d591afda59a139a292a685ccf4c42b1f6f81fc6fc0749e276f3d4b80d`. O mesmo artefato foi validado no laboratório e publicado. GitHub atualizado e `git pull --ff-only origin main` executado no 221.

## Grupos de validação e revisão cruzada

| Grupo | Resultado |
|---|---|
| Recuperação/API |60 casos novos:42 + 16 + 2; tipagem dirigida e build |
| PostgreSQL real de comandos |Oito casos críticos aprovados: concorrência CAS, tentativa antiga sob lock, rollback/outbox, desconexão real e retomada, dispatch concorrente, ownership e upload fence |
| Paginação sintética |12 casos e tipagem dirigida aprovados |
| Paginação com PostgreSQL |Navegação única por 1.105 alvos em sete ordens e dois sentidos; filtros/presets, RBAC e alertas aprovados |
| Navegador |50de 1.105, próxima página, busca do alvo 1.105, instalação e emissão de token para ele; credencial fora da URL e ocultada |
| DR |15 casos iniciais, um de portabilidade e três de ativos offline; restauração real de dados e boot da aplicação |
| Package |Blocos novos de journal/falhas/fencing, smoke PHP nativo no FreeBSD e os ensaios reais descritos acima |

Os grupos aprovados foram reaproveitados. No PostgreSQL, somente o caso de desconexão foi repetido após reconectar o pool morto da própria fixture; os outros sete não foram repetidos. Na paginação, o caso de alertas foi contaminado por um reconciliador HTTP ativo no QA; apenas alertas foi reexecutado com oHTTP parado. Nesse grupo isolado, a maior chamada foi120 ms e o RSS 117 MiB, crescimento 6 MiB; isso não é benchmark de carga.

Revisores e implementadores trocaram contrapontos e corrigiram: backup sem payload ignorado pelo journal; retry de leitura bloqueado por ID; falta de fence entre tentativas; nome.enc.UUID incompatível comDR; e limpeza incorreta de arquivo após rollback conhecido. Na integração, a paginação recebeu links normais ao servidor para concluir a navegação com cursor longo. Compilações adicionais foram restritas aos componentes afetados. Suítes antigas e os 42 casos iniciais não foram repetidos cumulativamente.

## Melhorias adicionais para decisão posterior

| Prioridade | Melhoria | Próxima decisão |
|---|---|---|
| P1 | Cópia cifrada fora da mesma LAN e custódia independente da privada GPG | Definir destino e responsável;220 não cobre sinistro simultâneo |
| P2 | Reconciliação recuperável de arquivos órfãos após ingest/exclusão/commit incerto | Política de quarentena e retenção antes de apagar dados operacionais |
| P2 | Retenção/limite dos tombstones do journal | Hoje há um registro por ID e varredura linear; não apagar deduplicação ou outbox sem reconciliação |
| P2 | Reduzir ferramentas de build no runtime e atualizar cadeia CLI em bloco próprio | Audit completo da API: nove entradas, quatro high, quatro moderate e uma low, concentradas emCLI/config/glob/merge; sem caminho HTTP demonstrado |
| P2 | Materialização/indexação para frotas muito maiores | Medir volumes-alvo e latência antes de alterar o classificador; scan atual em blocos de 250 |

HA/CARP não é pendência desta entrega. Os oito degradados continuam expressamente fora do escopo. Essas melhorias adicionais não foram transformadas em uma fila paralela nem em remoções irreversíveis por inferência.

## Saúde final, limpeza e evidências

API, painel, nginx e banco saudáveis, com contador de reinícios zero. Janela final de dez minutos sem novas rejeições de autenticação.

Cópias de QA, quatro contêineres e seu volume PostgreSQL, rede 10.77.18/24, túnel SSH e aba temporária removidos. Instaladores e diretório de laboratório removidos; usuário descartável ausente e agente ativo. Dependências locais instaladas para validação removidas. Permanecem código final, testes úteis, documentação, artefato publicado e backups operacionais. Não houve prune global em hosts compartilhados.

Referências: [contrato durável](../apps/api/src/commands/DURABLE-DELIVERY.md), [journal](../packages/pfsense-package/COMMAND-JOURNAL.md), [DR](197-DR-CONTROLADOR-EXTERNO-2026-10-31.md), [paginação](../apps/web/test/PAGINATION.md).
