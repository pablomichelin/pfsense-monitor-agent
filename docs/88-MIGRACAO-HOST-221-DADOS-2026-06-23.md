# Migracao do Monitor-Pfsense para `/Dados` (2026-06-23)

## Contexto

O controlador do Monitor pfSense (`pfs-monitor`) operava historicamente no host `192.168.100.244` em `/opt/Monitor-Pfsense`. A stack passou a rodar neste servidor (`192.168.100.221`) e foi consolidada no ecossistema `/Dados`.

## Acesso interno vs externo

| Contexto | Endereco | Uso |
|----------|----------|-----|
| **Externo** | `https://pfs-monitor.systemup.inf.br` | Site publico, agentes pfSense, integracoes |
| **Interno (LAN)** | `http://192.168.100.221:3031` | Rede interna, upstream do nginx externo |
| **Interno (host)** | `http://127.0.0.1:8088` | Testes locais no servidor |

Detalhes: `docs/89-ACESSO-INTERNO-E-EXTERNO.md`.

## Estado apos migracao

| Item | Valor |
|------|-------|
| Diretorio canonico | `/Dados/Monitor-Pfsense` |
| Symlink legado | `/opt/Monitor-Pfsense` → `/Dados/Monitor-Pfsense` |
| Host | `192.168.100.221` |
| Portas locais | `8088` (nginx), `192.168.100.221:3031` (bind interno) |
| Dominio publico | `https://pfs-monitor.systemup.inf.br` (proxy externo em outro host) |
| Stack | `docker compose` — nginx, api, web, db (PostgreSQL 17) |

## Procedimento executado

1. `docker compose down` em `/opt/Monitor-Pfsense`
2. `mv /opt/Monitor-Pfsense /Dados/Monitor-Pfsense`
3. Symlink `/opt/Monitor-Pfsense` → `/Dados/Monitor-Pfsense`
4. `docker compose up -d` em `/Dados/Monitor-Pfsense`
5. Validacao: `/login` e `/healthz` em `8088` e `3031` retornando `200`

## Operacao diaria

```bash
cd /Dados/Monitor-Pfsense
docker compose ps
docker compose up -d
docker compose logs -f api
```

## Documentacao atualizada

- `CORTEX.md`, `docs/00-INDICE-OPERACIONAL.md`
- `/Dados/inventario-tecnico-servidor-2026-06-18.md`
- `/Dados/AGENTS.md`, `/Dados/docker/MEMORY-TUNING.md`
- Integracao Theo/WhatsApp (`Projeto-Theo-Portal-WhatsApp/`, `docker/agente-ia/`)

## Nota sobre IPs historicos

Referencias a `192.168.100.244` em documentos antigos do Monitor-Pfsense descrevem o host anterior. O host operacional atual e `192.168.100.221`. Referencias a `192.168.100.244` em outros projetos (ex.: Zabbix no painel-financeiro) podem continuar validas para aquele servico.
