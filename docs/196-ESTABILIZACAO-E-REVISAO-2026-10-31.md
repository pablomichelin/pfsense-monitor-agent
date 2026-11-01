# Estabilização e revisão independente — Monitor pfSense

Data de início: 31/10/2026 (America/Sao_Paulo).
Objetivo: corrigir a auditoria de 27/10 e consolidar o que ainda exige decisão ou laboratório.
Estado: controlador publicado e saudável; não representa homologação da frota.

## Escopo e preservação

As 49 alterações anteriores foram preservadas em snapshot antes da implementação. Os oito firewalls persistentemente degradados foram expressamente excluídos: sem investigação individual, mudança de classificação de saúde, comandos ou atualização de appliances. Não houve intervenção em Zabbix, Theo ou outros projetos.

Controlador publicado: API **0.12.0**, painel **1.13.0**. Package publicado e alvo do controlador permanecem **0.5.25**; fonte **0.5.26 candidata**, sem distribuição; o artefato foi construído para validação e será removido com o staging, evitando cópia de release não homologada. O protocolo do servidor continua compatível com o agente publicado; ACKs e payloads mantêm os formatos existentes.

## Correções realizadas

| Área | Resultado concreto | Limite |
|---|---|---|
| Arquivos sensíveis | Configurações reais (incluindo .env legado do painel) e dumps em 0600; diretórios de backup em 0700 | Não houve rotação de credenciais |
| Backup PostgreSQL | Novo dump de 76.964.989 bytes, checksum, restauração isolada de 42 tabelas; agendamento diário às 04:15 com até 10 min de dispersão | Cópia externa e recuperação conjunta de arquivos criptografados/chaves ainda não comprovadas |
| Script de backup | Lock, arquivo parcial, validação antes de publicar e retenção só após sucesso | Retenção local padrão de 7 dumps |
| Restore | Sem rede externa, limites de CPU/memória, erro interrompe restore, checksum vinculado ao arquivo selecionado e remoção de volume temporário | Não constitui ensaio de desastre completo |
| Técnicos | Listagem, contagem, detalhe e seleção por UUID respeitam clientes autorizados; notas globais ocultadas a ator restrito | Cadastro global e primeiro vínculo exigem escopo global; operações por firewall mantêm RBAC próprio |
| Comandos | Guard explícito por tipo, estados terminais condicionais e admissão serializada por node | Operações sensíveis exigem seus endpoints específicos |
| Senhas | Cada nova operação não reutiliza silenciosamente comando anterior; sem senha/hash em chave de idempotência | Conflito com operação ainda ativa exige aguardar/cancelar |
| Reboot | Manutenção e enqueue atômicos; compensação em falha, cancelamento e expiração | Agendamento bem-sucedido preserva janela de manutenção; não foi executado reboot real |
| Upload de backup | Sucesso e auditoria atômicos; cancelamento vencedor preservado; follow-up só pelo vencedor | Retomada pós-crash do follow-up ainda merece ensaio próprio |
| Exclusão de host | Confirmação de vínculo revalidada sob lock; exclusão/auditoria na mesma transação | Arquivos .enc não são apagados irreversivelmente; inventário auditado permite revisão/limpeza posterior |
| Token no painel | Credencial exibida uma vez no estado do componente; sem URL; seletor ampliado além de 20 | Inventário atual ainda limita 1.000 itens, com aviso |
| Interface | Permissões reconhecer/resolver separadas; usuários só superadmin; erros de carga explícitos; IPv6 /128; consultas antigas invalidadas | Remoção real de IP não foi ensaiada |
| Polling/SSE/lotes | Polling sem sobreposição; atualização inicial/reconexão SSE; alvos explícitos e limite efetivo do lote | Não há divisão automática de lote nem seleção implícita de toda a frota |
| Autenticação dos agentes | Categorias fixas para investigar recusas, sem corpo, assinatura ou credencial em novo log | Não houve relaxamento de HMAC, janela de horário ou anti-replay |
| Porta interna | 8088 restrita a loopback; acesso LAN 3031 preservado pelo override existente; healthz 200 em ambos | Regra INPUT existente bloqueava loopback; exceção limitada a lo/127.0.0.1:8088 persistida |
| Dependências/build | Next 15.5.28, React 19.3.1, Nest 11.2.8, Fastify 5.12.7 e correções transitivas; npm ci | Avisos residuais do CLI Prisma e ferramentas de build separados de caminhos HTTP |
| Package candidato | Framing preserva campos vazios, ACK antes de executar, limpeza sensível, instalador contido no artefato validado | Sem homologação FreeBSD/HA/CARP nem envio à frota |
| Segredo do instalador | Fluxo novo transmite segredo por ambiente restrito e o remove antes de auxiliares; PHP recebe opção em memória | Chamadores/artefatos legados 0.5.25 mantêm fallback argv avisado para preservar identidade; candidata 0.5.26 usa ambiente |

