# PROJECT STATUS — Monitor pfSense (pfs-monitor)

Ultima atualizacao: **2026-08-01**

> **Fonte de verdade das versões e entregas:** `LEITURA-INICIAL.md`. Este arquivo é só um snapshot rápido — não duplicar changelog aqui, atualizar lá.

## Snapshot

| Campo | Valor |
|---|---|
| API | `0.10.1` (`apps/api/package.json`) |
| Painel web | `1.10.5` (`apps/web/package.json`) |
| Package pfSense | `0.5.5` (release publicada em `config/package-release.env`) |
| Branch | `main` |
| Containers | `monitor-pfsense-web-1`, `monitor-pfsense-api-1`, `monitor-pfsense-nginx-1`, `monitor-pfsense-db-1` (Postgres 17) |
| Última entrega | 2026-08-01 — package **0.5.5** técnicos on por padrão (`docs/157-...`) |
| Próximo passo operacional | Upgrade package **0.5.5** no voner (e frota) e retestar provisionar técnico |

## Débitos conhecidos

Ver `CORTEX.md` → "Riscos conhecidos".

## Verificação rápida

```bash
cd /Dados/Monitor-Pfsense
docker compose -f compose.yaml -f compose.override.yaml ps
curl -s -o /dev/null -w "%{http_code}\n" http://192.168.100.221:3031/
```
