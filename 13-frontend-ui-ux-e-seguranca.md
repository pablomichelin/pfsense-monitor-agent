# Frontend, UI, UX e Seguranca

## Objetivo

Este documento congela a direcao do frontend do Monitor-Pfsense para evitar retrabalho, escolhas contraditorias e implementacoes improvisadas.

Ele define:

- stack de frontend
- direcao visual
- menus e telas
- regras de UX
- modelo de autenticacao e sessao
- endurecimento do frontend
- escopo de MVP

## Resumo executivo

A proposta enviada se encaixa muito bem no projeto.

Decisao principal:

- aceitar a base `Next.js + TypeScript + Tailwind + shadcn/ui`
- manter `dark-first` como direcao visual padrao
- usar `SSE` no MVP e deixar `WebSocket` para fase posterior
- usar sessao server-side com cookie seguro
- centralizar a autenticacao humana do MVP no `NestJS`

## Validacao da stack proposta

### Framework

Escolha aprovada:

- `Next.js` com `App Router`

Justificativa:

- o `App Router` e o caminho principal do framework e suporta recursos modernos do React, incluindo renderizacao no servidor e composicao entre Server e Client Components

### Linguagem

Escolha aprovada:

- `TypeScript` em modo `strict`

Justificativa:

- reduz ambiguidade no frontend administrativo
- melhora contratos de tela, formulario e API

### UI

Escolhas aprovadas:

- `Tailwind CSS`
- `shadcn/ui`
- `lucide-react`

Justificativa:

- `Tailwind` acelera iteracao e consistencia
- `shadcn/ui` e adequado porque entrega componentes acessiveis e `open code`
- `lucide-react` encaixa bem no perfil tecnico e limpo do sistema

### Formularios

Escolhas aprovadas:

- `React Hook Form`
- `Zod`

Justificativa:

- baixo atrito para formularios administrativos
- validacao tipada e consistente entre UI e contrato de dados

### Dados tabulares

Escolha aprovada:

- `TanStack Table`

Justificativa:

- listas de firewalls, alertas, eventos e usuarios exigem filtros, ordenacao, colunas e paginacao

### Graficos

Escolha aprovada:

- `Recharts`

Justificativa:

- suficiente para dashboards operacionais e historicos basicos sem elevar demais a complexidade

### Estado

Decisao ajustada:

- priorizar `URL state`, estado local e contexto simples
- usar `Zustand` apenas quando surgir necessidade real de estado cliente compartilhado

Justificativa:

- no `App Router`, muita coisa pode e deve ser resolvida com fetch server-side, search params e componentes cliente pontuais
- colocar `Zustand` como obrigatorio desde o inicio tende a aumentar complexidade sem necessidade

### Tempo real

Decisao aprovada com ajuste:

- `SSE` no MVP
- `WebSocket` somente se a fase posterior realmente exigir bidirecionalidade

Justificativa:

- o painel precisa receber mudancas de status e eventos, nao necessariamente uma conexao interativa permanente logo de inicio

## Stack frontend decidida

- framework: `Next.js`
- router: `App Router`
- linguagem: `TypeScript strict`
- estilos: `Tailwind CSS`
- componentes base: `shadcn/ui`
- icones: `lucide-react`
- formularios: `React Hook Form + Zod`
- tabelas: `TanStack Table`
- graficos: `Recharts`
- tempo real: `SSE`
- estado: `URL state + local state + contexto`, com `Zustand` opcional

## Direcao visual

## Conceito

O sistema deve parecer uma central de operacao tecnica, nao um painel generico de SaaS.

Direcao decidida:

- `dark-first`
- leitura rapida
- contraste alto
- baixo ruido visual
- alto sinal operacional

## Paleta base

- fundo principal: grafite, slate, quase preto
- texto principal: branco suave
- texto secundario: cinza claro
- cor primaria: azul tecnico da marca SystemUp
- sucesso: verde
- atencao: ambar
- critico: vermelho
- informacao tecnica: ciano

## Regras visuais

- status nunca apenas por cor; sempre cor + texto + icone quando fizer sentido
- cards limpos, com bordas suaves e espacamento consistente
- evitar decoracao exagerada
- dados importantes devem saltar antes dos detalhes
- modo claro pode existir depois, mas dark e o padrao oficial
- branding discreto, mas sempre visivel no rodape

## Layout global

- sidebar fixa a esquerda
- topbar superior
- area central para cards, tabelas e graficos
- drawer lateral para detalhes rapidos quando fizer sentido
- paginas de detalhe com abas
- rodape persistente com versao e branding

## Modo wallboard

Recurso desejado:

- modo de exibicao para TV ou monitor operacional

Status:

- fora do MVP inicial

## Arquitetura de informacao e menus

## Menu principal decidido

- `Dashboard`
- `Firewalls`
- `Alertas`
- `Clientes`
- `Eventos`
- `Relatorios`
- `Usuarios e Acessos`
- `Integracoes`
- `Configuracoes`

## Papel de cada menu

### Dashboard

