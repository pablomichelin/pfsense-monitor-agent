# Seguranca e Endurecimento

## Objetivo

O projeto lida com firewalls de clientes. Por isso, seguranca nao e detalhe de implementacao; e requisito central.

## Principios

- trafego sempre por HTTPS
- menor privilegio em todas as camadas
- identidade unica por firewall
- segredo unico por firewall
- logs de auditoria para acoes sensiveis
- nenhuma execucao remota arbitraria no MVP
- preservar integralmente o Zabbix existente no host

## Modelo de ameaca inicial

Riscos principais:

- envio de heartbeat falsificado
- captura de token do agente
- abuso de endpoints publicos
- exposicao de painel administrativo
- persistencia insegura de segredos
- agente comprometido ou configurado incorretamente

## Controles obrigatorios no controlador

### Rede e borda

- expor apenas as portas publicas estritamente necessarias para o projeto
- limitar `22/TCP` por origem confiavel
- nao publicar banco nem portas internas
- usar `DOCKER-USER` chain para regras de Docker quando aplicavel

Excecao importante neste host:

- como `apache2` esta ativo em `80/TCP` e o ecossistema Zabbix reserva `443/TCP`, nao assumir `80/TCP` nem `443/TCP` sem validacao de impacto
- no host atual, preferir portas altas dedicadas para o projeto

### TLS

- certificados validos
- suites modernas
- redirecionamento de HTTP para HTTPS quando `80/TCP` existir
- renovacao automatizada e testada

### Autenticacao do agente

Modelo decidido para o MVP:

- `node_uid` estavel por firewall
- `node_secret` unico e rotacionavel por firewall
- `timestamp` no request
- assinatura `HMAC-SHA256` sobre `timestamp + "\\n" + raw_body`

Headers decididos:

- `X-Node-Uid`
- `X-Timestamp`
- `X-Signature`

Modelo recomendado para fase posterior:

- `mTLS` entre agente e controlador

### Autenticacao humana

MVP:

- contas locais com autenticacao centralizada no `NestJS`
- sessao server-side com cookie seguro
- MFA obrigatorio para perfis administrativos antes de producao
- MFA pode ficar desligado por `flag` apenas em ambiente de desenvolvimento

Fase posterior:

- `OIDC` ou outro SSO corporativo

### Autorizacao

Perfis minimos:

- `admin`
- `operator`
- `readonly`

## Segredos

- nao commitar `.env` real
- armazenar segredos fora do repositorio
- rotacionar `node_secret`
- permitir revogacao imediata por firewall
- nunca armazenar `node_secret` em texto puro no banco

## Hardening do Ubuntu 24

- instalacao minima
- login SSH apenas com chave
- desabilitar login root por senha
- aplicar atualizacoes de seguranca regularmente
- usar `ufw` ou firewall equivalente
- sincronizar horario corretamente
- remover servicos nao usados

Regra adicional deste ambiente:

- nao remover, parar, reiniciar, atualizar ou reconfigurar `zabbix-server`, `zabbix-agent`, `apache2` ou `mysql` por causa do projeto sem decisao explicita

## Hardening de containers

- rodar processos como usuario nao root quando possivel
- evitar `privileged`
- montar volumes necessarios e nada alem disso
- separar rede interna de servicos
- definir `healthcheck`

## Hardening do banco

- banco acessivel apenas na rede interna de containers
- credenciais exclusivas por ambiente
- backup criptografado
- testes de restore recorrentes

## Seguranca no pfSense

- o bootstrap inicial deve ser controlado e auditavel
- a pagina local do pacote deve exigir permissao administrativa adequada
- o agente nao deve abrir listeners locais desnecessarios
- o agente nao deve aceitar comandos remotos genericos

## Auditoria

Registrar no minimo:

- login no painel
- criacao e revogacao de tokens
- mudancas de configuracao no controlador
- acks e resolucoes de alertas
- operacoes administrativas futuras

## Politica de logs

- logs estruturados no controlador
- mascarar segredos e tokens
- manter trilha de erros de autenticacao
- reter logs conforme criticidade e custo

## Cloudflare e cadeia de proxies

Como o dominio publico do projeto fica atras da Cloudflare:

- usar `CF-Connecting-IP` como IP real do cliente no origin
- registrar `CF-Ray` para correlacao
- tratar `X-Forwarded-For` como dado auxiliar e nao como fonte primaria do IP real

No backend:

- restringir `trust proxy` ao proxy local ou rede de proxy conhecida
- nao usar `trust proxy = true` de forma aberta

Na Cloudflare:

- evitar `Pseudo IPv4` em `Overwrite Headers`
- preferir `Off` ou, no maximo, `Add Header`

## Itens proibidos no projeto

- tokens compartilhados entre firewalls
- endpoint sem autenticacao para heartbeat real
- segredos dentro de imagem Docker
- comandos shell montados a partir de input externo sem validacao
- dependencia em HTTP plano
- qualquer mudanca oportunista que possa indisponibilizar o Zabbix

## Checklist minimo antes de ir para producao

- TLS ativo e validado
- `node_secret` individual emitido por no
- backup do banco testado
- firewall local do host ativo
- politica de usuario e senha definida
- logs tecnicos e auditoria funcionando

## Referencias

- Cloudflare HTTP headers:
  https://developers.cloudflare.com/fundamentals/reference/http-headers/
- Cloudflare Pseudo IPv4:
  https://developers.cloudflare.com/network/pseudo-ipv4/
- Express behind proxies:
  https://expressjs.com/en/guide/behind-proxies.html
- OWASP Multifactor Authentication Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
