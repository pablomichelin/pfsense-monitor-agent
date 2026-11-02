# 207 — Confiabilidade das atualizações

Data:02/11/2026. Implementação autorizada; não autoriza upgrade do firmware. Oito equipamentos excluídos e HA/CARP preservados.

Contrato final: package0.5.29; API0.14.1; web1.15.2. Estados explícitos em pfsense_update_details: checking, waiting, current, available, channel_required, error; etapa, código de saída/HTTP, tentativas e próxima consulta. Migração aditiva JSONB; fallback para agentes anteriores. Somente consultas transitórias repetem automaticamente (60/180/600s, limite3); reparo/seleção/instalação nunca repetem por essa política. Após esgotamento volta à cadência normal6h. Operações do agente compartilham lock de kernel; nunca apagar locks nativos. Escrita de cache atômica e diagnóstico sanitizado.

Canais: apenas estáveis, sem RC/beta/preview e sem fallback para maior versão não comprovadamente estável. IPv4 preservado entre refresh e consulta. Download versionado e hash obrigatório; preservação de releases em uso. Antes de lote: manifesto local versus API e bytes baixados, LAB e canário. Validação em blocos dirigidos sem repetição cumulativa.

## Implementação e validação

API0.14.1 e web1.15.2 publicadas, migration aditiva aplicada e saúde confirmada. Package0.5.28 foi publicado e instalado somente no LAB; a prova operacional encontrou herança de descritores de travas após reiniciar o agente. O artefato não foi sobrescrito: package0.5.29 acrescenta close-on-exec aos locks do journal e ao descritor original do mutex; somente FD3 é delegado ao instalador, sendo fechado pelo serviço rc.d. Referência: [PHP fopen flag e](https://www.php.net/manual/en/function.fopen.php).

Evidência real: procstat no LAB mostrou o daemon e loop mantendo .drain.lock mesmo após terminar o instalador. A telemetria continuava chegando, mas o próximo comando permanecia pending. Não remover arquivos de lock. Recuperação pontual: reiniciar somente monitor_pfsense_agent por acesso administrativo antes da atualização e, na transição do processo antigo, após a instalação. Sem reboot do pfSense. A correção impede novas heranças, mas não revoga descritores já abertos por processos antigos.

Grupos aprovados sem repetição cumulativa:
- cache, retries limitados, canais estáveis, IPv4 e sintaxe;
- integração do checker completo com descoberta de canal e HTTP400 sanitizado;
- seis casos API: manifesto/bytes públicos, hash, artefatos antigos e DTO;
- oito casos de apresentação dos estados;
- PostgreSQL17 isolado: migration e JSON sem perder a linha existente;
- FreeBSD LAB: consulta nativa, exclusão por mutex e morte do supervisor;
- regressão nova de herança: descendente vivo não retém .state.lock/.drain.lock; fechamento de FD3 libera o mutex;
- somente grupo de mutex repetido após alterar seu close-on-exec; API/web não foram recompiladas por alteração exclusivamente PHP;
- builds finais API/web e artefatos28/29, recusa de sobrescrita, download27 imutável e preflight público real.

LAB: upgrades28 e29 succeeded; após recuperar o serviço antigo, comando de backup72d22a4e succeeded e heartbeat0.5.29 trouxe estado current sem erro. Canário CE2.8.1: acesso pelo painel autorizado, serviço reiniciado, upgrade7412bcf8 succeeded para0.5.29; recuperação pós-instalação executada. Backup seguinte e3ca7e16 succeeded. Heartbeat final confirmou channel_required, target2.9.0, erro nulo, retry0; pfSense permanece2.8.1. Serviço ativo/version29 também conferidos no navegador.

SHA256 package29: `1987d70d37bac7f13d8ba73156e8b10b1621a619650f8e2afd59faac2314ed7d`. Fontes669df06 e publicaçãofd8863d em origin/main e221. Imagens API/web publicadas antes do ajuste PHP; bundle cifrado `runtime-update207-fd8863d.tar.gpg` preservado no220, checksum e importação aprovados.

## Distribuição e limites

Ainda não enfileirado lote56: preservar exatamente os IDs do lote13c5cb42-2d9b-4617-babd-7edcd627cbc7 e os oito excluídos. Acesso administrativo é necessário para recuperar agentes que já herdaram a trava; não há credenciais pfREST ativas cadastradas para esses56. A inexistência de SSH22 no canário foi contornada pelo painel9999, sem habilitar SSH nem alterar regras de firewall. Não alegar trava comprovada nos56 sem inspeção individual.

O HTTP400 do repositório Plus continua sendo falha externa, agora diagnosticada de forma útil; causa de licença não comprovada. Nenhum upgrade do sistema operacional, reboot, seleção de canal da frota ou alteração HA/CARP foi executado. Temporários LAB e contêiner PG novos removidos. Artefatos publicados anteriores são preservados porque comandos antigos usam seus bytes exatos, não são lixo de teste.
