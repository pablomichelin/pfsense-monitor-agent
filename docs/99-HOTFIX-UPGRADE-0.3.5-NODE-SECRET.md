# 99 — Hotfix: upgrade GUI 0.3.5 → 0.3.10 (secret legado + arquivos do package)

**Data:** 2026-06-23  
**Package alvo:** `0.3.10`  
**Firewalls afetados:** ainda em **0.3.5** (ou intermediários) que completam download do tarball mas permanecem com `AGENT_VERSION=0.3.5`.

---

## Problema 1 — instalador recusava `--node-secret` (corrigido em 0.3.9)

| Camada | Comportamento |
|--------|----------------|
| Package **0.3.5** (`systemup_monitor.inc`) | Montava update passando `--node-secret` ao instalador |
| Instalador em **main** (0.3.7+) | Recusava `--node-secret` (hard exit 1) por segurança |
| Efeito | Chicken-and-egg: cada tentativa GUI baixa instalador novo e falha antes de instalar o tarball |

**Correção 0.3.9:** `install-from-release.sh` aceita `--node-secret` legado (aviso stderr, sem exit 1).

---

## Problema 2 — tarball instalado mas versão permanece 0.3.5 (corrigido em 0.3.10)

### Sintoma (ex.: pfSense `168.0.92.207`)

```text
/tmp/install-from-release.sh                          3663  B
Warning: --node-secret on command line is deprecated; ...
/tmp/.../pfsense-package.tar.gz                       48 kB
Config do agente regenerado (AGENT_VERSION=0.3.5).
SystemUp Monitor package files installed.
```

Hotfix 0.3.9 desbloqueia o fluxo, mas **não atualiza** `SYSTEMUP_MONITOR_AGENT_VERSION` nem substitui `systemup_monitor.inc` de forma efetiva no runtime PHP.

### Causa raiz

1. O tarball **0.3.9+** contém os arquivos corretos (`systemup_monitor.inc`, `info.xml`, libexec, www) — ~48–49 kB é o tamanho esperado.
2. `install-from-release.sh` extrai o tarball e chama `bootstrap/install.sh`, que **copia** `pfsense-package/files/usr/...` para `/usr/local/...` (não usa `pkg install`).
3. Em seguida `install.sh` executa `install_package_xml()` + `seed` via PHP do pfSense.
4. Nessa fase o PHP pode:
   - manter bytecode **stale** de `systemup_monitor.inc` no **opcache** (constante ainda `0.3.5`), e/ou
   - executar hooks de registro do package **antes** da cópia final prevalecer.
5. O `sync` final lia `SYSTEMUP_MONITOR_AGENT_VERSION` stale e regenerava o config com **0.3.5**.

Ou seja: o artefato era baixado e extraído, mas o **runtime PHP do pfSense** continuava enxergando a versão antiga do `.inc`.

### Correção 0.3.10

Em `packages/pfsense-package/bootstrap/install.sh`:

1. **`install_package_files()`** — cópia idempotente do tarball (`copy_tree` + `chmod`).
2. Após `install_package_xml` / `seed`, **repetir `install_package_files()`** (tarball vence sobre estado anterior).
3. **`invalidate_package_php_cache()`** — `opcache_invalidate()` em `.inc` e CLI.
4. **`sync` com `opcache.enable_cli=0`** — garante leitura do `.inc` novo ao gravar `AGENT_VERSION`.

---

## Workaround SSH imediato (sem esperar 0.3.10 no artefato)

Forçar cópia manual + sync (Diagnostics → Command Prompt ou SSH):

```sh
NODE_SECRET="$(grep '^NODE_SECRET=' /usr/local/etc/monitor-pfsense-agent.conf | cut -d= -f2- | tr -d '\"')"
SECRET_FILE="/var/db/monitor-pfsense-agent/.update-node-secret"
SHA256="SUBSTITUIR_PELO_SHA256_DE_config/package-release.env"
ARTIFACT="https://pfs-monitor.systemup.inf.br/api/v1/agent/package-artifact"
INSTALLER="https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main/packages/pfsense-package/bootstrap/install-from-release.sh"
mkdir -p /var/db/monitor-pfsense-agent && printf '%s' "$NODE_SECRET" > "$SECRET_FILE" && chmod 600 "$SECRET_FILE" && fetch -o /tmp/install-from-release.sh "$INSTALLER" && chmod +x /tmp/install-from-release.sh && env MONITOR_UPDATE_NODE_SECRET="$NODE_SECRET" /tmp/install-from-release.sh --release-url "$ARTIFACT" --sha256 "$SHA256" --secret-file "$SECRET_FILE" --controller-url https://pfs-monitor.systemup.inf.br --node-uid "$(grep '^NODE_UID=' /usr/local/etc/monitor-pfsense-agent.conf | cut -d= -f2- | tr -d '\"')" --customer-code "$(grep '^CUSTOMER_CODE=' /usr/local/etc/monitor-pfsense-agent.conf | cut -d= -f2- | tr -d '\"')" --heartbeat-mode normal && rm -f "$SECRET_FILE"
grep 'SYSTEMUP_MONITOR_AGENT_VERSION' /usr/local/pkg/systemup_monitor.inc | head -1
grep '^AGENT_VERSION=' /usr/local/etc/monitor-pfsense-agent.conf
```

Se `AGENT_VERSION` ainda estiver em 0.3.5 após o comando acima (instalador antigo em cache):

```sh
/usr/local/bin/php -d opcache.enable_cli=0 -f /usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php sync
grep '^AGENT_VERSION=' /usr/local/etc/monitor-pfsense-agent.conf
```

Validar na GUI: **Services → SystemUp Monitor → Diagnóstico** (versão do package) e heartbeat no painel.

---

## Testes

```bash
chmod +x scripts/test-install-from-release-args.sh scripts/test-install-upgrade-files.sh
./scripts/test-install-from-release-args.sh
./scripts/test-install-upgrade-files.sh
sh -n packages/pfsense-package/bootstrap/install.sh
```

---

## Referências

- Guia operação §6: `docs/pfsense-package/00-GUIA-OPERACAO-PACKAGE.md`
- Entrega anterior: `docs/98-ENTREGA-PACKAGE-0.3.8.md`
- Release: `./scripts/release-pfsense-package.sh`
