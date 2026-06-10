# Redução de espaço em disco (MySQL + Zabbix) sem quebrar o Zabbix

## Plano executável (ordem recomendada)

Executar **no servidor onde está o MySQL** (ex.: servidor do Zabbix). Pré-requisito: `mysql` acessível (ex.: `sudo mysql` ou usuário com permissão). Se precisar: `export MYSQL_CMD="sudo mysql"` antes de rodar o script.

| Passo | O quê | Comando / script |
|-------|--------|-------------------|
| 1 | Diagnóstico binlogs | `sudo ./scripts/reduce-mysql-space.sh` ou `sudo ./scripts/reduce-mysql-space.sh --check` |
| 2 | Definir retenção 3 dias (em memória) | `sudo ./scripts/reduce-mysql-space.sh --set-retention 3` |
| 3 | (Opcional) Deixar retenção permanente | Copiar `scripts/mysql-binlog-expire-snippet.cnf` para o `my.cnf` do MySQL e reiniciar: `sudo systemctl restart mysql` |
| 4 | Simular purgar binlogs | `sudo ./scripts/reduce-mysql-space.sh --purge 3 --dry-run` |
| 5 | Purgar binlogs antigos | `sudo ./scripts/reduce-mysql-space.sh --purge 3` |
| 6 | Rotacionar backups Zabbix (simular) | `sudo ./scripts/rotate-zabbix-backups.sh --keep-days 3 --dry-run` |
| 7 | Rotacionar backups Zabbix | `sudo ./scripts/rotate-zabbix-backups.sh --keep-days 3` |

Se os scripts estiverem no repositório do Monitor-Pfsense e você estiver em outro servidor, copie `scripts/reduce-mysql-space.sh`, `scripts/rotate-zabbix-backups.sh` e (se quiser) `scripts/mysql-binlog-expire-snippet.cnf` para o servidor e execute lá.

---

## Resumo

- **Binlogs do MySQL (~70 GB):** Zabbix **não** usa binlogs para funcionar. Servem para replicação e point-in-time recovery. Reduzir retenção e purgar antigos é **seguro** para o Zabbix.
- **Backups em /var/backups/zabbix (~18 GB):** São cópias de segurança. Apagar/rotacionar antigos **não** afeta o Zabbix em execução.
- **Banco `zabbix` (33 GB):** São dados ativos. Reduzir exige ajustar retenção no Zabbix (Housekeeper), não apagar arquivos no disco.

---

## 1. Binlogs do MySQL (maior ganho, ~70 GB)

### Por que é seguro para o Zabbix

- O Zabbix lê/escreve apenas nas tabelas do banco `zabbix`.
- Binlogs são usados para: replicação MySQL e restauração point-in-time.
- Se você **não** usa replicação nem PITR, pode encurtar a retenção e purgar sem impacto no Zabbix.

### Passos

**1.1 Ver retenção atual**

```bash
sudo mysql -e "SHOW VARIABLES LIKE 'expire_logs_days';"
sudo mysql -e "SHOW VARIABLES LIKE 'binlog_expire_logs_seconds';"
```

**1.2 Definir retenção (ex.: 3 dias)**

No MySQL 8+ usa-se `binlog_expire_logs_seconds`. 3 dias = 259200 segundos.

Temporário (até reiniciar o MySQL):

```bash
sudo mysql -e "SET GLOBAL binlog_expire_logs_seconds = 259200;"
```

Permanente: editar configuração do MySQL (ex.: `/etc/mysql/mysql.conf.d/mysqld.cnf` ou `my.cnf`) e adicionar/ajustar:

```ini
[mysqld]
binlog_expire_logs_seconds = 259200
```

Reiniciar o MySQL:

```bash
sudo systemctl restart mysql
```

**1.3 Purgar binlogs antigos (só depois de confirmar que não usa replicação/PITR)**

Conferir que não há réplicas:

```bash
sudo mysql -e "SHOW SLAVE STATUS\G"   # Se não for servidor réplica, não usa isso
```

Purgar logs com mais de 3 dias:

```bash
sudo mysql -e "PURGE BINARY LOGS BEFORE DATE(NOW() - INTERVAL 3 DAY);"
```

Ou purgar até um arquivo específico (liste antes):

```bash
sudo mysql -e "SHOW BINARY LOGS;"
# Depois, por exemplo:
# sudo mysql -e "PURGE BINARY LOGS TO 'mysql-bin.000123';"
```

Isso tende a liberar a maior parte dos ~70 GB.

---

## 2. Backups do Zabbix em /var/backups (~18 GB)

- São **dumps** (cópias). O Zabbix em execução não depende deles.
- Reduzir retenção (ex.: manter só 2–3 dias) ou mover para outro disco e apagar em `/var/backups/zabbix` **não quebra** o Zabbix.

Exemplo para manter só os 2 backups mais recentes:

```bash
cd /var/backups/zabbix
ls -lt   # conferir quais são os mais recentes
# Remover os mais antigos (ajuste o padrão conforme os nomes dos arquivos)
# Exemplo genérico: manter só os 2 mais novos
ls -t | tail -n +3 | xargs -r rm -f
```

Ou usar um cron que, por exemplo, apague arquivos com mais de 3 dias:

```bash
find /var/backups/zabbix -type f -mtime +3 -delete
```

Cada dia de backup removido libera ~4,5 GB.

---

## 3. Docker (~30 GB)

- Remover **imagens/containers não usados** não afeta o Monitor-Pfsense se os que estão em uso forem mantidos.

Diagnóstico:

```bash
docker system df
```

Limpeza (só não usados):

```bash
docker image prune -a    # imagens não usadas
# ou
docker system prune -a   # cuidado: remove tudo não usado (imagens, containers, redes)
```

---

## 4. Banco Zabbix (33 GB) – dado ativo

- **Não** apagar arquivos do disco do banco.
- Para reduzir tamanho no longo prazo: no front do Zabbix, ajustar retenção (Housekeeper) de histórico e tendências. Isso faz o próprio Zabbix limpar dados antigos com segurança.

---

## Checklist rápido

| Ação | Impacto | Quebra Zabbix? |
|------|---------|----------------|
| Reduzir retenção e purgar binlogs MySQL | ~70 GB | Não |
| Reduzir/rotacionar backups em /var/backups/zabbix | ~18 GB | Não |
| Docker prune (não usados) | Parte dos ~30 GB | Não |
| Ajustar Housekeeper no Zabbix (retenção) | Reduz crescimento do banco | Não (se bem configurado) |

**Em uma frase:** Sim, dá para diminuir o espaço usado pelo MySQL (e pelos backups) sem quebrar o Zabbix; o passo que mais libera espaço com segurança é reduzir e purgar os binary logs do MySQL.
