# Deploy com Docker Compose

## Objetivo

Padronizar o deploy do controlador em um host unico no inicio do projeto.

## Regra de coexistencia com Zabbix

Este host ja executa Zabbix. Portanto, o Compose do projeto deve obedecer:

- nunca usar `network_mode: host`
- nunca publicar portas do ecossistema Zabbix
- nunca tentar substituir `apache2` ou `mysql`
- nunca assumir exclusividade do host

## Topologia inicial

Servicos previstos:

- `nginx`
- `api`
- `web`
- `db`

Opcional em fase posterior:

- `redis`
- `worker`

## Estrutura sugerida

```text
/opt/monitor-pfsense
  /.env.api
  /.env.web
  /.env.db
  /compose.yaml
  /infra/nginx
  /data/postgres
  /logs
  /backups
```

Arquivos de ambiente ja previstos no repositorio:

- `.env.api.example`
- `.env.web.example`
- `.env.db.example`

## Boas praticas

- imagens versionadas por tag imutavel
- volumes persistentes para banco
- rede interna para servicos internos
- healthcheck em todos os containers relevantes
- restart policy definida
- portas explicitamente mapeadas e revisadas contra o Zabbix

## Exemplo conceitual de compose

```yaml
services:
  nginx:
    image: nginx:stable
    depends_on:
      - api
      - web
    ports:
      - "8088:80"
      - "8448:443"
    volumes:
      - ./infra/nginx:/etc/nginx/conf.d:ro

  api:
    image: ghcr.io/systemup/monitor-api:${TAG}
    env_file:
      - .env.api
    depends_on:
      - db

  web:
    image: ghcr.io/systemup/monitor-web:${TAG}
    env_file:
      - .env.web
    depends_on:
      - api

  db:
    image: postgres:17
    env_file:
      - .env.db
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
```

## Processo de deploy

1. atualizar imagens
2. revisar arquivos `.env`
3. validar backup recente do banco
4. validar saude do Zabbix antes da mudanca
5. executar `docker compose pull`
6. executar `docker compose up -d`
7. validar healthchecks
8. validar logs e rotas HTTP
9. validar saude do Zabbix apos a mudanca

## Comandos operacionais basicos

```bash
docker compose pull
docker compose up -d
docker compose ps
docker compose logs -f api
docker compose logs -f web
docker compose down
```

## Validacao especifica do SSE

Antes de homologar externamente, validar:

1. o endpoint interno `GET /api/v1/dashboard/events` responde com `content-type: text/event-stream`
2. o proxy do `Next.js` responde em `GET /api/realtime/dashboard`
3. o proxy reverso do `ISPConfig` nao faz buffering do stream
4. a conexao permanece aberta por mais de `30s`
5. um novo heartbeat gera refresh visivel no dashboard ou no inventario
6. no dominio publico, a sessao autenticada recebe `connected` e `keepalive`

Comandos uteis na origem:

```bash
curl -iN http://127.0.0.1:8088/api/v1/dashboard/events
curl -iN http://127.0.0.1:3001/api/realtime/dashboard
docker compose logs -f web
docker compose logs -f api
```

Comando util no dominio publico:

```bash
BASE_URL="https://pfs-monitor.systemup.inf.br"
curl -skS -c /tmp/monitor-cookies.txt \
  -H 'content-type: application/json' \
  -X POST "$BASE_URL/api/v1/auth/login" \
  --data '{"email":"admin@systemup.inf.br","password":"********"}'

timeout 36s curl -skN -b /tmp/monitor-cookies.txt \
  "$BASE_URL/api/realtime/dashboard"
```

Script versionado equivalente:

```bash
BASE_URL="https://pfs-monitor.systemup.inf.br" \
  ./scripts/verify-origin-contract.sh
```

Script focado apenas no stream `SSE`:

```bash
BASE_URL="https://pfs-monitor.systemup.inf.br" \
  ./scripts/verify-sse-stream.sh
```

Script util para validar autenticacao do agente sem gravar heartbeat:

```bash
BASE_URL="https://pfs-monitor.systemup.inf.br" \
  ./scripts/test-agent-connection.sh node_uid node_secret
```

Script util para validar localmente o release versionado do agente antes da homologacao no pfSense:

```bash
./scripts/smoke-agent-release.sh
```

Roteiro operacional da proxima rodada manual em firewall real:

- `17-checklist-homologacao-bootstrap-pfsense-real.md`
- alvo inicial homologado: `pfSense CE 2.8.1`

Verificador operacional para checar o node, o comando gerado e os artefatos publicados antes de ir ao pfSense:

```bash
BASE_URL="https://pfs-monitor.systemup.inf.br" \
  ./scripts/verify-bootstrap-release.sh <node_id>
```

Atalho para rodar o preflight completo da rodada manual:

```bash
BASE_URL="https://pfs-monitor.systemup.inf.br" \
  ./scripts/run-bootstrap-preflight.sh <node_id>
```

