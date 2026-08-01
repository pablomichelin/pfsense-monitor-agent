# 155 — Validação E2E real: `manage_local_user.php` (create/set_password/delete) contra pfSense 192.168.100.254

**Data:** 2026-07-31
**Escopo:** validação de ponta a ponta, contra o pfSense de produção `192.168.100.254` (`systemupfw.system.up`, Plus `26.03.1-RELEASE`), da correção `allocate_next_local_uid()` em `handle_create()` (achado 1.2 de `docs/153-AUDITORIA-CORRECOES-GESTAO-TECNICOS-2026-07-31.md`).
**Resultado:** a correção de uid estava certa, mas o teste **revelou um segundo bug crítico**, não relacionado a uid, em `local_user_set_password()` — corrigido nesta sessão. Após a correção, `create` → `set_password` → `delete` foram validados de ponta a ponta com sucesso, sem tocar nenhum usuário real. Package pfSense **`0.5.4`** gerado.

---

## 1. Contexto e método

- Acesso ao pfSense real via `ssh -o BatchMode=yes root@192.168.100.254 '<comando>'` — descobriu-se que o **exec não-interativo do SSH contorna o menu interativo do pfSense** (o menu só aparece em sessão `-t`/interativa), então **não foi necessário usar `pexpect`**: todos os comandos foram executados via `ssh root@192.168.100.254 '<cmd>'` / `scp` diretamente, de forma mais simples e confiável que automação de menu.
- Usuário de teste, sempre descartável e inconfundível: `zzz_uidtest_validacao` / `"UID Test Validacao - APAGAR"`.
- Senhas de teste: geradas na hora com `openssl rand -base64 24`, nunca reaproveitadas, nunca logadas em texto claro em nenhum artefato persistente (apenas em arquivos `chmod 600` em `/tmp` no controlador e no pfSense, todos apagados ao final).
- Estado "antes" (bcrypt-hash de todos os usuários reais) foi salvo apenas em `/tmp` no controlador (fora do repositório Git) e removido ao final da sessão — nunca commitado.

---

## 2. Primeira rodada — revelou bug real em `local_user_set_password()`

### 2.1 Estado inicial (antes de qualquer escrita)

```json
{
  "nextuid": "2011",
  "user_count": 5,
  "names_uids": ["Kailo:2005", "Osmarildo_Systemup:2010", "admin:0", "hotspot:2008", "pablo:2007"]
}
```

Backup de segurança: `cp /cf/conf/config.xml /root/config.xml.pre-uidtest-backup` no próprio pfSense (removido ao final, após confirmar sucesso do teste).

### 2.2 Teste `create` (código da sessão anterior, apenas com o fix de uid)

```
php -f /root/manage_local_user_uidtest.php create /root/uidtest-create.json
→ {"ok":true,"message":"created","username":"zzz_uidtest_validacao","uid":2011,"action":"create"}
```

`uid=2011` correto (nextuid estava em 2011, > maior uid existente 2010). **Até aqui, a correção do achado 1.2 funcionou exatamente como esperado.**

### 2.3 Verificação revelou um segundo bug crítico, não relacionado a uid

Ao inspecionar `config.xml` gerado:

```xml
<user>
  <name>zzz_uidtest_validacao</name>
  <descr><![CDATA[UID Test Validacao - APAGAR]]></descr>
  <scope>user</scope>
  <uid>2011</uid>
  <item>$2y$12$o1eiD6QIvNvfidUmyrJW3e5wyepwTAPYHuayAl2/JXpMPPsn3/dr.</item>
  <priv>page-all</priv>
</user>
```

O hash bcrypt foi parar dentro de uma chave **`item`** solta, e **não** em `bcrypt-hash` no nível esperado do registro do usuário. Consequência prática, confirmada:

```
$ id zzz_uidtest_validacao
id: zzz_uidtest_validacao: no such user
$ pw usershow zzz_uidtest_validacao
pw: no such user `zzz_uidtest_validacao'
```

**Nenhuma conta Unix foi criada.** O usuário ficaria "criado" apenas no `config.xml`, sem senha utilizável e sem conta no SO — nem login web nem SSH/console funcionariam. Isso é uma falha silenciosa mais grave que a original: o comando reportava `"ok":true`, mas o resultado real era um usuário inválido/inutilizável.

### 2.4 Causa raiz identificada

Inspecionado `/etc/inc/auth.inc` (linha 908) no próprio host:

```php
function local_user_set_password(&$user_item_config, $password) {
    $user = &$user_item_config['item'];
    unset($user['password']);
    ...
    $user['bcrypt-hash'] = password_hash($password, PASSWORD_BCRYPT);
    ...
    if (isset($user_item_config['idx'])) {
        config_set_path("system/user/{$user_item_config['idx']}", $user);
    }
}
```

Nesta versão do pfSense (Plus `26.03.1`), `local_user_set_password()` **espera um wrapper no formato `{'item': $user, 'idx': ...}`** (o mesmo formato retornado por `getUserEntry()`), e escreve o hash dentro de `$user_item_config['item']` — **não** diretamente no array passado. O código de `manage_local_user.php` chamava a função com o array do usuário "solto" (`local_user_set_password($user, $password)`), então:

- `$user_item_config['item']` não existia → PHP cria a chave `item` (inicialmente `null`) e a referencia como `$user`.
- `$user['bcrypt-hash'] = ...` faz o PHP autovivificar esse `null` em um array `['bcrypt-hash' => hash]`, aninhado dentro da chave `item` do array original.
- O array do usuário no nível esperado (`$user['bcrypt-hash']`) **nunca é preenchido**.
- Em seguida, `local_user_set($user)` faz a checagem `if (empty($user['sha512-hash']) && empty($user['bcrypt-hash']) && empty($user['password']))` — que dá **true** (todos vazios no nível certo) — loga `"password is missing"` e **retorna sem criar a conta Unix**.

Confirmado com um teste isolado em memória (sem `write_config`, sem tocar config real):

```
--- chamada com array "solto" (comportamento com bug) ---
array (
  'name' => 'debugtest', 'descr' => 'x', 'scope' => 'user', 'uid' => '9999',
  'item' => array ( 'bcrypt-hash' => '$2y$12$...' ),   // <- errado, aninhado
)
--- chamada com wrapper {'item' => $user} (comportamento correto) ---
array (
  'item' => array (
    'name' => 'debugtest2', 'descr' => 'x', 'scope' => 'user', 'uid' => '9998',
    'bcrypt-hash' => '$2y$12$...',   // <- correto, no nível certo
  ),
)
```

**Este bug também afetava `handle_set_password()`** (reset de senha de técnicos existentes) — mesma chamada incorreta, mesmo efeito: a senha nunca é de fato atualizada no nível certo, e a sincronização com o SO falha silenciosamente.

### 2.5 Limpeza da primeira rodada

`delete` foi executado sobre o usuário quebrado (função de delete não depende de senha, funcionou normalmente) e confirmado ausente de `config.xml` e do SO. `nextuid` permaneceu em `2012` (não decrementa ao deletar — comportamento esperado do pfSense).

---

## 3. Correção aplicada

**Arquivo:** `packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/manage_local_user.php`

Nova função helper:

```php
function apply_local_user_password(array &$user, string $password): void
{
    $wrapper = ['item' => $user];
    local_user_set_password($wrapper, $password);
    $user = $wrapper['item'];
}
```

`handle_create()` e `handle_set_password()` agora chamam `apply_local_user_password($user, $password)` em vez de `local_user_set_password($user, $password)` diretamente. Comentário no código documenta a causa raiz e referencia este relatório.

`php -l` sem erros. `PORTVERSION` (`Makefile`) e `SYSTEMUP_MONITOR_AGENT_VERSION` (`systemup_monitor.inc`) incrementados de `0.5.3` → **`0.5.4`**.

---

## 4. Segunda rodada — validação completa contra o código corrigido (do zero)

### 4.1 Estado inicial (idêntico ao esperado após limpeza da rodada 1)

```json
{"nextuid": "2012", "user_count": 5, "names": ["Kailo","Osmarildo_Systemup","admin","hotspot","pablo"]}
```

Novo backup `config.xml.pre-uidtest-backup` gerado; script corrigido copiado via `scp` para `/root/manage_local_user_uidtest.php` (MD5 conferido idêntico ao arquivo do repositório).

### 4.2 Teste `create`

```
{"ok":true,"message":"created","username":"zzz_uidtest_validacao","uid":2012,"action":"create"}
```

Verificação em `config.xml`:

```json
{
  "nextuid": "2013",
  "user_count": 6,
  "found_user": {
    "name": "zzz_uidtest_validacao", "descr": "UID Test Validacao - APAGAR",
    "scope": "user", "uid": "2012",
    "bcrypt-hash": "REDACTED-60chars",
    "priv": ["page-all"]
  }
}
```

Verificação no SO:

```
$ id zzz_uidtest_validacao
uid=2012(zzz_uidtest_validacao) gid=65534(nobody) groups=65534(nobody)
$ pw usershow zzz_uidtest_validacao
zzz_uidtest_validacao:$2y$12$ZOcRjap7Ps8txmBSKeOf3.saetnQwlUC4SfjVG.0.5dabIh7R8JIO:2012:65534::0:0:UID Test Validacao - APAGAR:/home/zzz_uidtest_validacao:/bin/tcsh
```

Conta Unix criada corretamente, com o **mesmo uid** do `config.xml`, hash aplicado, e shell `/bin/tcsh` (consistente com privilégio `page-all` → acesso administrativo completo, conforme `local_user_set()`).

### 4.3 Teste `set_password`

Hash antes: `$2y$12$ZOcRjap7Ps8txmBSKeOf3...`
Hash depois: `$2y$12$m1cC9uJmYrUMmXwWBCe6Be...`

```
{"ok":true,"message":"password reset","username":"zzz_uidtest_validacao","action":"set_password"}
```

Confirmado: hash do SO mudou de fato (senha realmente aplicada), `bcrypt-hash` continua no nível correto em `config.xml`, `priv: ["page-all"]` preservado, **nenhuma chave espúria `item`** (`has_item_key: false`).

### 4.4 Teste `delete` (limpeza)

```
{"ok":true,"message":"deleted","username":"zzz_uidtest_validacao","action":"delete"}
```

### 4.5 Verificação final — comparação com o "antes"

```json
{
  "nextuid": "2013",
  "user_count": 5,
  "names": ["Kailo","Osmarildo_Systemup","admin","hotspot","pablo"],
  "uids": ["2005","2010","0","2008","2007"]
}
```

```
$ id zzz_uidtest_validacao
id: zzz_uidtest_validacao: no such user
$ pw usershow zzz_uidtest_validacao
pw: no such user `zzz_uidtest_validacao'
```