MFA: a fonte já utilizava consumo atômico dos códigos. O teste com dois desafios concorrentes no PostgreSQL confirmou um único consumo; não foi aplicada alteração especulativa.

## Validação por grupos

As evidências aprovadas foram reaproveitadas. Após a orientação do usuário, não houve repetição cumulativa de suítes; novos achados receberam somente regressões dirigidas. Compilar a imagem final é a etapa de publicação.

| Grupo | Evidência |
|---|---|
| API e regressões funcionais iniciais | 123 testes aprovados; 8 integrações opt-in estavam separadas |
| PostgreSQL 17: escopo, MFA e exclusão concorrente | 15 testes aprovados, 39 migrations aplicadas no banco descartável |
| PostgreSQL 17: comandos concorrentes | 4 testes aprovados |
| Painel: fluxos iniciais | 17 testes aprovados; TypeScript aprovado |
| Painel: regressões da revisão | 8 testes novos aprovados uma vez |
| Package: protocolo e falhas | 16 testes aprovados em Linux, além da execução inicial local |
| Package: transporte do segredo | 3 testes dirigidos aprovados em Linux; teste adicional de instalador legado aprovado localmente; suíte anterior não repetida |
| Backup do controlador | Sucesso/falhas/lock/permissões com Docker simulado; restauração real isolada de 42 tabelas |
| Checksum do restore | Troca de alvo, alteração de bytes e sidecar com múltiplos arquivos recusados antes de iniciar restore |
| Regressões finais: rota genérica e upload/CAS | 2 testes dirigidos aprovados na imagem final |
| Build final e integração no navegador | API 0.12.0 e web 1.13.0 compilados; login sintético, token emitido para o 30º firewall com URL sem segredo, ocultação e seleção explícita de lotes com limite 100 confirmados no navegador |
| Saúde pós-publicação | API, painel, nginx e PostgreSQL saudáveis, sem reinícios; 8088 somente loopback e 3031 somente LAN; painel usa a mesma imagem limpa validada em staging |

## Nova revisão com agentes e contrapontos

Três revisores independentes examinaram backend/banco, frontend e package/operação. Receberam código e diff, sem justificativas das correções. O coordenador compartilhou os achados entre eles e solicitou contrapontos sobre bloqueadores do controlador versus homologação do package.

A revisão identificou e levou à correção de: rota genérica contornando gates de upgrade, upload sobrescrevendo cancelamento, polling lento descartando respostas válidas, lote maior que limite efetivo, usuários não-superadmin quebrando por 403, janela inicial do SSE, segredo em argumentos e checksum desvinculado. Não foi alegada exploração real em produção.

Consenso: os bloqueadores do controlador precisam ser fechados por casos dirigidos; homologação do package é separada e impede sua distribuição. Os avisos remanescentes de configuração/CLI não justificam automaticamente uma migração maior do Prisma sem caminho externo demonstrado.

## Pendências prioritárias para avaliar

