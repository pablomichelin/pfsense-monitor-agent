# 206 — Detecção de atualizações do pfSense

Data: 02/11/2026. Escopo autorizado: investigar e corrigir a detecção; nenhum upgrade de firmware ou reboot. Package 0.5.27 e web 1.15.1; API e schema inalterados. Publicação e rollout concluídos:58 equipamentos autorizados em0.5.27, oito excluídos preservados.

## Causas confirmadas e correção

- Helper procurava canais apenas em `/usr/local/share/...`, mas o CE 2.9 usa `/usr/local/etc/pfSense/pkg/repos`. Corrigidos caminhos e resolução pelo symlink ativo, evitando confundir o default com o selecionado.
- `pfSense-upgrade -c` consulta o canal atual. Agora, após resultado negativo, o checker consulta `-C` quando suportado. Versão em outro canal fica com disponibilidade indeterminada, target e instrução de seleção explícita; não autoriza instalação pelo canal errado. O painel distingue esse estado de erro de consulta. Mantido o fluxo existente de seleção confirmada e nova consulta.
- Parser agora rejeita códigos de erro e mensagens explícitas de falha antes de interpretar disponibilidade. “Nothing to do” genérico não prova atualização do sistema; reconhecida a mensagem oficial “Your system is on a newer version”. Cache incrementado para 8.
- LAB10: Unbound retornava SERVFAIL para Netgate/pfSense, enquanto o DNS do gateway respondia. HTTPS verificado com TLS válido. Adicionados overrides somente para `netgate.com` e `pfsense.org`, via gateway do laboratório, na configuração nativa; reload do Unbound. Sem alteração de DNS na frota.

- Controlador: após pull da release27, host tinha27 e API ainda lia26, confirmado pelo serviço real e checksum. Bind mount do arquivo ficou preso no inode anterior substituído pelo Git. Corrigido para montar o diretório config em leitura; exige recriar API uma vez, sem rebuild.

## Evidência

- Repoc antes: falha de fetch; depois do ajuste DNS: lista oficial 2_9_0 recebida.
- Helper antes: lista e canal vazios; depois: 2_9_0 / Current Stable Version (2.9.0), caminho real e canal default.
- Checker corrigido no CE2.9: cache8, available=false, canal2_9_0, nenhum erro. Resultado coerente com versão instalada. Não comprova upgrade real do OS.
- Oito casos de parser aprovados; três de orquestração; descoberta por link ativo/default/lista; sintaxe PHP/sh; quatro estados do painel. Erro de aspas corrigido antes do grupo do parser; fixture de função com hífen corrigida e só grupos restantes executados. Nenhuma suíte antiga repetida.
- Artefato reconstruído apenas para remover metadados Apple da transferência inicial. SHA256 final: fced4c0ba4482767a791e95733b27d5bb9d2fdee6359810705bed3c03337f4db.

## Operação

Validar atualização remota do pacote no LAB e canário CE2.8.1 antes do lote. Preservar os oito excluídos usando os IDs do lote autorizado anterior, não a versão atual: houve outro lote posterior de oito equipamentos, fora desta sessão. Não alterar classificação de saúde, HA/CARP, Zabbix ou Theo. Não selecionar canal nem iniciar upgrade do OS na frota.

## Publicação e prova real

Web 1.15.1 compilada uma vez, incluindo tipagem, e publicada. API 0.14.0 recriada sem rebuild para corrigir a montagem de config; banco/proxy preservados. Quatro serviços healthy e health público HTTP200. API passou de release26 obsoleta para27 com checksum correto. Imagem anterior da web: sha256:53afd76806ff5d439576425d9101ab8766f68462097267c6d7b7a3fe3e94c335 (referência para reversão operacional).

LAB: comando `2d780279-8212-4319-ba77-27c26ec566b8` succeeded, heartbeat0.5.27, hashes de ambos os helpers instalados iguais ao código final. Canário CE2.8.1: `1c7a11aa-a2ad-45d6-b02c-3c3924b393d5` succeeded, heartbeat0.5.27. Consulta real passou de false sem canal para canal atual2_8_1, lista2_9_0/2_8_1 e target2.9.0 em canal alternativo, sem executar atualização de firmware. Uma solicitação adicional de refresh já havia sido enviada quando a consulta automática terminou; nenhum loop de repetição foi criado.

Lote `1fa29b23-3067-41f0-b761-1ea6075c0398`:56 enfileirados, zero rejeições iniciais, usando exatamente os IDs do lote anterior `13c5cb42-2d9b-4617-babd-7edcd627cbc7`. Resultado final:56 succeeded, zero failed/expired; somados ao LAB e canário,58 confirmados. Temporários próprios de build221 e ensaioLAB removidos; nenhum contêiner de teste criado. Artefato26 preservado para reversão, não é cópia intermediária.

## Resultado de detecção e exceções

Snapshot final após consultas:48 equipamentos anunciaram versão em outro canal, um anunciou atualização no canal atual, oito sem atualização e um com erro real HTTP400 no repositório Plus. Todos os58 passaram a informar canal; oito excluídos permaneceram0.5.26. Sete consultas que falharam por lock durante instalação foram solicitadas novamente após término; sem repetir a suíte ou reenviar instalações.

Plus26.03.1: análise SSH nativa confirmou HTTP400 em data.pkg/data.tzst/packagesite.pkg/packagesite.tzst e “Unable to update repository”, seguidos de “Your system is up to date”. O parser novo corretamente retorna desconhecido/erro. O aviso exec_iobuf_cb aparece primeiro e não é a causa completa. Não atribuir400 a licença sem prova nem forçar upgrade/reinstalação do sistema. Nenhuma configuração desse Plus alterada nesta análise; consultas de metadados somente.

CE2.7.0: erro nativo de determinação da versão remota de pkg. SSH indisponível tanto do Mac como221; consulta remota dirigida confirmou persistência. Reparo allowlistado de repositório solicitado pelo serviço existente (sem comando de upgrade do firmware); resultado abaixo. Não foi alterado canal de nenhum equipamento da frota.

Nota de evidência: a Netgate registra casos de falha de repositório que terminam incorretamente com “up to date” em https://redmine.pfsense.org/issues/15097 . Isso reforça a necessidade do parser conservador; não prova a mesma causa específica nos dois equipamentos atuais.

CE2.7.0: reparo concluído, checked_at15:36:43Z posterior ao pedido15:35:46Z, check_error=null, disponibilidade=false. Sem upgrade do OS. Única exceção final: Plus26.03.1/HTTP400; causa da rejeição pela Netgate não comprovada, sem inferir licença expirada. Correção do Monitor e rollout verificados; não declarar 100% da frota apta a instalar firmware.
