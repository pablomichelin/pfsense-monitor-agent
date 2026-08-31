# AGENTS.md

## Ordem de leitura obrigatória

1. `/Dados/AGENTS.md` (mapa do servidor, auto-lido pela regra *always applied*)
2. `LEITURA-INICIAL.md` — retomada rápida, versões atuais, próximo passo
3. `CORTEX.md` — memória estratégica e técnica, regras permanentes
4. `docs/00-INDICE-OPERACIONAL.md` — índice dos documentos operacionais
5. Se a tarefa envolver backup do pfSense: `docs/63-PLANO-MESTRE-ORGANIZACAO-QUALIDADE-BACKUP-PFSENSE-2026-06-08.md` e `docs/64-ESPECIFICACAO-MODULO-BACKUP-PFSENSE-2026-06-08.md`

## Contexto operacional

- Plataforma de monitoramento centralizado de pfSense CE: controlador (`NestJS` + `Next.js` + `PostgreSQL`, via Docker Compose) e agente leve (`PHP`, framework de package do pfSense).
- **Este host também é servidor Zabbix — o Zabbix tem prioridade operacional absoluta.** Nunca alterar `zabbix-server`, `zabbix-agent`, `apache2` ou `mysql` por conveniência deste projeto, nem publicar portas do ecossistema Zabbix para o Monitor-Pfsense.
- **Independente do Theo Portal WhatsApp** (`:8791`) — sem integração, sem webhook cruzado, sem backlog compartilhado.
- Diretório canônico: `/Dados/Monitor-Pfsense` (symlink legado em `/opt/Monitor-Pfsense`). Acesso interno `http://192.168.100.221:3031` (LAN) ou `http://127.0.0.1:8088`; acesso externo via `https://pfs-monitor.systemup.inf.br` (ISPConfig).

## Guardrails

Ver lista completa em `CORTEX.md` ("O que nunca deve ser feito sem decisão explícita"). Resumo:

- Não abrir acesso inbound do controlador para todos os pfSense como base do produto.
- Não executar comandos remotos arbitrários nos firewalls sem allowlist e sem RBAC/auditoria.
- Não usar token compartilhado entre múltiplos firewalls; segredo nunca em repositório.
- Não depender de HTTP sem TLS.
- Não salvar `config.xml` puro (sem criptografia) no PostgreSQL ou em disco persistente.

## Fluxo de encerramento de mudança

Ao final de cada iteração relevante (regra já definida em `CORTEX.md`):

1. Atualizar `LEITURA-INICIAL.md` (versões, última entrega, próximo passo).
2. Ajustar `12-roadmap-de-fases.md` se a fase mudou.
3. Se o package/agente mudou e precisa chegar nos firewalls: **bumpar versão** (não reusar a que a frota já tem), gerar artefato e **enfileirar upgrade remoto**. Sem versão nova o box não reinstala.
4. Commit e push para `origin main` — este host é o servidor do projeto, o GitHub deve ficar sempre atualizado.
5. Após o push, executar `git pull origin main` neste host (não delegar ao usuário).