1. **Recuperação fora do host:** definir destino externo, política de retenção e custódia de chaves; ensaiar PostgreSQL + arquivos .enc + configuração/chaves em host limpo. O restore atual comprova apenas PostgreSQL.
2. **Homologação do package 0.5.26:** pfSense CE suportados, HA/CARP/XMLRPC, reinício, interrupções, ACK perdido e operações de conta em laboratório. Somente depois considerar canário autorizado; os oito excluídos continuam fora do escopo.
3. **Recusas HTTP 401:** observação agregada inicial de 30 minutos encontrou 3.494 heartbeats aceitos e 55 recusados; os logs antigos não permitiram determinar causa. Usar novas categorias sem rotacionar/alterar firewalls por inferência.
4. **Entrega durável de comandos:** ACK persistido com resposta perdida falha de forma segura, mas pode exigir expiração e reemissão pelo operador. Definir estado explícito e recuperação sem reexecutar ação sensível por engano; testar follow-up após crash.
5. **Arquivos de backup após exclusão:** inventário fica preservado na auditoria; implementar reconciliação recuperável para ingestão/retenção/exclusão, com política explícita antes de limpeza física.
6. **Paginação no servidor:** superar o limite de 1.000 no inventário/seletor e paginar alertas na API; medir carga antes de ampliar limites.
7. **Dependências de ferramentas e cadeia de entrega:** audit final do painel sem avisos. API mantém 3 entradas high na cadeia Prisma/config/deepmerge-ts; sem caminho HTTP identificado, pois CLI recebe schema/migrations empacotados. Atualização maior e remoção de ferramentas da imagem de runtime merecem rodada própria. Tags de imagens e geração determinística de tarballs também podem ser melhoradas.

## Ocorrências de publicação, isolamento e limpeza

A sincronização de fonte alterou a propriedade de arquivos/diretórios. O snapshot anterior comprovou root:root no código e essa propriedade foi restaurada. O diretório operacional de backups criptografados foi mantido em 100:101, conforme os 85 diretórios existentes e o usuário do container; a API confirmou acesso de escrita sem criar nem alterar arquivos de clientes. Dados PostgreSQL, arquivos .enc e credenciais não foram copiados para o Mac.

A verificação final encontrou regra INPUT preexistente que aceitava as LANs e derrubava todo o restante da porta 8088, incluindo localhost. Foi acrescentada exclusivamente a exceção `-i lo -d 127.0.0.1/32 -p tcp --dport 8088 -m comment --comment monitor-pfsense-localhost -j ACCEPT`, antes do bloqueio, em runtime e em `/etc/iptables/rules.v4`. Não foi salvo o conjunto de outras regras runtime. O healthz em localhost retornou 200/API 0.12.0 após essa correção; a LAN 3031 e o login público também responderam.

A publicação detectou `.env` legado dentro de `apps/web`, ausente da cópia isolada. Esse contexto acionou uma recompilação de publicação; não foi repetida suíte funcional. O arquivo legado foi protegido em 0600, configurações aninhadas foram excluídas em `.dockerignore`, e o painel foi substituído pela imagem limpa já validada no navegador, sem novo build. O segredo legado não foi exibido nem copiado para documentação.

A rede temporária criada automaticamente pelo Docker recebeu 192.168.80.0/20, que conflitou com a rota para a rede de acesso do Mac. A conexão direta foi interrompida; acesso pelo servidor vizinho permitiu remover exclusivamente a rede/DB de teste e recriá-los em 10.77.18.0/24. O acesso direto foi restabelecido e o Monitor permaneceu saudável na verificação subsequente. Não foi feita mudança de rede de produção nem de serviço Zabbix. Para novos ensaios, reservar faixa explícita antes da criação.

SHA-256 do artefato candidato construído após o ajuste de compatibilidade: `bda9e1dc9d3fe6af9ec03c2301b3b837a950fcb13acd42517445c4ffd5d5c0b0`. O alvo de distribuição não foi alterado.

Os volumes órfãos gerados pelos primeiros containers de restauração/teste foram identificados por data de criação e removidos individualmente; não houve prune global de recursos compartilhados. A limpeza final remove recursos e cópias desta sessão, preservando backups operacionais e entregáveis úteis. Snapshot anterior: `backups/source-before-stabilization-20261031.tar.gz`, protegido em 0600.

## Próxima ação

Controlador implantado. As próximas melhorias são as pendências priorizadas acima. Percentuais históricos de fase/plano não foram elevados: validação sintética e implantação do controlador não substituem homologação da frota.

Referências de segurança verificadas: [Next Server Components](https://github.com/vercel/next.js/security/advisories/GHSA-8h8q-6873-q5fj), [Nest/Fastify](https://github.com/nestjs/nest/security/advisories/GHSA-6v32-fjc9-9qf6). Os intervalos do registry foram conferidos no lock efetivamente gerado; contagem de avisos não equivale a exploração comprovada.
