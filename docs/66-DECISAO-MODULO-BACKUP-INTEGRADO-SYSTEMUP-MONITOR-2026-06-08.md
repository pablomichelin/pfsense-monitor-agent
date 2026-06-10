# 66. Decisao: backup como modulo integrado do SystemUp Monitor

Data: `2026-06-08`
Status: **aceita**

## Decisao

O backup do `config.xml` sera modulo do Monitor-Pfsense existente, nao software separado.

```text
Monitor-Pfsense (apps/api, apps/web, packages/pfsense-package)
  pfSense: Services > SystemUp Monitor > Configuracao | Diagnostico | Backup
```

Repositorio unico: `pablomichelin/pfsense-monitor-agent`

## Por que integrar (resumo)

- reaproveita cadastro, `node_uid`, HMAC, heartbeat e package ja instalados
- evita segundo instalador, credencial e caminho no pfSense
- rollout mais seguro para clientes existentes

## O que foi descartado

- app de backup separado
- package pfSense separado
- repositorios temporarios de backup
- script `publish-pfsense-package-public-deploy.sh` (removido)
- pull remoto (SSH/VPN/porta aberta) para buscar `config.xml`

## Riscos aceitos e mitigacao

| Risco | Mitigacao |
|-------|-----------|
| payload sensivel no servidor | criptografia em repouso + download restrito |
| comando remoto | allowlist `config_backup_now` apenas |
| rollout em massa | `--config-backup-enabled no` por padrao; piloto primeiro |
| XML grande | limite por rota `5m`; medir em homolog |

## Referencias

- plano e fases: `docs/63-...md`
- contrato tecnico: `docs/64-...md`
- frontend e deploy: `docs/65-...md`
- checklist: `docs/67-...md`