- visao geral do ambiente
- totais de nodes
- online e offline
- alertas criticos
- VPNs em falha
- gateways degradados
- servicos em erro
- ultimas sincronizacoes
- distribuicao de versoes do pfSense
- destaque para nodes fora da matriz homologada

### Firewalls

- lista principal de appliances
- busca, filtros, ordenacao e acoes rapidas

### Alertas

- tela operacional de incidentes
- criticos, avisos, reconhecidos e resolvidos

### Clientes

- visao por empresa, filial ou unidade
- agregacao por tenant
- visibilidade das versoes do pfSense em uso por cliente

### Eventos

- timeline tecnica do ambiente

### Relatorios

- disponibilidade
- incidentes
- uptime
- versao
- top falhas

### Usuarios e Acessos

- usuarios
- perfis
- sessoes
- MFA
- trilha de auditoria

### Integracoes

- webhook
- email
- Telegram
- WhatsApp
- integracoes futuras

### Configuracoes

- politicas globais
- branding
- limites
- retencao
- parametros de plataforma

## Telas obrigatorias

## Login

Deve conter:

- logo
- email
- senha
- MFA quando habilitado
- link de recuperacao
- mensagem discreta de status
- rodape com versao do sistema
- rodape com `Desenvolvido por Systemup`

Regras:

- sem cadastro publico
- visual curto e serio
- sem elementos desnecessarios

## Dashboard principal

Cards de topo:

- firewalls totais
- online
- offline
- alertas criticos
- VPNs em erro
- servicos com falha

Blocos abaixo:

- ultimos eventos
- clientes com mais incidentes
- disponibilidade `24h`, `7d` e `30d`
- firewalls com mais alertas

Recursos futuros:

- mapa ou visao geografica de sites

## Lista de firewalls

Deve conter:

- busca
- filtros persistentes
- paginacao
- ordenacao
- colunas configuraveis
- acoes rapidas

Colunas minimas:

- nome
- cliente
- site
- IP WAN
- IP de gestao
- versao do pfSense
- heartbeat
- saude geral
- ultimo contato
- total de alertas

Regra:

- a versao do pfSense deve ser visivel sem precisar abrir o detalhe do firewall

## Detalhe do firewall

Esta e a tela mais importante do produto.

Abas decididas:

- `Visao Geral`
- `Interfaces`
- `Gateways`
- `VPN`
- `Servicos`
- `Eventos`
- `Historico`
- `Configuracao do Agente`

### Conteudo da aba Visao Geral

- nome do cliente
- hostname
- `node_uid`
- versao do pfSense
- versao do agente
- uptime
- CPU, RAM e disco
- ultima sincronizacao
- IPs
- status geral

### Conteudo da aba VPN

- OpenVPN
- IPsec
- WireGuard
- peers
- ultimo estado
- falhas recentes

### Conteudo da aba Servicos

- unbound
- dhcpd
- ntpd
- openvpn
- strongswan ou ipsec
- wireguard
- dpinger ou gateway monitor

## Telas do MVP

Escopo inicial do frontend:

- `Login`
- `Dashboard`
- `Firewalls`
- `Detalhe do Firewall`
- `Alertas`
- `Usuarios e papeis`
- `Configuracoes basicas`

Fora do MVP inicial:

- relatorios avancados
- wallboard
- integracoes completas
- auditoria avancada
- tema por cliente
- mapa ou topologia

## UX operacional

## Regras gerais

- a tela principal deve ser entendida em segundos
- os filtros devem ser persistentes quando fizer sentido
- o operador precisa ver idade do dado recebido
- o sistema deve comunicar perda e retorno da conexao de tempo real

## Recursos recomendados

- busca global no topo
- filtros persistentes por cliente
- favoritos
- colunas personalizaveis
- indicador `ultima atualizacao ha X segundos`
- botao de refresh manual
- indicador de conexao `SSE`
- atalhos para copiar IP, hostname e identificadores
- timeline com icones de evento
- badges padronizados por severidade

## Regra obrigatoria de visibilidade de versao

A UX do sistema deve facilitar a leitura da versao do pfSense em nivel operacional.

No minimo:

- cada firewall deve exibir sua versao na listagem
- cada cliente deve permitir enxergar rapidamente quais versoes de pfSense possui
- o dashboard deve destacar versoes fora da matriz homologada

## Regra obrigatoria de versao do produto e branding

O frontend tambem deve exibir a versao do proprio sistema.

Obrigatorio no rodape:

- `Monitor-Pfsense vX.Y.Z`
- `Desenvolvido por Systemup`

O texto `Desenvolvido por Systemup` deve apontar para:

- `https://www.systemup.inf.br`

## Regras de desempenho percebido

- skeletons em listas e cards
- empty states claros
- erros de API com contexto operacional
- sem spinners infinitos silenciosos

## Modelo de autenticacao e sessao

## Decisao de seguranca

O frontend administrativo deve operar com:

- cookie seguro
- sessao server-side
- controle de acesso forte
- MFA
- trilha de auditoria

## Regras fechadas

