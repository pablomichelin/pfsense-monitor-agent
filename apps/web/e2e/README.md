# Testes visuais E2E — Monitor-Pfsense

Pipeline básico de screenshots para regressão visual pós-auditoria 108.

## Pré-requisitos

- Stack local ou HTTPS externo acessível
- `playwright` instalado no ambiente (scripts em `/Dados/Monitor-Pfsense/scripts/` já usam)
- Credenciais em `.env.api` na raiz do projeto (`AUTH_BOOTSTRAP_EMAIL`, `AUTH_BOOTSTRAP_PASSWORD`)

## Execução smoke

```bash
cd /Dados/Monitor-Pfsense
BASE_URL=https://pfs-monitor.systemup.inf.br node apps/web/e2e/visual-smoke.spec.mjs
```

Variáveis:

| Variável | Default | Descrição |
|----------|---------|-----------|
| `BASE_URL` | `http://127.0.0.1:8088` | URL do painel |
| `OUTPUT_DIR` | `docs/evidencias-e2e` | Pasta de screenshots |

## Rotas cobertas

Ver `routes.ts` — 13 rotas (+ detalhe de nó dinâmico pendente de fixture).

## CI (backlog)

Integrar em pipeline com artefatos de screenshot e diff opcional (Playwright `--update-snapshots`).
