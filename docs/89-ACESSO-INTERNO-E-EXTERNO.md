# Acesso interno e externo — Monitor pfSense

**Data:** 2026-06-23  
**Regra:** uso interno na LAN = IP; uso externo (internet, pfSense, clientes) = domínio HTTPS.

## Resumo

| Contexto | URL / endereço | Uso |
|----------|----------------|-----|
| **Externo (público)** | `https://pfs-monitor.systemup.inf.br` | Painel, agentes pfSense, integrações, testes de produção |
| **Interno (LAN/host)** | `http://192.168.100.221:3031` | Acesso na rede interna, proxy reverso upstream, debug operacional |
| **Interno (localhost)** | `http://127.0.0.1:8088` | Testes no próprio host `192.168.100.221` |

## Fluxo externo

```text
Internet
  -> Cloudflare / DNS
  -> nginx (servidor externo, ex.: ISPConfig em 192.168.100.253)
  -> http://192.168.100.221:3031  (bind interno deste host)
  -> nginx do compose (:8088)
  -> api (:8088) + web (:3000)
```

O TLS termina **antes** do host `192.168.100.221`. Internamente a stack escuta HTTP em `3031` / `8088`.

## Quando usar cada um

### Externo — `https://pfs-monitor.systemup.inf.br`

- Navegador de operadores fora da LAN ou via DNS público
- Configuração de pacote/agente pfSense (`--controller-url`)
- Heartbeat e test-connection em produção
- Validação pós-deploy: `/healthz`, `/login`

Exemplo:

```bash
curl -sS https://pfs-monitor.systemup.inf.br/healthz
```

### Interno — `http://192.168.100.221:3031`

- Testes na rede interna sem passar pelo proxy externo
- Configuração do nginx upstream no servidor que termina TLS
- Troubleshooting quando o domínio público falha mas a stack local está saudável

Exemplo:

```bash
curl -sS http://192.168.100.221:3031/healthz
```

### Localhost — `http://127.0.0.1:8088`

- Verificação direta no host onde roda o `docker compose`
- Healthcheck local pós-`docker compose up`

Exemplo:

```bash
curl -sS http://127.0.0.1:8088/healthz
```

## Referências no repositório

- Bind interno LAN: `compose.override.yaml` → `192.168.100.221:3031:8088`
- Porta local nginx: `compose.yaml` → `8088:8088`
- Proxy upstream (ISPConfig): `infra/ispconfig/nginx.monitor-pfsense.conf`
- Decisões permanentes: `CORTEX.md`

## Erro comum

Não tratar `192.168.100.221:3031` como URL pública para pfSense ou clientes externos — usar sempre `https://pfs-monitor.systemup.inf.br` nesses casos.
