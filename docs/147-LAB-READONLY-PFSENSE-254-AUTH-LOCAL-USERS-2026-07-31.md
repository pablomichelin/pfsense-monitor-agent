# Lab read-only — pfSense 192.168.100.254 (auth / usuários locais)

**Data:** 2026-07-31  
**Escopo:** validar itens da seção 6 do `docs/144-PLANO-GESTAO-CENTRALIZADA-USUARIOS-LOCAIS-PFSENSE-2026-07-31.md` **sem alterar** o firewall de produção.  
**Host alvo:** `192.168.100.254` — node `systemupfw.system.up` no controlador Monitor-Pfsense.

---

## 1. Resumo executivo

| Item | Resultado |
|------|-----------|
| Acesso SSH interativo | **OK** a partir do controlador **`192.168.100.221`**: `ssh root@192.168.100.254` (chave, `BatchMode`), menu → **8** (Shell). Automação: `python3` + **pexpect** (pacote `python3-pexpect`; **`expect` não instalado** no 221) |
| Acesso web | **Alcance parcial** — GUI em `https://192.168.100.254:9999/` (login pfSense Plus); inspeção PHP feita via SSH read-only |
| Versão pfSense | **Plus `26.03.1-RELEASE`** — confirmado em consola SSH e `cat /etc/version` no host (`systemupfw.system.up`); alinhado à telemetria do controlador |
| Package `systemup-monitor` | **Instalado**, versão **`0.4.18`** (`config.xml` do backup); agente em `/usr/local/libexec/monitor-pfsense-agent/` (**sem** `manage_local_user.php`) |
| `manage_local_user.php` no firewall | **Não existe** (esperado até Fase 1) |
| Funções `auth.inc` (item §6 **1**) | **Confirmadas no disco** `/etc/inc/auth.inc` (Plus 26.03.1) — linhas exatas §4.2 |
| Bootstrap CLI (item §6 **3**) | **Parcial** — `config.inc`/`auth.inc` carregáveis via CLI (padrão package); **falta** dry-run `php -r` / script stub no 254 |
| Estrutura `config.xml` / disable (item §6 **4** parcial) | **Confirmada** via backup criptografado + comportamento `is_account_disabled` no disco |
| Privilégio admin completo (item §6 **2**) | **`page-all`** em `/etc/inc/priv.defs.inc:16-21` **e** no backup XML (grupo `admins`) |

**Risco residual:** piloto de **escrita** ainda exige homologação adicional em VM **CE 2.8.1** (plano 144) e teste isolado de `manage_local_user.php` antes de flags em produção.

---

## 2. Tentativas de acesso (read-only)

### 2.1 SSH

> **Estado atual (pós-liberação ACL, 2026-07-31):** `root@192.168.100.254` com chave a partir do **221** — **OK** (detalhes §2.4).

- **Rede (histórico manhã):** ICMP para `192.168.100.254` OK a partir do controlador (`192.168.100.221`). Portas **22** e **9999** ficaram **inacessíveis** (timeout TCP) em parte desta sessão — comportamento **intermitente** (antes: TCP 22 com `Permission denied`; depois: timeout). Possíveis causas: regra pfSense/LAN, anti-brute force ou filtro por origem; **não alterado** nada no firewall.
- **Menu pfSense:** quando SSH responde com utilizador `admin`, a consola abre **menu interativo** — opção **8 (Shell)** antes de comandos read-only (`grep`, `pfSense -v`). Automação: `ssh -t admin@192.168.100.254` + enviar `8\n` (expect/pexpect) ou utilizador com shell directo (`root`/`codex`, se política do lab permitir — ver trilha Layer7 em `/Dados/_layer7-audit/docs/08-lab/lab-topology.md`).
- **Comandos testados:** `ssh -o BatchMode=yes` para `root`, `admin`, `codex` @ `192.168.100.254` e IPs alternativos do node (`192.168.95.254`, `10.0.85.1`) — sem sucesso com chave.
- **Credenciais no controlador:** não há `id_ed25519`/`id_rsa` em `~/.ssh/` (só chave GitHub); **nenhuma** variável SSH/senha pfSense em `.env.api` / `.env.api.example` do Monitor-Pfsense. Credenciais devem vir de inventário local do operador (fora do Git).