Bcrypt-hash de todos os 5 usuários reais comparado (prefixo) contra o snapshot "antes" da segunda rodada — **idêntico, nenhum tocado**:

| Usuário | uid | Prefixo hash (antes) | Prefixo hash (depois) |
|---|---|---|---|
| Kailo | 2005 | `$2y$10$j2a` | `$2y$10$j2a` |
| Osmarildo_Systemup | 2010 | `$2y$12$yE6` | `$2y$12$yE6` |
| admin | 0 | `$2y$12$70u` | `$2y$12$70u` |
| hotspot | 2008 | `$2y$10$ETE` | `$2y$10$ETE` |
| pablo | 2007 | `$2y$10$mEP` | `$2y$10$mEP` |

**Única diferença:** `system/nextuid` avançou de `2012` para `2013` (esperado — o pfSense não decrementa esse contador ao deletar um usuário; não é um bug).

---

## 5. Limpeza de artefatos temporários

Removidos do pfSense (confirmado `ls` vazio após remoção):

- `/root/manage_local_user_uidtest.php`
- `/root/uidtest-create.json`, `/root/uidtest-set-password.json`, `/root/uidtest-delete.json`
- `/root/config.xml.pre-uidtest-backup`

Removidos do controlador (`/tmp/uidtest-254/`): payloads com senha, snapshot "antes" com bcrypt-hashes reais. **Nada sensível foi commitado ou permaneceu em disco** fora da sessão.