Verificador operacional do contrato HTTP externo apos ajustar o proxy:

```bash
BASE_URL="https://pfs-monitor.systemup.inf.br" \
  ./scripts/verify-origin-contract.sh
```

Sinais esperados:

- cabecalho `Cache-Control: no-cache, no-transform`
- cabecalho `X-Accel-Buffering: no`
- evento inicial `connected`
- eventos `keepalive` periodicos
- evento `dashboard.refresh` ao entrar heartbeat ou reconciliacao relevante
- no teste externo, conexao autenticada aberta por pelo menos `36s`

## Regras de proxy reverso para SSE

No `ISPConfig`, o caminho do stream precisa respeitar:

- sem buffering de resposta
- timeout de leitura maior que a janela do stream
- preservacao de `Cookie`, `Host`, `X-Forwarded-For` e `CF-Connecting-IP`
- sem cache no caminho do stream

Referencia versionada no repositorio:

- `infra/ispconfig/nginx.monitor-pfsense.conf`
- `infra/ispconfig/README.md`

Contrato operacional atual da publicacao externa:

- dominio: `pfs-monitor.systemup.inf.br`
- proxy/TLS: `192.168.100.253`
- origem unica interna: `http://192.168.100.244:8088`
- o `ISPConfig` deve encaminhar tudo para `:8088`
- apenas `GET /api/realtime/dashboard` recebe tratamento especial de `SSE`

Se o proxy final for `nginx`, aplicar equivalente a:

```nginx
location /api/realtime/dashboard {
  proxy_pass http://192.168.100.244:8088;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
  proxy_buffering off;
  proxy_cache off;
  proxy_read_timeout 3600s;
}
```

Se o proxy final for `Apache`, aplicar equivalente a:

```apache
ProxyPass /api/realtime/dashboard http://192.168.100.244:3001/api/realtime/dashboard timeout=3600 keepalive=On flushpackets=on
ProxyPassReverse /api/realtime/dashboard http://192.168.100.244:3001/api/realtime/dashboard
RequestHeader set X-Forwarded-For expr=%{REMOTE_ADDR}
```

Os exemplos acima sao referencia operacional; o formato final deve seguir o motor HTTP efetivo do `ISPConfig`.

## Snippet versionado do ISPConfig

Para o caso atual com `nginx` como proxy final, o snippet versionado no repositorio e:

```nginx
server {
  listen 80;
  listen [::]:80;
  server_name pfs-monitor.systemup.inf.br;

  client_max_body_size 64k;
  proxy_http_version 1.1;

  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header X-Forwarded-Port 443;
  proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
  proxy_set_header CF-Ray $http_cf_ray;
  proxy_set_header Connection "";

  location = /healthz {
    proxy_pass http://192.168.100.244:8088;
    add_header Cache-Control "no-store" always;
  }

  location = /api/realtime/dashboard {
    proxy_pass http://192.168.100.244:8088;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    add_header Cache-Control "no-cache, no-transform" always;
    add_header X-Accel-Buffering "no" always;
  }

  location / {
    proxy_pass http://192.168.100.244:8088;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }
}
```

## Estrategia de release

Recomendada:

- tags semanticas
- imagem `api` e `web` publicadas pelo pipeline
- deploy manual controlado no inicio

## Rollback

Fluxo minimo:

1. manter tag anterior documentada
2. restaurar compose para a tag antiga
3. subir novamente `api` e `web`
4. restaurar banco se a release tiver migracao irreversivel
5. confirmar que `zabbix-server`, `zabbix-agent`, `apache2` e `mysql` permaneceram saudaveis

## Persistencia

Persistir obrigatoriamente:

- volume do PostgreSQL
- configuracoes do Nginx
- certificados e chaves

## Variaveis sensiveis

Nao expor em compose:

- segredos no proprio arquivo versionado
- tokens reais
- senhas de banco em texto aberto em commits

## Portas proibidas para publish neste host

Nao publicar no Compose deste projeto:

- `80`
- `443`
- `10050`
- `10051`
- `10052`
- `10053`
- `3306`

No host atual, preferir expor o projeto em portas altas dedicadas, por exemplo:

- `8088` para web HTTP interna de homologacao
- `8448` para HTTPS do projeto

Esses numeros sao referencia operacional, nao contrato final.

## Valido para o MVP

Sim. Um host unico com Compose atende bem a fase inicial e simplifica operacao.

## Topologia validada para dominio unico

Para manter painel, autenticacao humana e `SSE` no mesmo dominio externo, o Compose do projeto deve publicar apenas o gateway interno do projeto em `8088`.

Distribuicao recomendada:

- `nginx` do projeto publicado em `8088`
- `api` acessivel apenas na rede interna do Compose
- `web` acessivel apenas na rede interna do Compose

Roteamento no gateway interno:

- `/api/v1/*` e `/healthz` -> `api:8088`
- `/api/realtime/dashboard` -> `web:3000`
- painel e assets -> `web:3000`
