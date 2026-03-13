# Monitoramento, Backup e Operacao

## Objetivo

Garantir que o proprio controlador seja observavel e recuperavel.

## Regra operacional adicional

Como o host atual tambem e um servidor Zabbix, a operacao do Monitor-Pfsense deve incluir monitoramento de coexistencia:

- o Zabbix nao pode ser degradado por deploys deste projeto
- a saude do Zabbix deve ser verificada antes e depois de mudancas do projeto

## O que monitorar no controlador

### Infra do host

- CPU
- memoria
- disco
- uso de inode
- horario e sincronizacao NTP
- disponibilidade da rede

### Containers

- status dos containers
- reinicios inesperados
- uso de recursos
- healthchecks

### Aplicacao

- taxa de heartbeats por minuto
- erros `4xx` e `5xx`
- latencia da API
- tempo de resposta do painel
- conexao com banco

### Banco

- tamanho do banco
- crescimento diario
- tempo de query
- conexoes ativas
- idade do ultimo backup valido

## Alertas operacionais do controlador

Minimos:

- API fora do ar
- banco indisponivel
- volume de heartbeats zerado acima da janela esperada
- uso de disco acima de limiar
- falha em backup

## Backup

## Escopo do backup

- dump do PostgreSQL
- arquivos de configuracao do Nginx
- arquivos `.env`
- certificados e chaves
- eventuais artefatos de release local

## Politica inicial recomendada

- backup diario do banco
- retencao de 7 backups diarios
- retencao de 4 backups semanais
- copia externa ou storage separado do host principal

Scripts versionados atuais:

- `scripts/backup-postgres.sh`: gera dump custom do PostgreSQL via `docker compose`, grava checksum `.sha256` e aplica retencao local simples por quantidade
- `scripts/verify-backup-restore.sh`: sobe um `PostgreSQL 17` temporario em container, restaura o dump e valida a estrutura logica minima do banco sem tocar no ambiente principal

## Teste de restore

Obrigatorio:

- restaurar em ambiente de homologacao
- validar integridade logica da aplicacao apos restore

Frequencia sugerida:

- mensal no minimo

Comandos operacionais atuais:

```bash
./scripts/backup-postgres.sh
./scripts/verify-backup-restore.sh
```

## Operacao diaria

Checklist rapido:

- verificar dashboard de saude do controlador
- checar alertas abertos
- verificar firewalls offline
- revisar falhas recentes de autenticacao de agente

## Operacao semanal

- revisar capacidade de armazenamento
- revisar crescimento do banco
- validar backups
- revisar logs de erro repetitivos

## Operacao de mudanca

Antes de atualizar:

- confirmar backup recente
- registrar janela de manutencao
- validar release notes
- aplicar em staging quando possivel
- validar `systemctl is-active zabbix-server zabbix-agent apache2 mysql`
- validar ausencia de conflito de portas

Depois de atualizar:

- validar API
- validar painel
- validar recebimento de heartbeat
- validar a suite local com `scripts/run-smoke-suite.sh`
- validar governanca de sessoes humanas com `scripts/smoke-auth-sessions.sh`
  e confirmar a renderizacao autenticada de `/sessions`
- validar a trilha administrativa com `GET /api/v1/admin/audit` e a rota `/audit`
- validar com `scripts/smoke-rbac-roles.sh` que `operator` e `readonly` continuam bloqueados em rotas administrativas, incluindo `GET /api/v1/admin/audit`
- validar stream `SSE` autenticado e refresh com `scripts/smoke-realtime-refresh.sh`
- validar no dominio publico ao menos `connected` + `keepalive` por mais de `30s`
- validar cabecalhos e permanencia do stream com `scripts/verify-sse-stream.sh`
- validar o contrato HTTP do gateway com `scripts/verify-origin-contract.sh`
- antes da rodada em firewall real, validar o preflight do bootstrap com `scripts/run-bootstrap-preflight.sh <node_id>`
- gerar backup com `scripts/backup-postgres.sh`
- validar restore do backup mais recente com `scripts/verify-backup-restore.sh`
- validar healthchecks
- validar `zabbix-server`, `zabbix-agent`, `apache2` e `mysql`
- validar `80/TCP`, `10050/TCP`, `10051/TCP` e `3306/TCP` permanecem corretos

Validacao local mais recente:

- em `2026-03-12`, a suite `scripts/run-smoke-suite.sh` foi executada com sucesso no stack local em `14s`
- essa execucao cobriu `realtime`, `admin` e `RBAC`
- em `2026-03-12`, a suite foi reexecutada com sucesso em `16s` apos incluir `auth sessions`
- em `2026-03-12`, o smoke `scripts/smoke-rbac-roles.sh` foi reexecutado com sucesso para confirmar o bloqueio de `operator` e `readonly` no endpoint administrativo de auditoria
- em `2026-03-12`, `scripts/backup-postgres.sh` gerou dump versionado do banco local e `scripts/verify-backup-restore.sh` validou o restore em `PostgreSQL 17` temporario sem tocar no ambiente principal

## Observabilidade futura

Na fase seguinte, considerar:

- Prometheus
- Grafana
- Loki ou stack similar
- alertas integrados com Telegram, email ou webhook

## Documentacao operacional viva

Sempre atualizar:

- topologia atual
- procedimento de deploy
- procedimento de rollback
- inventario de secrets
- registro de coexistencia com o Zabbix do host