---

## 6. Nova versão do package pfSense

```
$ ./scripts/release-pfsense-package.sh --no-push
Versão do package: 0.5.4
Artifact created: dist/pfsense-package/monitor-pfsense-package-v0.5.4.tar.gz
Checksum created: dist/pfsense-package/monitor-pfsense-package-v0.5.4.tar.gz.sha256
Config atualizado: config/package-release.env
  PACKAGE_RELEASE_VERSION=0.5.4
  PACKAGE_RELEASE_SHA256=54f10a981b9fea751eb0ee676ba5c06e29249c669d567ccb830a36fa87bff99f
```

`.env.api` atualizado com os mesmos valores (`PACKAGE_RELEASE_VERSION=0.5.4`, `PACKAGE_RELEASE_SHA256=54f10a98...bff99f`). Nenhum commit/push feito (conforme restrição de coordenação desta sessão).

O container `api` foi recarregado com `docker compose up -d api` (**sem** `--build`, apenas recriação para reler `.env.api`/`config/package-release.env`) — nenhum build em andamento foi detectado no momento (`docker ps`/`ps aux` sem processos de build ativos). Container `web` **não** foi tocado. API voltou a ficar `healthy` em segundos e continuou processando heartbeats reais de produção normalmente durante e após a operação.

---

## 7. O que foi verificado e está correto

- Guard de conta de sistema (`scope=system` / `uid=0`) intacto — não testado diretamente contra `admin` (não haveria motivo, e seria arriscado); a lógica foi apenas revisada por leitura.
- `allocate_next_local_uid()` (achado 1.2 original) funcionou corretamente nas duas rodadas: uid `2011` e depois `2012`, sempre `> ` o maior uid existente e alinhado a `nextuid`.
- `handle_create`, `handle_set_password`, `handle_delete` (ação `delete`) — todos os três fluxos validados de ponta a ponta com o pfSense real após a correção.

## 8. O que **não** foi testado nesta sessão (fora do escopo pedido)

- Ação `disable` (não fazia parte do escopo do teste solicitado — o foco era `create`/`set_password`, com `delete` apenas para limpeza).
- Login efetivo via GUI web ou SSH com o usuário de teste (seria desnecessário e aumentaria a superfície de risco sem agregar confiança à validação já feita a nível de config + SO).
- Guardrail de "última conta admin ativa" (é lógica da API/controlador, não deste script agente).

## 9. Riscos residuais / observações

- O bug de `local_user_set_password()` encontrado aqui **também afetava, potencialmente, resets de senha de técnicos reais já provisionados** caso o package `0.5.3` chegasse a ser instalado em produção com essa função exercitada — o que reforça a decisão original de manter o rollout do package pendente de validação E2E antes do enablement em produção. Como o package `0.5.3` (e anteriores) **não usa `manage_local_user.php`** (função nova, ainda não publicada em nenhum firewall da frota — confirmado em `docs/147`), **nenhum firewall real foi exposto a este bug** até agora.
- Nenhuma ambiguidade ou bloqueio de segurança foi encontrado que exigisse parar o procedimento; o único desvio do roteiro original foi a necessidade de uma segunda rodada completa por causa do bug de `local_user_set_password()`, prevista explicitamente nas instruções da tarefa.

---

## 10. Versões desta entrega

| Componente | Antes | Depois |
|---|---|---|
| Package pfSense | `0.5.3` | `0.5.4` |
| API / Painel web | inalterado nesta sessão (outro worker em paralelo) | inalterado nesta sessão |

**Pendente para a sessão principal consolidar** (não feito aqui por causa da restrição de coordenação com o outro worker): atualizar `docs/00-INDICE-OPERACIONAL.md`, `00_inicio.md`, `LEITURA-INICIAL.md`, `docs/HISTORICO-E-LINHA-DO-TEMPO.md` com a entrega `0.5.4` e este relatório; `git commit`/`git push`.
