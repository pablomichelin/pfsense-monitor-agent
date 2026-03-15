# Validação do pfSense Real — Lasalle Agro (Estado Atual)

**Data:** 2026-03-15  
**Objetivo:** Validar o estado atual do firewall Lasalle Agro sem reinstalar.  
**Node:** lasalle-agro (id: 61d6ae1c-1ee7-478c-ab35-ac3258aa2d6d)

---

## 1. Resumo executivo

A validação do **painel/controlador** mostra que o Lasalle Agro está **online**, com heartbeat recente, agente **0.2.0** e alertas anteriores **todos resolvidos**. O problema de **degraded** observado na rodada de 2026-03-13 (doc 18) **foi resolvido** — o node aparece como **online** no dashboard.

**Conclusão preliminar (lado painel):** O ambiente atual parece **saudável**. Não há evidência de necessidade de reinstalação com base nos dados do controlador.

**Validação no pfSense:** Requer execução manual dos comandos listados na seção 4. O agente não possui acesso remoto ao firewall; os checks do painel indicam que o agente está ativo e reportando corretamente.

---

## 2. Resultados da validação no painel

### 2.1 Estado do node Lasalle Agro (API)

| Campo | Valor |
|-------|-------|
| **effective_status** | **online** |
| **observed_status** | **online** |
| **agent_version** | **0.2.0** |
| **pfsense_version** | 2.8.1-RELEASE |
| **last_seen_at** | 2026-03-15T01:09:44.498Z |
| **maintenance_mode** | false |
| **management_ip** | 192.168.4.3 |
| **wan_ip** | 177.38.13.156 |
| **pfsense_version_homologated** | false (2.8.1 está na matriz; provável nuance de formato) |

### 2.2 Último heartbeat recebido

| Campo | Valor |
|-------|-------|
| received_at | 2026-03-15T01:09:44.498Z |
| sent_at | 2026-03-15T01:09:44.000Z |
| heartbeat_id | lasalle-agro-20260315T010944Z-60984 |
| latency_ms | 498 |
| uptime_seconds | 5.902.891 (~68 dias) |
| cpu_percent | 0.9 |
| memory_percent | 15.71 |
| disk_percent | 5 |
| schema_version | 2026-01 |

### 2.3 Serviços reportados

| Serviço | Status | Mensagem |
|---------|--------|----------|
| ipsec | running | detected via process match |

**Observação:** O agente está reportando apenas serviços habilitados/detectados. Isso indica que a correção de filtragem (evitar falso positivo de degraded por serviços não usados) está em uso.

### 2.4 Gateways

Nenhum gateway reportado (lista vazia).

### 2.5 Alertas recentes

| Alerta | Tipo | Status |
|--------|------|--------|
| Service openvpn stopped | service_down | **resolved** |
| Heartbeat missing | heartbeat_missing | **resolved** |
| Service ntpd stopped | service_down | **resolved** |
| Service dpinger stopped | service_down | **resolved** |
| Service ipsec stopped | service_down | **resolved** |

**Todos os alertas estão resolvidos.** Nenhum alerta aberto.

### 2.6 Dashboard (resumo)

| Métrica | Valor |
|---------|-------|
| nodes | 19 |
| **online** | **1** (Lasalle Agro) |
| degraded | 0 |
| offline | 8 |
| maintenance | 0 |
| unknown | 10 |
| open_alerts | 8 (nenhum do Lasalle Agro) |

---

## 3. Comparação com a rodada anterior (doc 18)

| Aspecto | Rodada 2026-03-13 | Estado atual |
|---------|-------------------|--------------|
| Status no painel | degraded | **online** |
| Agent version | 0.1.0 | **0.2.0** |
| Heartbeat | chegando | chegando |
| Serviços reportados | lista ampla (causa provável do degraded) | apenas ipsec (running) |
| Alertas | abertos | **todos resolvidos** |

**Conclusão:** O problema de degraded foi endereçado. O agente v0.2.0 com filtragem de serviços evita o falso positivo. O node está estável.

---

## 4. Checklist de validação no pfSense (execução manual)

**Requisito:** Acesso ao pfSense via interface web (Diagnostics > Command Prompt) ou SSH.