### 2.2 Web / API

- HTTP `:80` redireciona para **`https://192.168.100.254:9999/`**.
- HTTPS `:443` no IP não respondeu no timeout do teste; **`:9999`** responde (login Plus).
- Endpoints `GET /api/v1/system/version` e `/api/v2/system/version` sem autenticação → **404** (esperado).

### 2.3 Telemetria e backup (somente leitura no controlador)

- **DB `nodes`:** `pfsense_version = 26.03.1-RELEASE`, `agent_version = 0.4.18`, `last_seen_at` recente.
- **Backup `node_config_backups`:** último `cfgb_20260731T141649Z_4384ecaf.enc` descriptografado **localmente** (AES-GCM, chave já configurada no container API) para inspecionar estrutura XML — **nenhum write** no pfSense.

---


### 2.4 SSH confirmado a partir do controlador (2026-07-31, pós-liberação ACL)

**Origem:** host **`192.168.100.221`** (`/Dados/Monitor-Pfsense`), somente leitura.

| Teste | Resultado |
|-------|-----------|
| `ssh -o BatchMode=yes root@192.168.100.254` | **OK** — menu pfSense interativo |
| Menu → opção **8** (Shell) | **OK** — prompt `[26.03.1-RELEASE][root@systemupfw.system.up]/root:` |
| Automação | **pexpect** (Python 3); script bash `scripts/lab-pfsense-254-readonly-shell.sh` requer **`expect`** (ausente no 221) |
| Shell remoto | **tcsh/csh** — redirecionamento `2>/dev/null` em linha única falha (`Ambiguous output redirect`); usar comandos sem redirect ou `sh -c '…'` |

**Banner consola:** Netgate **pfSense Plus 26.03.1-RELEASE (amd64)** on **systemupfw**; LAN **192.168.100.254/24**.

**Comandos executados (output resumido abaixo; detalhes §4.2):**

```text
cat /etc/version          → 26.03.1-RELEASE
pfSense -v                → comando não encontrado no PATH do shell
grep ^function local_user → linhas 713, 879, 908, 940, 967
grep funções alvo         → 351, 406, 713, 879, 908, 967, 2028
priv.defs.inc page-all    → linhas 16–21
ls monitor-pfsense-agent  → 8 arquivos (monitor-pfsense-agent.sh, collect_*.php, run_*.sh); sem manage_local_user.php
/usr/local/etc/monitor-pfsense-agent/ → diretório inexistente no host
```

**Script expect (estação com `expect` instalado):** `scripts/lab-pfsense-254-readonly-shell.sh` — equivalente; no controlador usar pexpect conforme §2.4.


## 3. Versão pfSense e package monitor

| Fonte | Valor |
|-------|--------|
| Heartbeat / coluna `nodes.pfsense_version` | `26.03.1-RELEASE` |
| Página de login `:9999` | **Netgate pfSense Plus** |
| `installedpackages` → `systemup-monitor` → `version` no backup | `0.4.18` |
| Diretório agente no repo (referência package) | `monitor-pfsense-agent.sh`, `collect_config_snapshot.php`, … — **sem** `manage_local_user.php` |

---

## 4. Funções PHP (`auth.inc`) — referência upstream

**Origem:** clone somente leitura `https://github.com/pfsense/pfsense` branch **`RELENG_2_7_2`** em `/tmp/pfsense-src-clone` (2026-07-31).  
**Caminho instalado equivalente no pfSense:** `/etc/inc/auth.inc` (no tree de desenvolvimento: `src/etc/inc/auth.inc`).

