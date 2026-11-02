# 206 — Detecção de atualizações do pfSense

Data: 02/11/2026. Escopo autorizado: investigar e corrigir a detecção; nenhum upgrade de firmware ou reboot. Package 0.5.27 e web 1.15.1; API e schema inalterados. Publicação e rollout em validação.

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
