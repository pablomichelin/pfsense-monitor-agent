# 204 — Nova revisão de usabilidade com cinco agentes

Data: 02/11/2026. Revisão do código após a implementação descrita no [203](203-IMPLEMENTACAO-REVISAO-202-2026-11-02.md), preservando o [plano visual 201](201-PLANO-BASE-UX-MONITOR-PFSENSE-2026-11-02.md). **Recomendações abaixo ainda não implementadas**, salvo quando expressamente identificadas como entrega desta rodada. O painel em produção não recebeu esta versão.

## Parecer do coordenador

A melhoria mais útil agora é tornar cada tarefa previsível: saber qual cliente/firewall está selecionado, o que os números contam, o que foi salvo e como voltar sem perder o trabalho. Uma nova troca geral de aparência teria menos valor que concluir esses fluxos.

A estrutura atual já avançou: ficha única em usuários, navegação contextual, cancelamento explícito, clientes inativos recuperáveis, paginação no servidor e resumo de backups em uma única resposta. Nenhuma função foi deliberadamente removida. Preservação integral de todos os percursos, contudo, ainda exige a matriz autenticada de aceites; build e inspeção visual sintética não substituem essa prova.

Recomendo três blocos: **permissões e resultados**, **contexto e clareza visual**, depois **desempenho medido e refinamento**. Acessibilidade acompanha todos os blocos. Não recomendo redesenhar o menu inteiro, adicionar cache sem medição ou esconder controles avançados definitivamente.

## Participantes e discussão efetivamente realizada

Cinco agentes trabalharam em frentes separadas e receberam contrapontos dos demais por coordenação. Não são cinco aprovações independentes de todo o código: cada um verificou sua área e discutiu as recomendações conjuntas.

| Agente | Foco e contribuição | Contraponto incorporado |
|---|---|---|
| Feynman | Integridade administrativa: resultado deve diferenciar sucesso, rejeição e indeterminação; nunca repetir escrita sensível automaticamente | Preservar formulário não basta se a resposta de uma operação ficar ambígua; consultar o estado antes de nova tentativa |
| Nietzsche | Instalação: manter alvo, versão, destino e opções vinculados ao comando revelado; evidência sem segredo | Avisos de atualização e anúncios acessíveis não podem divulgar credenciais; nova revelação quando o contexto mudar |
| Linnaeus | Frota/backup: coerência entre entrada, consulta e destino; contagens com universo explícito; medir custo O(N) | Ajustou a proposta de estabilidade: pausar somente mudanças que deslocam foco, campos ou seleção, mantendo aviso de novidades |
| Averroes | Administração: ficha selecionada, rascunhos, Back/Forward e resultados consistentes | Não congelar toda a observação; uma pausa visual não pode impedir acompanhar o resultado de uma operação |
| Sartre | Login e sessões: distinguir limite temporário, indisponibilidade e credencial inválida; preservar busca e destino após MFA | Não revelar existência da conta e não guardar senha em URL/rascunho; totais diferentes são válidos se estiverem rotulados |

**Convergência:** permissões/resultados primeiro; contexto protegido durante interação; notificações continuam chegando; totais e foco claros; medir antes de cachear. **Divergência resolvida:** não pausar toda a página durante leitura comum. Pausar só a atualização que interferiria com edição, seleção ou cópia; continuar sinalizando incidentes e andamento de operações. Isso é uma decisão de desenho proposta, não comportamento já implementado.

## Achados e melhorias após as correções

Prioridade aqui significa ordem proposta de trabalho, não incidente observado.