| Função | Assinatura | Arquivo:linha (upstream) | Uso previsto no agente |
|--------|------------|---------------------------|-------------------------|
| `get_user_privileges` | `function get_user_privileges(& $user)` | `auth.inc:349` | Resolver privilégios efetivos (inclui grupos) |
| `userHasPrivilege` | `function userHasPrivilege($userent, $privid = false)` | `auth.inc:403` | Checar `page-all`, `user-shell-access`, etc. |
| `local_user_set` | `function local_user_set(& $user)` | `auth.inc:646` | Sincronizar conta Unix (senha hash, shell, lock se disabled) |
| `local_user_del` | `function local_user_del($user)` | `auth.inc:789` | Remover conta Unix + `local_group_del_user` |
| `local_user_set_password` | `function local_user_set_password(&$user, $password)` | `auth.inc:820` | Define hash (`bcrypt`/`sha512` conforme `system/webgui/pwhash`); **não** persiste `config.xml` sozinha |
| `local_user_set_groups` | `function local_user_set_groups($user, $new_groups = NULL)` | `auth.inc:875` | Membros de grupos locais |
| `is_account_disabled` | `function is_account_disabled($username)` | `auth.inc:1909` | `isset($user['disabled'])` em `config.xml` |

### 4.1 Comportamento relevante (upstream)

- **`local_user_set_password`:** recebe senha em texto claro; grava `bcrypt-hash` ou `sha512-hash` no array `$user`; remove campos legados de hash/senha.
- **`local_user_set`:** exige hash ou senha no array; se usuário disabled/expired (`is_account_disabled` / `is_account_expired`), força shell `/sbin/nologin` e `pw lock` (exceto uid 0).
- **`local_user_del`:** não remove uid 0 (`/root`); remove entrada Unix e chama `local_group_del_user`; comentário no código indica que remoção de grupos exige **`write_config()`** depois.

**Persistência:** a GUI (`system_usermanager.php`) sempre chama **`write_config($savemsg)`** após alterar o array `$config['system']['user']` e invocar `local_user_set` / `local_user_del`.

### 4.2 Confirmação no disco do host 254 (`/etc/inc/auth.inc`)

| Campo | Valor |
|-------|--------|
| Obtido via SSH do controlador | **Sim** — `192.168.100.221` → `root@192.168.100.254`, menu **8**, 2026-07-31 ~16:40 UTC-3 |
| Versão (`cat /etc/version`) | **`26.03.1-RELEASE`** |
| Hostname | **`systemupfw.system.up`** |

**Saída exata — `grep -n '^function local_user' /etc/inc/auth.inc`:**

```text
713:function local_user_set($user) {
879:function local_user_del($user) {
908:function local_user_set_password(&$user_item_config, $password) {
940:function local_user_get_groups($user, $all = false) {
967:function local_user_set_groups($user, $new_groups = NULL) {
```

**Saída exata — funções alvo (grep composto):**

```text
351:function get_user_privileges(& $user) {
406:function userHasPrivilege($userent, $privid = false) {
713:function local_user_set($user) {
879:function local_user_del($user) {
908:function local_user_set_password(&$user_item_config, $password) {
967:function local_user_set_groups($user, $new_groups = NULL) {
2028:function is_account_disabled($username) {
```

| Função | Linha **Plus 26.03.1** | Assinatura no disco |
|--------|-------------------------|---------------------|
| `get_user_privileges` | 351 | `function get_user_privileges(& $user)` |
| `userHasPrivilege` | 406 | `function userHasPrivilege($userent, $privid = false)` |
| `local_user_set` | 713 | `function local_user_set($user)` — *sem* `&` na assinatura (upstream CE 2.7.x usava `& $user`) |
| `local_user_del` | 879 | `function local_user_del($user)` |
| `local_user_set_password` | 908 | `function local_user_set_password(&$user_item_config, $password)` |
| `local_user_set_groups` | 967 | `function local_user_set_groups($user, $new_groups = NULL)` |
| `is_account_disabled` | 2028 | `function is_account_disabled($username)` |

**`priv.defs.inc` (disco 254):** `grep -n page-all /etc/inc/priv.defs.inc`:

```text
16:$priv_list['page-all'] = array();
17:$priv_list['page-all']['name'] = gettext("WebCfg - All pages");
18:$priv_list['page-all']['descr'] = gettext("Allow access to all pages");
19:$priv_list['page-all']['warn'] = "standard-warning-root";
20:$priv_list['page-all']['match'] = array();
21:$priv_list['page-all']['match'][] = "*";
```