- sem auto cadastro
- usuarios criados por convite ou por administracao interna
- login por email e senha
- MFA obrigatorio para administradores
- MFA opcional apenas como transicao para operadores
- nenhuma credencial sensivel em `localStorage`

## Sessao

Modelo decidido:

- sessao server-side persistida no banco
- cookie contendo apenas identificador de sessao

Cookies devem usar:

- `HttpOnly`
- `Secure`
- `SameSite=Lax` como padrao inicial

Regras adicionais:

- rotacao de sessao apos login
- rotacao apos elevacao de privilegio
- invalidez server-side em logout
- capacidade de revogar sessoes por usuario

## Timeouts recomendados

Diretriz inicial:

- idle timeout curto para painel administrativo
- absolute timeout para encerramento obrigatorio

Valores exatos:

- manter em aberto ate fase de implementacao da autenticacao

## Biblioteca de autenticacao

Decisao desta fase:

- autenticacao humana inicial centralizada no `NestJS`
- sessao server-side emitida e validada no backend
- o frontend nao sera a autoridade primaria de autenticacao

Observacao:

- `Auth.js` pode ser reavaliado no futuro apenas se entrar como adaptador coerente com a autoridade central do backend

## Senhas

Regras decididas:

- minimo de `12` caracteres
- bloquear senhas fracas, obvias e vazadas
- reset via link unico com expiracao curta
- hash com `Argon2id`

## Protecao contra ataque de login

Obrigatorio:

- rate limit por IP
- rate limit por conta
- atraso progressivo
- lock temporario controlado
- erro generico sem revelar existencia do usuario

CAPTCHA:

- apenas camada complementar
- nunca defesa principal

## MFA

Direcao decidida:

- administradores: obrigatorio
- operadores: recomendacao forte no MVP, obrigatorio em fase posterior

## CSRF

Como o modelo recomendado usa cookie, toda rota mutavel deve ter protecao contra CSRF.

Aplicar:

- protecao nativa do framework quando existir
- tokens CSRF para operacoes mutaveis
- validacao de origem quando aplicavel

## RBAC

## Perfis decididos

### Superadmin SystemUp

- ve todos os clientes
- ve todos os firewalls
- gerencia usuarios
- gerencia integracoes
- acessa auditoria
- altera configuracoes globais

### Admin interno

- opera quase tudo
- sem acesso automatico a mudancas super sensiveis

### Operador N1

Pode:

- ver status
- reconhecer alerta
- consultar eventos
- abrir detalhe tecnico

Nao pode:

- mexer em integracoes criticas
- alterar usuarios
- apagar historico

### Operador N2

Pode:

- tudo do N1
- alterar parametros operacionais permitidos
- forcar revalidacao do agente
- gerenciar alertas

### Cliente readonly

- ve apenas o proprio tenant
- consulta dashboards proprios
- consulta relatorios proprios

### Auditor

- leitura de sessoes
- leitura de trilha de auditoria
- leitura de configuracoes e operacao sem alteracao

## Regra obrigatoria de autorizacao

- o frontend pode esconder opcoes
- a autorizacao real deve existir no backend, endpoint por endpoint

## Endurecimento do frontend

## Headers obrigatorios

- `Strict-Transport-Security`
- `Content-Security-Policy`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `frame-ancestors` via `CSP`

Compatibilidade adicional:

- `X-Frame-Options` pode existir como camada secundaria

## Politica de conteudo

Diretriz:

- CSP restritiva por padrao
- evitar inline script
- evitar dependencia desnecessaria de dominios terceiros

## Outras regras

- HTTPS obrigatorio
- nao expor stack traces ao usuario
- sanitizar logs exibidos no cliente
- nao renderizar HTML arbitrario vindo da API

## Integracao com o backend

## Contrato geral

O frontend deve consumir:

- `fetch` server-side no `App Router` para dados principais
- componentes cliente apenas onde houver interacao ou tempo real
- `SSE` para atualizacao do dashboard, lista de nodes e alertas

## Regra de autoridade

- o backend e a fonte de verdade para status, permissoes e dados
- o frontend nao deve recalcular permissao por conta propria
- o frontend nao deve assumir autenticacao baseada em token armazenado no navegador

## Decisoes de implementacao para o Cursor

Quando a implementacao comecar, seguir:

1. criar layout global com sidebar, topbar e area de conteudo
2. implementar tema dark-first com tokens de design
3. implementar login com foco em seriedade e pouco ruido
4. construir `Dashboard`
5. construir `Firewalls`
6. construir `Detalhe do Firewall`
7. construir `Alertas`
8. adicionar RBAC visual
9. integrar stream de `SSE`

## O que nao fazer

- nao transformar o painel em landing page de marketing
- nao usar excesso de animacao
- nao depender de `localStorage` para sessao
- nao criar permissao apenas no frontend
- nao criar UI generica sem identidade operacional

## Referencias

- Next.js App Router:
  https://nextjs.org/docs/app
- Next.js docs:
  https://nextjs.org/docs
- shadcn/ui:
  https://ui.shadcn.com/docs
- OWASP Authentication Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP CSRF Prevention Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP Password Storage Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP HTTP Headers Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
