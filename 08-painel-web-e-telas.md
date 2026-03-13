# Painel Web e Telas

## Objetivo do painel

O painel web precisa permitir leitura rapida do estado dos firewalls sem exigir acesso individual a cada pfSense.

## Perfis de usuario

- `superadmin`: governa usuarios humanos, sessoes, configuracoes sensiveis e operacao total
- `admin`: opera inventario, bootstrap e fluxo administrativo sem governar credenciais humanas
- `operator`: acompanha status, reconhece alertas e consulta inventario
- `readonly`: apenas leitura

## Rotas principais

### /login

Uso:

- autenticacao do operador

### /dashboard

Uso:

- resumo executivo e operacional

Conteudo:

- cards com totais
- lista de ultimos alertas
- firewalls offline ou degradados
- resumo de distribuicao de versoes do pfSense no ambiente
- destaque para firewalls em versao fora da matriz homologada
- feed em tempo quase real

### /nodes

Uso:

- inventario central

Conteudo:

- tabela de firewalls
- filtros por cliente, site e status
- busca por hostname, IP e nome

### /bootstrap

Uso:

- operacao em lote do bootstrap do agente

Conteudo:

- totais de `prontos`, `agente ativo` e `bloqueados`
- filtros por cliente, site, busca textual e bucket operacional
- resumo do escopo filtrado com opcao rapida de limpar recorte
- fila de firewalls prontos para bootstrap
- montagem do preflight local do node alvo com `verify-bootstrap-release.sh` e `run-bootstrap-preflight.sh`
- atalhos para detalhe do node, comando one-shot e navegacao rapida entre buckets

### /nodes/[id]

Uso:

- detalhe do firewall

Conteudo:

- dados de identificacao
- ultimo heartbeat
- versao do pfSense e do agente
- status de gateways
- status de servicos
- historico recente
- alertas associados

### /alerts

Uso:

- central de alertas

Conteudo:

- alertas abertos
- alertas reconhecidos
- resolucoes recentes

### /sessions

Uso:

- governanca das sessoes humanas da propria conta

Conteudo:

- contadores de sessoes totais, ativas e revogadas
- lista de sessoes com `current`, `ativa`, `revogada` ou `expirada`
- `ip_address`, `user_agent`, criacao, ultima atividade e expiracao
- acao de `revogar sessao` para sessoes que nao sao a atual

### /audit

Uso:

- trilha administrativa e operacional do controlador

Conteudo:

- eventos recentes de `auth`, `admin`, `alerts` e fluxos sensiveis
- filtros por prefixo de `action` e `target_type`
- actor humano, alvo, IP, horario e `metadata_json`

### /clients e /sites

Uso:

- inventario administrativo

Conteudo minimo esperado:

- total de firewalls por cliente
- status agregado por cliente
- versoes do pfSense em uso naquele cliente
- destaque para clientes com nodes fora da versao homologada

### /settings/tokens

Uso:

- emissao, rotacao e revogacao de tokens

### /settings/audit

Uso:

- trilha de auditoria

## Regras de UX

- a tela principal deve ser entendida em menos de 10 segundos
- status devem ser visuais e consistentes
- filtros devem ficar sempre visiveis
- detalhes tecnicos so aparecem onde agregam valor

## Semaforo de status

- verde: `online`
- amarelo: `degraded`
- vermelho: `offline`
- azul ou cinza: `maintenance`

## Informacoes minimas por firewall na lista

- cliente
- site
- hostname
- management IP
- WAN IP
- versao do pfSense
- ultimo heartbeat
- status geral
- total de alertas abertos

## Regra explicita de visibilidade de versao

A versao do pfSense e informacao obrigatoria nas visoes operacionais do produto.

Ela deve aparecer no minimo em:

- dashboard, como resumo por versao e alerta de versao fora da matriz homologada
- lista de firewalls
- detalhe do firewall
- visao por cliente e por site

## Informacoes minimas no detalhe do firewall

- identidade do no
- versao do pfSense
- hash parcial do token ou referencia da credencial
- intervalo de heartbeat
- uptime
- CPU, memoria e disco
- gateways
- servicos
- alertas ativos
- ultimos erros do agente

## Atualizacao em tempo real

No MVP:

- dashboard, lista de nodes e detalhe do node recebem eventos por `SSE`

Comportamentos esperados:

- refresh server-side disparado por evento
- badge de reconexao se o stream cair
- consumo do stream pelo mesmo dominio do painel via proxy interno do `Next.js`

## Requisitos de responsividade

- desktop como experiencia principal
- tablet com leitura completa
- mobile com foco em consulta rapida

## Telas futuras

- manutencao programada
- historico e tendencias
- relatorios por cliente
- tela de integracoes

## Painel local do pfSense

Embora este documento seja sobre o painel central, o pacote no pfSense deve ter no minimo:

- `Services > SystemUp Monitor`: tela de configuracao
- `Status > SystemUp Monitor`: tela de status local e diagnostico
- tela de logs locais

Decisao desta fase:

- o widget de saude do dashboard do pfSense e desejado
- o widget fica para depois da GUI e do heartbeat estarem estaveis

## Campos previstos da tela de configuracao no pfSense

- habilitar integracao
- URL do servidor: `https://pfs-monitor.systemup.inf.br`
- token
- nome do cliente
- site ou unidade
- intervalo de heartbeat: `30s`
- timeout
- validar certificado TLS
- servicos monitorados
- botao `Testar conexao`
- botao `Enviar heartbeat agora`

## Conteudo previsto da tela de status local no pfSense

- conectado ou desconectado
- ultima sincronizacao
- latencia ate o controlador
- versao do agente
- ultimo erro de envio
- resultado do ultimo heartbeat