**`grep disabled` (primeiras ocorrências relevantes no disco):** **444**, **753–754**, **2028–2031** (`isset($user['disabled'])` em `is_account_disabled`).

**Comparação upstream `RELENG_2_7_2`:** mesmas funções e fluxo; **linhas e assinatura de `local_user_set` / nome do parâmetro em `local_user_set_password` divergem** — implementação do agente deve usar APIs documentadas acima, não offsets do clone CE.


---

## 5. Desabilitar vs deletar usuário local

### 5.1 Desabilitar (upstream GUI — `system_usermanager.php`)

1. No registro do usuário em `$config['system']['user']`: **`$userent['disabled'] = true`** (ou `unset` para reativar).
2. **`local_user_set_groups($userent, …)`** se grupos mudarem.
3. **`local_user_set($userent)`** — aplica lock no OS.
4. **`write_config(...)`**.

Campo XML: elemento **`<disabled/>`** (presença = desabilitado; ausência ou unset = ativo). Confirmado no backup do 254: usuários ativos **sem** `<disabled>`.

### 5.2 Deletar (upstream GUI)

1. **`local_user_del($a_user[$id])`** — remove conta OS.
2. **`unset($a_user[$id])`** + **`array_values($a_user)`** — reindexar (issue 7733).
3. Persistir array em config + **`write_config(...)`**.

Restrições na GUI (não necessariamente em `auth.inc`): não apagar usuário logado; não apagar `scope=system` da mesma forma que user comum.

### 5.3 Evidência no backup 192.168.100.254 (estrutura apenas)

- **`system.user`:** 5 entradas; tags típicas: `name`, `descr`, `scope`, `uid`, `bcrypt-hash`, `priv`, `disabled`, `cert`, …
- **`scope`:** `admin` → `system`, uid `0`; demais → `user`.
- **Grupo `admins`:** `<priv>page-all</priv>`, membros uid **`0`** (`admin`) e **`2007`** (`pablo`).

| `name` | `scope` | `uid` | `disabled` | Admin GUI (`page-all`) |
|--------|---------|-------|------------|-------------------------|
| `admin` | `system` | `0` | — | Sim (grupo `admins` + `user-shell-access`) |
| `pablo` | `user` | `2007` | — | Sim (membro `admins`) |
| `Kailo` | `user` | `2005` | vazio (ativo) | Não (sem grupo `admins` no backup) |
| `Osmarildo_Systemup` | `user` | `2010` | — | Não |
| `hotspot` | `user` | `2008` | — | Não |


---

## 6. Privilégio `admin_full` (config)

| Conceito plano 144 | String exata no pfSense |
|--------------------|-------------------------|
| Admin completo GUI | **`page-all`** |
| Nome humano (priv.defs.inc upstream) | **WebCfg - All pages** |

**Upstream `priv.defs.inc:16-21`:**

```php
$priv_list['page-all']['name'] = gettext("WebCfg - All pages");
```

**Padrão observado no 254:** privilégio **`page-all`** no grupo **`admins`**, com usuários referenciados por **`<member>UID</member>`** — não necessariamente `<priv>` no nó do usuário (`admin` tinha só `user-shell-access` direto, administração via grupo).

**Recomendação para `local_user_create` (Fase 1b):** ao provisionar técnico com `admin_full`, preferir **adicionar uid ao grupo `admins`** (alinhado ao backup de produção) **ou** atribuir `<priv>page-all</priv>` diretamente — documentar escolha na implementação; allowlist do controlador continua `privilege_profile: admin_full` → mapeamento interno para `page-all` / grupo `admins`.

---

## 7. Guardrail — última conta administrativa

### 7.1 No pfSense (upstream)

- **Não** há função dedicada “impedir remoção do último admin” em `auth.inc`.
- A GUI impede auto-exclusão e trata `scope=system`; **não** substitui a regra de negócio do plano 144 §7 item 6.

### 7.2 Regra recomendada (controlador + snapshot)

Conta **administrativa ativa** = usuário local **não** disabled **e** com privilégio efetivo **`page-all`** (via `get_user_privileges()` / grupos, especialmente **`admins`**).

