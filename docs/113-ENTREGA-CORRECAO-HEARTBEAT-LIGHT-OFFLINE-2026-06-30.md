# Entrega 113 — Correção heartbeat light + recovery offline (2026-06-30)

## Versões

| Componente | Versão |
|------------|--------|
| API NestJS | **0.6.3** |
| Package pfSense | **0.4.5** |
| Painel web | 1.4.3 (sem alteração) |

## Problema

1. **API:** quando o lifecycle marcava um node como `offline`/`degraded` e o agente voltava com heartbeat **light** (sem `services`/`gateways`), o ingest preservava o status anterior em vez de recalcular.
2. **Agente:** após update/reinstalação ou recovery de rede, firewalls em modo light podiam permanecer silenciosos ou sem recuperar status completo no controlador.

## Correções

### API (`apps/api/src/ingest/ingest.service.ts`)

- Removido early-return que devolvia `persistedStatus` em heartbeat light.
- Heartbeat light passa a recalcular status a partir dos serviços/gateways persistidos no banco (comunicação recente + último snapshot conhecido).

### Package pfSense 0.4.5

- **Agente:** após N heartbeats light bem-sucedidos (padrão 3) ou após recovery (backoff/401), força um heartbeat **normal** com checks completos.
- **401:** log explícito indicando necessidade de verificar `node_secret` ou solicitar rekey.
- **post-install:** `pkg-install.in` chama `systemup_monitor_sync_config()` para habilitar/reiniciar serviço quando config completa.
- **install.sh:** usa `restart` (fallback `start`) após upgrade com config completa.

## Artefato

```
/Dados/Monitor-Pfsense/dist/pfsense-package/monitor-pfsense-package-v0.4.5.tar.gz
SHA256: a052bd22a67f0e86cc377643ba48a0908dcfb8d9706365bf4c58bf9842eb5704
```

## Instalação nos pfSense

Ver seção de instalação em `LEITURA-INICIAL.md` (atualizado) ou `docs/COMANDO-ATUALIZAR-PACKAGE-PFSENSE.md`.

Resumo:

```sh
# Via GUI: Services → SystemUp Monitor → Diagnóstico → Atualizar package

# Ou tarball manual (copiar artefato para o firewall):
fetch -o /tmp/monitor-pkg.tgz https://SEU_HOST/api/v1/agent/package-artifact
# seguir install-from-release.sh conforme comando do painel
```

Após instalar, confirmar:

```sh
grep '^AGENT_VERSION=' /usr/local/etc/monitor-pfsense-agent.conf
/usr/sbin/service monitor_pfsense_agent onestatus
tail -f /var/log/monitor-pfsense-agent.log
```

## Deploy API

```sh
cd /Dados/Monitor-Pfsense
docker compose build api && docker compose up -d api
curl -s http://127.0.0.1:8088/healthz
# version deve reportar 0.6.3
```

## Validação

- `cd apps/api && npm run build` — OK
- `./scripts/release-pfsense-package.sh --no-push` — artefato 0.4.5 gerado
- `docker compose build api && docker compose up -d api` — container recriado
