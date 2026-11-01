# 198 — Fechamento da estabilização e recuperação

Data: 01/11/2026, America/Sao_Paulo. Continuação do relatório 196.
Estado: validação operacional final em andamento; atualizar os resultados abaixo antes do encerramento.

## Escopo

Os oito firewalls persistentemente degradados permanecem excluídos de diagnóstico individual, comandos e atualização. HA/CARP foi retirado expressamente do escopo pelo usuário por inexistência de ambiente. Sem alteração de Zabbix, Theo, regras de saúde, firmware ou schema/migrations.

API **0.13.0** e painel **1.14.0** publicados a partir das imagens validadas. Package **0.5.26** passou no LAB10 CE2.9/PHP8.5; atualização remota do agente legado em validação. Não se afirma efeito exatamente uma vez: resultado ambíguo permanece indeterminado e nunca autoriza replay sensível.

## Resultado por frente

| Frente | Alteração e evidência | Limite |
|---|---|---|
| Recuperação externa | Conjunto cifrado antes de sair do221, destino220, retenção7; snapshotPG compartilhado com referências, arquivos.enc e dotenv/chaves; restorePG17 e AES de todas referências/credenciais aprovados | Mesma LAN; não protege perda simultânea220+221 |
| Recuperação da aplicação | Imagens preservadas no220, identidade por hash da configuração/camadas independente do storage Docker; boot isolado sem egress/portas em verificação | Não promove clone nem altera produção |
| HTTP401 | Recusas atuais rastreadas a UID LAB ausente; identidade restaurada preservando segredo; DNS do LAB ajustado e transporteHTTPS válido | Não atribui os1.533 registros históricos sem categoria à mesma causa |
| Comandos | Payload cifrado persistido antespickup, intenção antesrunning, CAS autoriza um vencedor; outbox reenvia resultado; tentativa monotônica protege ACK/result/upload atrasados | Gate persistido>=0.5.26; legado mantém rejeições/scrub e não recebe reentrega sensível |
| Follow-up | Backup concluído é outbox; claim+ownership+child+vínculo+scrub+audit na mesma transação; vínculo inicial do backup também atômico | Sem ressuscitar cancel/expired por recovery |
| Paginação | Cursor estável e memória limitada por página; inventário/seletores50, alertas paginados;1.105 equipamentos reais no PGQA | LeituraO(N) do escopo por página; não se promete latência constante para qualquer frota |
| Laboratório | JournalPHP nativo, fsync/cifra/permissões/restart/outbox; backupprévio e conta descartável create/reset/delete com senha eUnix verificados; conta removida | CE2.9 não substitui ensaio próprio de todas versões/plataformas |

Timer externo no221: diário05:15 America/Sao_Paulo, dispersão até10min, prioridade reduzida. BackupPG local04:15 permanece independente. Chave privadaGPG fica somente no220; pública no221. Nenhum XML puro foi persistido no controlador ou no ensaioDR; descriptografia deXML somente em memória.

## Validação em grupos e contrapontos

- Recuperação/API: **60 casos novos =42+16+2**, compilação dirigida e buildAPI; sem repetir42 nem suítes antigas.
- PostgreSQL real: **8 casos críticos aprovados**, incluindo CAS concorrente, tentativa antiga bloqueada em lock, rollback/outbox, encerramento real de conexão e retomada, dois dispatchers/um child, ownership inicial e uploadfence. Primeiro7/8; o teste de desconexão precisava reconectar o próprio pool morto; somente esse caso foi repetido, aprovado.
- Paginação: **12 casos sintéticos** e tipagem dirigida; PG real aprovou navegação completa em7 ordens/2 sentidos, filtros/presets e RBAC na primeira execução. O casoalertas foi contaminado por reconciliadorHTTP ativo no QA; parado oHTTP, somentealertas foi reexecutado, aprovado.1105alertas,18chamadas, maior chamada120ms, RSS117MiB/crescimento6MiB nesse grupo. Os demais grupos não foram repetidos.
- Navegador: inventário50de1105, próximo cursor, busca do alvo1105; instalação encontra o mesmo alvo; emissão de token para ele, fora daURL, seguida de ocultação. Credenciais exclusivamente sintéticas; DBQA separado.
- DR:15 casos sintéticos,1portabilidade e grupo de assets offline; provaPG/AES real e boot final registrados ao fechar. Sem repetir15 por mudanças independentes.
- Package: novos blocos de falha/journal/fencing e smokePHP noFreeBSD; grupos anteriores16+3 preservados. Ciclo físico backup/create/reset/delete e reinício observados noLAB10.

Revisores independentes e implementadores trocaram contrapontos. Foram corrigidos: backup sempayload ignorado pelojournal; retry de leitura bloqueado porID jáconcluído; falta de fence entre tentativas; nome.enc.UUID incompatível comDR; arquivo órfão após rollback conhecido. O coordenador corrigiu navegação porcursor no navegador usando links normais ao servidor; somente o painel foi recompilado e o comportamento afetado validado. As compilações adicionais tiveram causa concreta: filtro incorreto da cópia de staging, os dois fixes debackup e navegação real. Não houve reteste cumulativo.

## Melhorias adicionais para decisão posterior

| Prioridade | Melhoria | Motivo/decisão necessária |
|---|---|---|
| P1 | Cópia cifrada fora da mesma LAN e custódia independente da privadaGPG | Definir destino/custódia;220 não protege sinistro simultâneo |
| P2 | Reconciliação recuperável de arquivos órfãos após ingest/exclusão/commit incerto | Política de quarentena antes de apagar dados operacionais; não fazer purge irreversível por inferência |
| P2 | Limite/retensão de tombstones do journal | Hojeum registro cifrado porID e varredura linear; não apagar deduplicação/outbox sem reconciliação |
| P2 | Reduzir ferramentas de build no runtime e atualizar cadeiaCLI em rodada própria | Audit completoAPI atual:9 entradas(4high,4moderate,1low), concentradas emCLI/config/glob/merge; sem caminhoHTTP demonstrado. Não usar atualização major automática para fingir riscozero |
| P2 | Materialização/indexação para frotas muito maiores | Nodes usa scanO(N) com blocos250; medir volumes-alvo e latência antes de alterar classificador |

HA/CARP não é pendência desta entrega. Não foram implementadas novas funcionalidades nem apagados backups operacionais para esconder limites.

## Publicação, recuperação e limpeza

Registrar aqui: commit final, resultado do upgrade remoto doLAB/canário, distribuição elegível sem os oito excluídos, ID do conjuntoDR final e boot, arquivos de imagens cifrados, saúde final e limpeza dos recursos exclusivos da sessão. Código, testes úteis, documentação e backups operacionais permanecem; cópias/containers/redes/volumes e arquivos temporários da sessão devem ser removidos individualmente, sem prune global.

Referências: [contrato de entrega durável](../apps/api/src/commands/DURABLE-DELIVERY.md), [journal do agente](../packages/pfsense-package/COMMAND-JOURNAL.md), [recuperação externa](197-DR-CONTROLADOR-EXTERNO-2026-10-31.md), [paginação](../apps/web/test/PAGINATION.md).
