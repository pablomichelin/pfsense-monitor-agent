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

## Testes e limpeza — orientação do usuário (31/10/2026)

- Concluir o desenvolvimento por blocos antes de testar; executar cada grupo de validação uma vez.
- Não repetir cumulativamente suítes aprovadas a cada alteração independente. Reexecutar somente o grupo afetado por falha, mudança ou evidência nova, registrando o motivo.
- Aproveitar as evidências válidas dos agentes; build final de publicação e verificação de saúde não exigem repetir toda a suíte.
- Ao entregar, remover cópias de trabalho, contêineres/redes de teste e arquivos temporários criados na sessão. Manter apenas código final, documentação útil, artefatos necessários e backups operacionais; evitar versões intermediárias supérfluas.

## Fluxo de encerramento de mudança

Ao final de cada iteração relevante (regra já definida em `CORTEX.md`):

1. Atualizar `LEITURA-INICIAL.md` (versões, última entrega, próximo passo).
2. Ajustar `12-roadmap-de-fases.md` se a fase mudou.
3. Se o package/agente mudou e precisa chegar nos firewalls: **bumpar versão** (não reusar a que a frota já tem), gerar artefato e **enfileirar upgrade remoto**. Sem versão nova o box não reinstala.
4. Commit e push para `origin main` — este host é o servidor do projeto, o GitHub deve ficar sempre atualizado.
5. Após o push, executar `git pull origin main` neste host (não delegar ao usuário).

<!-- systemup-rtk:start -->
## RTK OSS: uso controlado

RTK pode compactar a saída de comandos de desenvolvimento. Use somente
quando o comando original já estiver autorizado pelas regras deste projeto
e o comando com RTK também estiver coberto pelas aprovações do agente.
Exemplo opcional: `rtk git status`. Caso o RTK esteja ausente, utilize o
comando original. Não altere sandbox, permissões ou regras de aprovação.

Não prefixe comandos automaticamente; não habilite `rtk init`, hooks,
proxy, aliases globais ou reescrita automática. Não envolva comandos
de escrita Git, migrations, deploy, operações financeiras ou alterações
de infraestrutura. Testes e builds podem ter efeitos mesmo com RTK.

Preserve a saída original integral para segurança, auditoria, dados
financeiros, revisão exaustiva, JSON, CSV, patches e processamento por
scripts. Não repita comandos com efeitos para recuperar a saída omitida.
Uma falha não autoriza executar novamente sem RTK. Preserve exit codes
e evidências necessárias. As regras canônicas deste projeto prevalecem.
<!-- systemup-rtk:end -->
