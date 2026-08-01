# CHAT INIT — Monitor pfSense (pfs-monitor)

Este projeto já tem seu próprio entrypoint consolidado — este arquivo existe só para seguir a convenção padrão do servidor (`AGENTS.md` → `CHAT_INIT.md` → `CORTEX.md` → `PROJECT_STATUS.md`) e não deixar o técnico procurando o ponto de entrada.

## Ordem real de leitura (definida em `CORTEX.md`, "Regra de continuidade entre chats")

1. `LEITURA-INICIAL.md` — retomada rápida: versões atuais, última entrega, próximo passo operacional
2. `CORTEX.md` — memória estratégica e técnica (regras permanentes, decisões, riscos)
3. `docs/00-INDICE-OPERACIONAL.md` — índice dos documentos operacionais
4. `AGENTS.md` (aqui) — guardrails para agentes de IA
5. `PROJECT_STATUS.md` (aqui) — snapshot rápido de versão/containers, com link para o detalhe completo em `LEITURA-INICIAL.md`

## Runtime canônico

- **Containers:** `monitor-pfsense-web-1`, `monitor-pfsense-api-1`, `monitor-pfsense-nginx-1`, `monitor-pfsense-db-1` (Postgres 17)
- **Compose:** `cd /Dados/Monitor-Pfsense && docker compose ...`
- **Acesso:** LAN `http://192.168.100.221:3031` / `http://127.0.0.1:8088` — externo `https://pfs-monitor.systemup.inf.br` (ISPConfig)
- **Fronteira obrigatória:** sistema distinto do Theo Portal WhatsApp (`:8791`) — não integrar, não misturar docs/backlog

## Contrato da sessão

Antes de implementar, confirmar em `CORTEX.md`:

1. A mudança respeita a prioridade operacional do Zabbix neste host?
2. Está dentro da "Ordem obrigatória de desenvolvimento" (doc → backend/banco → painel → agente → empacotamento → observabilidade → avançado)?
3. Envolve RBAC, backup de `config.xml` ou comando remoto no pfSense? Se sim, tratar como sensível (guardrails de `CORTEX.md`).

Ao finalizar entrega relevante, atualizar **obrigatoriamente** (regra de `CORTEX.md`):

1. `LEITURA-INICIAL.md`
2. `12-roadmap-de-fases.md` (se a fase mudou)
3. `PROJECT_STATUS.md` (aqui)
4. Commit + push para `origin main`, depois `git pull origin main` neste host

## Prompt pronto (colar em novo chat)

```
Leia nesta ordem:
1. /Dados/Monitor-Pfsense/CHAT_INIT.md
2. /Dados/Monitor-Pfsense/LEITURA-INICIAL.md
3. /Dados/Monitor-Pfsense/CORTEX.md
4. /Dados/Monitor-Pfsense/PROJECT_STATUS.md

Objetivo desta sessao: [descrever]
Regra: Zabbix tem prioridade absoluta no host; nao integrar com Theo Portal WhatsApp;
atualizar LEITURA-INICIAL.md + PROJECT_STATUS.md e dar push ao finalizar.
```