| ID / prioridade | Evidência e efeito | Melhoria proposta / aceite | Esforço relativo |
|---|---|---|---|
| U204-01 / alta | `lib/route-policy.ts` admite `/backups` com `backups.view`; `app/backups/page.tsx` chama filtros e frota protegidos por `firewalls.view` em `nodes.controller.ts`. Um perfil com só o primeiro direito tem entrada visível e consulta negada. Confirmado por código, sem reprodução autenticada. | Definir contrato próprio de consulta de backups e filtros, sob escopo; manter permissão específica para entrar no detalhe do firewall. Matriz: entrada, lista, filtros, detalhe, download e ação. Não conceder acesso amplo a firewalls como atalho. | Médio |
| U204-02 / alta antes de publicar | `auth/login-client-ip.ts` usa peer TCP se não houver proxy explicitamente confiável. O login passa pela web; configuração inadequada agrega pessoas no IP desse serviço. Limites atuais: 60 por IP/5 min e 10 por conta/IP/5 min. Configuração efetiva no 221 não foi conferida. | Verificar cadeia de proxies/IP real e rejeição de headers falsos em QA e na configuração efetiva. Considerar NAT corporativo na escolha dos limites. Não ativar confiança global para contornar agregação. | Médio; depende do ambiente |
| U204-03 / alta | `lib/auth.ts:loginAction` converte qualquer resposta não OK em `error=1`. O novo 429 ou 503 aparece como falha genérica de credencial e pode incentivar repetição. | Estados de mensagem separados: credenciais inválidas, aguarde e serviço temporariamente indisponível; preservar destino, não senha; nenhum texto confirma existência da conta. | Baixo |
| U204-04 / alta | Operações administrativas ainda precisam distinguir resposta perdida de rejeição. Nova atomicidade corrige o banco, mas não garante compreensão após falha de transporte. Risco de interação, não bug de duplicação provado. | Mostrar “resultado ainda não confirmado”, consultar estado e permitir retry só quando seguro. Exibir cliente/usuário/alvo na confirmação. Nunca repetir reset/exclusão automaticamente. | Médio |
| U204-05 / média | `realtime-refresh.tsx` agenda `router.refresh()` sem contrato de interação ativa. Comando e seleção podem ser reapresentados enquanto a pessoa lê/copia. Não foi reproduzida perda de rascunho causada pelo SSE nesta rodada. | Bloquear apenas substituição visual do contexto em uso; mostrar “há atualizações”, preservar dados locais e manter andamento/alertas visíveis. Retomar após concluir/cancelar. | Médio |
| U204-06 / média | A ficha de usuário deriva apenas da página carregada (`admin-usuarios-tabs.tsx`). Ao mudar busca/página, uma seleção fora do conjunto vira aviso e deixa de exibir a ficha. | Carregar o selecionado por ID sob o mesmo RBAC e mantê-lo até troca explícita; lista pode mudar sem apagar o contexto. Exibir se não pertence ao filtro atual. | Médio |
| U204-07 / média | Sessões próprias exibem “Ativas” e “Total” calculados sobre universos diferentes; descrição permanece “Sessões ativas” mesmo no histórico. Backups têm resumo anterior ao filtro de status. | “Sessões ativas da conta”, “Total no filtro” e “Resumo dos clientes/sites selecionados”; mostrar página/itens e horário de cálculo. Estados vazio, nenhum resultado e acesso negado devem ser distintos. | Baixo |
| U204-08 / média | A tela de usuários ainda busca todas as páginas de clientes para o seletor de escopo. O endpoint de backups ainda varre O(N) por snapshot, embora tenha eliminado varreduras repetidas por página. | Medir antes; depois busca remota no seletor preservando chips já vinculados. Avaliar agregação/indexação do backup se o orçamento de latência exigir. Cache somente com invalidação e escopo demonstrados. | Médio/alto conforme medição |
| U204-09 / transversal | Há selects de filtro sem rótulo explícito na área de backups; teste visual não prova teclado, contraste e leitor de tela. | Rótulos associados, foco visível, retorno de foco após diálogo, erros ligados aos campos, anúncios de resultado sem segredo; testar zoom 200% e viewport estreito sem ocultar ações. | Médio |
| U204-10 / próxima etapa | Priorização na primeira dobra já começou, mas densidade e hierarquia variam entre páginas. | Um título por área, uma ação principal, filtros com chips e limpeza individual, controles avançados expansíveis, estados visuais consistentes. Preservar caminhos para histórico, diagnósticos e comandos existentes. | Médio |

O lock comum entre administração e emissão de sessão é curto e protege invariantes, mas serializa esses trechos. Medir espera sob carga; não há evidência de gargalo atual. A borda/WAF não foi auditada nesta rodada, e a cópia DR já comprovada permanece na mesma LAN; esses pontos não invalidam os ensaios anteriores.

**Achado da revisão já corrigido:** o novo GET de clientes acrescentava uma restrição por nome de papel, além de `clients.view`, que impediria perfis personalizados anteriormente capazes de consultar clientes. A restrição extra foi removida; sessão, MFA, permissão e escopo continuam obrigatórios. Um novo caso dirigido verifica autorização, negativo 403 e escopo; as guardas de escrita não mudaram. A hipótese de que a tela de Usuários falharia apenas por não ter `clients.view` foi refutada: ela exige superadmin e esse papel recebe todas as permissões. Não contar essa hipótese como bug.

## Plano base para a próxima melhoria

| Bloco | Entrega concreta | Critério de conclusão | Validação agrupada |
|---|---|---|---|
| 1 — Acesso e resultado | U01–04, mapa de papéis de instalação e IP real | Perfis autorizados completam o fluxo; negativos negam sem dados; login informa espera/indisponibilidade; escrita incerta não é repetida | Uma matriz HTTP/RBAC/autenticação + cenários de resposta perdida |
| 2 — Contexto e leitura | U05–07 + U09 | Atualização não troca alvo nem rascunho; ficha permanece ao paginar; contadores dizem o que contam; teclado percorre e retorna ao controle correto | Uma rodada desktop/mobile/teclado com edição, Back/Forward, cópia e atualização simultânea |
| 3 — Escala e consistência visual | U08/U10 | Mesmas funções e escopos, menos deslocamento visual; orçamento de latência definido com medida real | Uma medição SQL/P95/memória com 1.105 e 5.105 registros e revisão das telas afetadas |

Não executar novamente testes já aprovados por conveniência. Registrar grupo, evidência, falha e motivo de eventual repetição. Um build final por componente alterado; repetir apenas se uma alteração posterior invalidar esse build.

## Provas disponíveis e limite desta análise

- Build web aprovado; API compilada e recompilada somente após o adendo do guard de clientes. Grupos dirigidos descritos no 203; não houve reteste cumulativo.
- 26 cenários novos aprovados no PostgreSQL 17 real: 20 administrativos e 6 de autenticação. Fixtures sintéticas, sem dados de clientes.
- Navegador real, aplicativo compilado, API sintética: desktop/mobile, rascunho/cancelar, seleção, abas, Back e clientes ativos/inativos. Não prova login real nem submissões no painel publicado.
- Cinco pareceres e contrapontos consolidados. Recomendações não equivalem a cinco auditorias integrais nem certificação de ausência de bugs.
- Ambiente descartável do 220 removido e verificado. Produção no 221 não publicada: SSH indisponível no encerramento da validação.

**Minha recomendação:** concluir o bloco 1 antes de publicar esta mudança estrutural; seguir com contexto, totais e acessibilidade no mesmo padrão visual já adotado. Só depois investir em novos gráficos, personalização extensa ou cache. Os oito firewalls excluídos, classificação de saúde, HA/CARP, Zabbix e Theo continuam fora da intervenção.
