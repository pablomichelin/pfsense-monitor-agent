# 97 — Spike: upgrade remoto pfSense CE 2.8.1

**Data:** 2026-06-23  
**Contexto:** Fase 2.2 do plano `docs/94-PLANO-MELHORIAS-PACKAGE-0.3.6.md`  
**Ambiente desta sessão:** sem VM pfSense CE acessível — conclusões parciais de código/docs + procedimentos reproduzíveis para lab

---

## Objetivo

Validar se o fluxo manual **System → Update → Confirm** pode ser automatizado com segurança em **pfSense CE 2.8.1**, alimentando `dispatch_pfsense_upgrade` e o wrapper `run_pfsense_upgrade.sh`.

**Fora de escopo:** pfSense Plus (matriz separada futura).

---

## Estado do código (0.3.8)

| Componente | Comportamento |
|------------|---------------|
| `check_pfsense_update_available.sh` | `pfSense-upgrade -d -c` com parser cache v4 — **implementado** |
| `dispatch_pfsense_upgrade` | Pré-checks HA, disco, `target_version`; ack `picked_up`/`running`; state `pfsense-upgrade-pending.json` |
| `run_pfsense_upgrade.sh` | Wrapper background; flag `MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED=0` (default) |
| Modo default (flag 0) | Prepara repositórios (`pfSense-upgrade -d`), state `prepared_manual_confirm`, **sem** `failed` imediato |
| Modo lab (flag 1) | Reservado — flags não assistidas **não confirmadas** neste spike |
| `finalize_pfsense_upgrade_if_pending` | Pós-reboot lê `/conf/upgrade_log.latest.txt` → `command-result succeeded` |

---

## Matriz de experimentos (lab CE 2.8.1)

Executar em VM snapshot antes de cada teste.

### 1. Detecção (`pfSense-upgrade -d -c`)

```bash
/usr/local/libexec/monitor-pfsense-agent/check_pfsense_update_available.sh force-check
cat /var/db/monitor-pfsense-agent/pfsense-update-check.json
```

**Critério:** `available` true/false/null coerente com GUI System → Update.

**Código:** parser em `check_pfsense_update_available.sh` (patterns CE 2.8.x documentados em `docs/91-PLANO-ENTREGA-PFSENSE-OS-UPGRADE.md`).

### 2. Download sem confirm (`pfSense-upgrade -d`)

```bash
pfSense-upgrade -d 2>&1 | tee /tmp/pfs-upgrade-d.log
```

**Objetivo:** confirmar que `-d` baixa/atualiza repositórios **sem** reboot (equivalente ao passo antes do Confirm na GUI).

**Uso no agente 0.3.8:** modo semi-manual executa este passo quando `MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED=0`.

### 3. Flags não assistidas (Confirm)

Testar **em ordem**, um por snapshot:

| Tentativa | Comando / env | Resultado esperado (documentar) |
|-----------|---------------|----------------------------------|
| A | `pfSense-upgrade -y` | ? |
| B | `PFCONFIRM=yes pfSense-upgrade` | ? |
| C | `echo y \| pfSense-upgrade` | ? |
| D | Consultar `man pfSense-upgrade` / `--help` CE 2.8.1 | listar flags reais |

**Status spike:** **não validado** — nenhum modo não assistido habilitado em produção até lab preencher esta tabela.

### 4. Janela de reboot

Após upgrade confirmado manualmente na GUI ou flag validada:

```bash
date -u +%Y-%m-%dT%H:%M:%SZ   # antes
# Confirm upgrade
# após reboot:
date -u +%Y-%m-%dT%H:%M:%SZ
cat /conf/upgrade_log.latest.txt | tail -20
```

**Ajuste API:** `expires_at` do comando `pfsense_upgrade` deve cobrir reboot + margem (sugestão lab: mediana + 50%).

### 5. Package SystemUp Monitor pós-upgrade

```bash
service monitor_pfsense_agent onestatus
cat /usr/local/etc/monitor-pfsense-agent.conf | grep AGENT_VERSION
ls -la /var/db/monitor-pfsense-agent/node_secret
```

**Critério:** serviço rc.d sobe; secret file preservado; heartbeat retoma.

### 6. HA / CARP

Firewall com `<carp><enable>yes</enable>` ou sync XML ativo:

```bash
grep -A5 carp /conf/config.xml
/usr/local/libexec/monitor-pfsense-agent/check_pfsense_update_available.sh force-check
# ha_detected deve ser true
```

**Comportamento agente:** `dispatch_pfsense_upgrade` recusa com mensagem explícita.

### 7. CE vs Plus

| Aspecto | CE 2.8.1 | Plus |
|---------|----------|------|
| Comando base | `pfSense-upgrade` | diverge (subscription) |
| Escopo remoto | **suportado** (após lab) | **fora de escopo** |
| Parser `-d -c` | validado em código | não testado |

---

## Decisões provisórias (sem lab)

1. **Default seguro:** `MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED=0` até experimento #3 confirmar flag estável.
2. **Fluxo honesto:** comando remoto prepara (`-d`), permanece `running`, operador confirma na GUI pfSense; pós-reboot `finalize_*` fecha com sucesso se log existir.
3. **Não retornar `failed` genérico** quando spawn do wrapper OK — evita falso negativo no painel.
4. **Major bump:** continua bloqueado no backend (`PFSENSE_UPGRADE_*`).

---

## Procedimento piloto (checklist operador)

1. Snapshot VM CE 2.8.1+ com package **0.3.8** e update disponível.
2. Backup config.xml nativo pfSense + backup Monitor-Pfsense recente (gate API).
3. Painel: solicitar upgrade com `PFSENSE_UPGRADE_ENABLED=true`.
4. Verificar ack `running` e state `/var/db/monitor-pfsense-agent/pfsense-upgrade-pending.json`.
5. Se flag exec=0: abrir GUI pfSense → System → Update → **Confirm**.
6. Aguardar reboot; confirmar node online e versão nova.
7. Validar `command-result succeeded` e ausência de alerta offline prolongado.

---

## Referências

- Plano entrega: `docs/91-PLANO-ENTREGA-PFSENSE-OS-UPGRADE.md`
- Plano melhorias: `docs/94-PLANO-MELHORIAS-PACKAGE-0.3.6.md` Fase 2.2
- Entrega código: `docs/98-ENTREGA-PACKAGE-0.3.8.md`
- Smoke API: `scripts/smoke-pfsense-upgrade-command.sh`
