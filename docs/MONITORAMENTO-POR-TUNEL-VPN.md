# Monitoramento por túnel/conexão (OpenVPN, IPsec, WireGuard)

O sistema reporta e exibe status **por túnel ou conexão** para OpenVPN, IPsec e WireGuard, permitindo ver qual instância ou túnel está off, e não apenas se o daemon está no ar.

---

## 1. Convenção de nomes

- **Formato:** `{tipo}:{identificador}` (ex.: `openvpn:server1`, `ipsec:con1_2`, `wireguard:wg0`).
- **Limite:** o campo `name` no heartbeat tem no máximo 64 caracteres; usar identificadores curtos (interface, id de conexão ou slug). Detalhes podem ir em `message`.
- **Retrocompatibilidade:** agentes antigos continuam enviando um único `openvpn`/`ipsec`/`wireguard`. Ao atualizar o agente para a versão com listagem por túnel, o payload passa a trazer apenas itens no formato `tipo:id`; o backend remove o registro genérico e persiste os por túnel.

---

## 2. Agente (pfSense)

### 2.1 OpenVPN

- **Função:** `list_openvpn_tunnel_status()`
- **Fonte:** diretório `/var/etc/openvpn` (variável `MONITOR_AGENT_OPENVPN_ETC`): ficheiros `.conf` e `.sock`. Para cada instância (ex.: server1, client1), o status é **running** se existir o socket de management ou o processo correspondente; caso contrário **stopped**.
- **Nome enviado:** `openvpn:{instância}` (ex.: `openvpn:server1`).

### 2.2 IPsec

- **Função:** `list_ipsec_tunnel_status()`
- **Fonte:** `swanctl --list-sas` (strongSwan). Em fallback, `strongswan status`. Cada conexão/child SA é mapeada para um item com status **running** (ESTABLISHED/INSTALLED) ou **stopped**.
- **Nome enviado:** `ipsec:{conn}` (ex.: `ipsec:con1`). O identificador em runtime no pfSense é `con` + IKE ID da Phase 1.
- **Descrição no painel:** o agente lê o campo **Description** (Phase 1) do `/conf/config.xml` e envia no `message` do serviço. O painel exibe essa descrição como título do túnel em vez de "con1", "con2" (ex.: "Matriz-Mecanica"). Função auxiliar: `get_ipsec_phase1_descriptions()` (PHP); mapeamento `con{ikeid}` → descrição.
- **Túneis desativados / degradação:** o agente reporta **todas** as Phase 1 do config (não só as que aparecem em `swanctl --list-sas`). Para cada Phase 1: se estiver ESTABLISHED no swanctl → `running`; caso contrário → `stopped`. Assim, quando um túnel é desativado ou cai, ele continua na lista como `stopped`, o backend marca o node como degradado e gera alerta (em vez de o túnel apenas sumir da lista).
- **Phase 1 desativada na UI (checkbox Disabled):** se a Phase 1 tiver o elemento `<disabled>` no config.xml, o agente envia status `not_installed` e mensagem "desativado" (ou "Description (desativado)"). O backend não conta como problema (sem degradação nem alerta) e o painel exibe o túnel em **cinza**, evitando falso positivo.

### 2.3 WireGuard

- **Função:** `list_wireguard_tunnel_status()`
- **Fonte:** `wg show interfaces`. No FreeBSD/pfSense, `wg` pode ter limitações; cada interface listada é reportada com status **running** se o comando retornar dados, **stopped** caso contrário.
- **Nome enviado:** `wireguard:{interface}` (ex.: `wireguard:wg0`).

### 2.4 Integração em `build_services_json()`

- Para `openvpn`, `ipsec` e `wireguard` na lista de serviços monitorados, o agente chama as funções de listagem por túnel e envia **um item por túnel** no array `services`. Se não houver túneis listados, faz fallback para um único item com o nome do serviço (ex.: `openvpn`) usando `detect_service_status`.
- Demais serviços (unbound, dhcpd, ntpd, dpinger) continuam com um item por serviço, como antes.

---

## 3. Backend (API)