**No snapshot do 254 (2026-07-31):** **2** contas admin ativas (`admin` uid 0, `pablo` uid 2007 via grupo `admins`). Revogar uma ainda deixa a outra — o guardrail deve **bloquear** quando restaria **0** admins ativos.

**Pré-requisito Fase 1:** coleta agente de inventário de usuários locais (uid, name, disabled, grupos, privs efetivos) — ainda pendente no package; até lá, usar backup/heartbeat enriquecido.

---

## 8. Item 3 — CLI `manage_local_user.php` (bootstrap)

Padrão já usado pelo package (**`systemup_monitor_cli.php`** no repo):

```php
require_once('/etc/inc/config.inc');
require_once('/etc/inc/globals.inc');
// + auth.inc quando manipular usuários
require_once('/etc/inc/auth.inc');
```

- **`config.inc`** carrega `globals.inc`, `config.lib.inc`, etc. — **sem** sessão web.
- **Validação pendente no 254:** executar script dry-run **somente leitura** (`php -r` listando funções) após obter SSH; homologação CE 2.8.1 VM continua válida como gate antes de piloto Plus.

**Recomendações para implementação:**

1. CLI only; payload JSON em arquivo **0600** (plano 144).
2. Fluxo **disable:** `getUserEntry($username)` → set/unset `disabled` → `config_set_path` / atualizar array → `local_user_set` → `write_config("systemup-monitor: …")`.
3. Fluxo **delete:** localizar índice em `config_get_path('system/user')` → `local_user_del` → remover do array → `write_config`.
4. Fluxo **create/set_password:** `local_user_set_password` + priv/grupos + `local_user_set` + `write_config`.
5. **Nunca** logar senha; remover payload 0600 no `trap EXIT` do dispatcher.

---

## 9. Mapeamento seção 6 do plano 144

| # | Item plano 144 | Status neste lab |
|---|----------------|------------------|
| 1 | Funções `auth.inc` | **Validado (disco)** — §4.2; assinaturas Plus 26.03.1 |
| 2 | Admin completo (`page-all`) | **Validado** — `priv.defs.inc:16-21` no host + backup XML (grupo `admins`) |
| 3 | Bootstrap CLI `config.inc` | **Parcial** — padrão do package; **pendente** dry-run PHP no 254 |
| 4 | Guardrail última admin | **Parcial (regra controlador)** — pfSense **não** impede sozinho; snapshot 254 com 2 admins ativos |

---

## 10. Próximo passo para implementação (Fase 1)

1. **Implementar `manage_local_user.php`** no package com ações **`disable`** e **`delete` primeiro**, usando fluxos §5 e §8 e funções §4.2 (`local_user_set` / `local_user_del` + `write_config`).
2. Integrar dispatcher no **`monitor-pfsense-agent.sh`** (payload JSON 0600, comandos `local_user_disable` / `local_user_delete`).
3. **Dry-run CLI no 254** (read-only até flags): `php -l manage_local_user.php`; opcional `php -r` carregando `config.inc` + listagem de funções — **sem** alterar usuários.
4. Adicionar **coleta de usuários locais** no agente para guardrail §7 (última conta `page-all` ativa).
5. Homologação VM **CE 2.8.1** antes de piloto de escrita em Plus; manter **`minAgentVersion` 0.5.0** até package publicado.

---

## 11. Referências

- Plano mestre: `docs/144-PLANO-GESTAO-CENTRALIZADA-USUARIOS-LOCAIS-PFSENSE-2026-07-31.md` §6 (atualizado com link a este doc).
- Upstream consultado: `pfsense/pfsense` **`RELENG_2_7_2`** (clone local) e **`master`** (GitHub, `src/etc/inc/auth.inc` — funções `local_user_*` alinhadas; linhas ~709–940 em 2026-07-31).
- **Revalidação:** 2026-07-31 ~19:27 UTC — backup re-lido no container API.
- **SSH read-only controlador:** 2026-07-31 ~16:40 UTC-3 — `221` → `254`, menu **8**, `/etc/inc/auth.inc` e `priv.defs.inc` lidos no disco (Plus **26.03.1-RELEASE**).
