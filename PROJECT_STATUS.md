# PROJECT STATUS — Monitor pfSense (pfs-monitor)

Ultima atualizacao: **2026-07-31** (MVP revogação técnicos plano 144; conteúdo de versão puxado de `LEITURA-INICIAL.md`)

> **Fonte de verdade das versões e entregas:** `LEITURA-INICIAL.md`. Este arquivo é só um snapshot rápido — não duplicar changelog aqui, atualizar lá.

## Snapshot

| Campo | Valor |
|---|---|
| API | `0.8.0` (`apps/api/package.json`) |
| Painel web | `1.6.0` (`apps/web/package.json`) |
| Package pfSense | `0.5.0` (release publicada em `config/package-release.env`) |
| Branch | `main` |
| HEAD | (working tree com MVP plano 144 Fases 1–2 — commit pendente) |
| Containers | `monitor-pfsense-web-1`, `monitor-pfsense-api-1`, `monitor-pfsense-nginx-1`, `monitor-pfsense-db-1` (Postgres 17) — healthy |
| Última entrega | 2026-07-31 — MVP revogação técnicos em lote (`docs/148-...`); flags **off** por default |
| Próximo passo operacional | Piloto lab 254: upgrade package 0.5.0 + habilitar flags; depois Fase 1b (provisionamento) e Fase 3 (`/admin/tecnicos`) |

## Débitos conhecidos

Ver `CORTEX.md` → "Riscos conhecidos" (compatibilidade entre versões pfSense, fragilidade de bootstrap pré-pacote final, health checks incompletos por serviço, HA/CARP não tratado).

## Verificação rápida

```bash
cd /Dados/Monitor-Pfsense
docker compose ps
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8088/
```

## Histórico de status

Atualizar este snapshot (versões/HEAD/containers) sempre que `LEITURA-INICIAL.md` receber uma nova entrega. Não repetir o changelog detalhado aqui.