- **Ingest:** sem mudança de contrato. O heartbeat já envia `services: [{ name, status, message?, impact_on_status? }]`. O ingest faz upsert por `(nodeId, serviceName)` e remove os que não vêm no body.
- **Severidade e alertas:** em `node-status.util.ts`, o “tipo” do serviço é o prefixo antes de `:` (ex.: `openvpn:ovpns1` → tipo `openvpn`). Túneis dos tipos `openvpn`, `ipsec` e `wireguard` são tratados como críticos quando em **stopped**; alertas usam título/descrição com o nome do túnel (ex.: “Service openvpn tunnel ovpns1 stopped”).
- **Exceção “sem clientes”:** serviços cujo tipo é `openvpn` e cuja mensagem indica “no clients”/“0 clients” continuam a não degradar o node nem gerar alerta.

---

## 4. Frontend (painel)

- **Página do node:** a lista de serviços é agrupada por **tipo** (OpenVPN, IPsec, WireGuard e demais). Para cada túnel, o **título** exibido é a descrição quando disponível (ex.: IPsec Phase 1 "Matriz-Mecanica"); caso contrário usa o identificador (con1, ovpns1, etc.). A `message` genérica ("tunnel", "running, 0 clients") só aparece como subtítulo quando for diferente do título.
- **Alertas:** o título do alerta já usa o nome do serviço (ex.: `ipsec:con1_2`); o backend formata como “Service ipsec tunnel con1_2 stopped” em `buildServiceAlert`.

---

## 5. Comportamento operacional

- Um túnel **stopped** ou **degraded** degrada o node e pode gerar alerta, com a mesma lógica de severidade dos serviços críticos (openvpn/ipsec/wireguard).
- Atualizar o agente nos firewalls (package com as funções de listagem por túnel) é necessário para passar a enviar túneis; após o update, o painel passa a mostrar as entradas por túnel e a refletir qual conexão está off.

---

---

## 6. Múltiplas interfaces de rede (LAN / WAN)

- **Agente (0.2.20+):** O agente envia no heartbeat:
  - **`mgmt_ip` / `wan_ip_reported`:** IPs em string (comma-separated), como antes.
  - **`interfaces`:** array de `{ "name": "WAN1GB", "ip": "10.200.201.2" }`, etc. O **nome** é a **descrição (nome visual)** da interface no pfSense (ex.: WAN1GB, LAN, WAN300, CAMERAS), não a chave física (opt1, em0, etc.). Interfaces sem IP (ex.: link down) aparecem com `"ip": "n/a"`.
- **Fallback (agente 0.2.21+):** Se `list_pfsense_interface_roles` não retornar linhas (config inacessível, PHP, etc.), o agente monta um array mínimo com **LAN** (IP de gerenciamento) e **WAN** (IP WAN), para o painel nunca receber lista vazia quando há pelo menos esses dois IPs.
- **Backend:** O payload é guardado em `payload_json`; o endpoint de detalhe do node devolve **`network_interfaces`** a partir do último heartbeat.
- **Frontend:** Quando existir `network_interfaces`, a página do node mostra a secção **"Interfaces (como no pfSense)"** com chips **LAN: 10.0.0.1**, **WAN: 1.2.3.4**, **OPT1: …**, etc. Valores vazios de `name` ou `ip` são exibidos como **"—"** e **"n/a"**; itens totalmente vazios são filtrados. Caso contrário, continua a usar os campos “IP(s) interno(s)” e “IP(s) público(s) / WAN”. O botão de **modo manutenção** na mesma secção é compacto (`text-xs`, `py-1.5`).

---

---

## 7. Cadastro de firewall (só cliente obrigatório)

- **Criar node:** No formulário de adição de firewall, **apenas o cliente é obrigatório**. Hostname e IPs podem ficar em branco: o sistema gera um **node_uid** (ex.: `fw-abc12def`) e devolve o comando de bootstrap. Depois de rodar o bootstrap no pfSense, o primeiro heartbeat preenche hostname, nome, IPs e interfaces.
- **Interfaces nomeadas:** Com agente 0.2.19+, as interfaces aparecem no painel com o **mesmo nome do pfSense** (LAN, WAN, OPT1, …) e o respectivo IP.

---

*Última atualização: 2026-03-16 — cadastro com hostname opcional; interfaces nomeadas (lan, wan, opt1…) no agente e no painel; fallback LAN/WAN no agente 0.2.21; exibição defensiva de interfaces e botão de manutenção menor no painel. Histórico completo: `docs/HISTORICO-E-LINHA-DO-TEMPO.md`.*