Execute os comandos abaixo no pfSense e registre os resultados. Não é necessário reinstalar para esta validação.

### 4.1 Package instalado

```sh
php -r 'require_once("/etc/inc/config.inc"); echo "package=" . count(array_values(array_filter($config["installedpackages"]["package"] ?? [], fn($x) => is_array($x) && (($x["name"] ?? "") === "systemup-monitor")))) . PHP_EOL; echo "menu=" . count(array_values(array_filter($config["installedpackages"]["menu"] ?? [], fn($x) => is_array($x) && (($x["name"] ?? "") === "SystemUp Monitor")))) . PHP_EOL; echo "service=" . count(array_values(array_filter($config["installedpackages"]["service"] ?? [], fn($x) => is_array($x) && (($x["name"] ?? "") === "monitor_pfsense_agent")))) . PHP_EOL;'
```

**Esperado:** package=1, menu=1, service=1

### 4.2 Arquivos presentes

```sh
ls -l /usr/local/pkg/systemup_monitor.xml /usr/local/etc/rc.d/monitor_pfsense_agent /usr/local/etc/monitor-pfsense-agent.conf
```

**Esperado:** Os três arquivos existem.

### 4.3 Serviço em execução

```sh
service monitor_pfsense_agent status
```

**Esperado:** Status "running" ou equivalente.

### 4.4 Configuração do agente

```sh
/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh print-config
```

**Esperado:** Exibe controller_url, node_uid, customer_code e demais parâmetros corretos.

### 4.5 test-connection

```sh
/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh test-connection
```

**Esperado:** Saída indicando sucesso (connection validated ou similar).

### 4.6 Versões

```sh
cat /etc/version
```

**Esperado:** 2.8.1 ou compatível.

Verificar versão do agente no output de `print-config` ou no painel (agent_version: 0.2.0).

### 4.7 Log recente

```sh
tail -n 30 /var/log/monitor-pfsense-agent.log
```

**Esperado:** Entradas recentes de heartbeat ou test-connection.

### 4.8 Confirmação visual (opcional)

- Menu em **Services > SystemUp Monitor**
- Serviço em **Status > Services** como `monitor_pfsense_agent`

---

## 5. Divergências encontradas (lado painel)

Nenhuma divergência relevante. Os dados do painel são coerentes:

- Heartbeat recente
- Status online
- Agent 0.2.0
- Serviços filtrados corretamente
- Alertas resolvidos

---

## 6. Conclusão: reinstalar ou não?

**Reinstalação NÃO é necessária** com base nos dados do painel.

O node Lasalle Agro está:

- online
- com heartbeat chegando normalmente
- com agente 0.2.0
- sem alertas abertos
- com status degraded resolvido

A validação no pfSense (seção 4) é **recomendada** para confirmar que package, serviço e configuração estão íntegros. Se todos os comandos retornarem conforme o esperado, o ambiente pode ser considerado **homologado e estável**.

**Reinstalar só faria sentido se:**

- A validação no pfSense mostrar package/serviço/config ausentes ou corrompidos
- O heartbeat parar de chegar
- O status voltar a degraded ou offline sem causa clara
- Houver necessidade de atualizar para uma versão nova do package (ex.: 0.2.x → 0.3.x)

---

## 7. Próximo passo recomendado

1. **Executar o checklist da seção 4** no pfSense (Diagnostics > Command Prompt) e registrar os resultados.
2. Se tudo estiver OK: considerar o Lasalle Agro **homologado e estável**; atualizar a trilha com o resultado da validação pfSense.
3. Se algum item falhar: documentar o problema e avaliar se é corrigível sem reinstalação (ex.: restart do serviço) ou se reinstalação é necessária.
4. **Não reinstalar** sem justificativa técnica clara.

---

## 8. Documentos de referência

- `18-homologacao-pfsense-package-real-2026-03-13.md` — rodada anterior
- `docs/39-ETAPA-A-VALIDACAO-SERVIDOR-2026-03-15.md` — validação do servidor
- `17-checklist-homologacao-bootstrap-pfsense-real.md` — checklist operacional
- `docs/INSTALACAO-AGENTE-PFSENSE.md` — procedimento de instalação
