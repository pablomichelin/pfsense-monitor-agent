# 143 — Correção XML mal formado do package (release 0.4.18)

**Data:** 2026-07-08  
**Status:** Corrigido — release **0.4.18** publicada no controlador

---

## Sintoma (2 firewalls de clientes)

Após instalar/atualizar o agente (releases 0.4.10 → 0.4.17), a GUI do pfSense passou a
exibir a página **"Package / Editor"** vazia (painel em branco com botões **Add** e
**Save**) ao acessar as telas do package via framework do pfSense
(`pkg.php?xml=systemup_monitor.xml` / `pkg_edit.php?xml=systemup_monitor.xml` — links
**Edit/Add** da página de configuração, ou entrada de menu sem `url`).

Screenshot do cliente (2026-07-08): breadcrumb `Package / Editor`, painel vazio, botão
verde `+ Add` e botão `Save` sem nenhum campo.

---

## Causa raiz

No release **0.4.10** (commit `a3774ea`, doc 132), o bloco
`custom_php_service_status_command` do `systemup_monitor.xml` foi convertido de
**CDATA** para linha inline — e o `&` de `2>&1` ficou **sem escape**:

```xml
<!-- 0.4.1 (válido, CDATA) -->
<custom_php_service_status_command>
  <![CDATA[ ... 2>&1 ... ]]>
</custom_php_service_status_command>

<!-- 0.4.10 a 0.4.17 (INVÁLIDO — & sem escape) -->
<custom_php_service_status_command>$rc = (mwexec("... 2>&1") == 0);</custom_php_service_status_command>
```

`&1` não é uma entidade XML válida (`xmlParseEntityRef: no name`). Consequências no pfSense:

1. **`parse_xml_config_pkg()` retorna `-1`** para o arquivo. Em `pkg.php`/`pkg_edit.php`,
   `$pkg['title']` fica vazio → título cai no fallback `Package / Editor` e a página
   renderiza sem campos — exatamente a tela reportada.
2. **`install_package_xml()` falha silenciosamente** (`read_package_config` retorna
   `false`) → registro de menu/GUI no `config.xml` não acontece. Esta é a causa
   primária da saga do menu ausente (docs 137/138/139/140): os retries e correções de
   race atacavam sintomas, mas o parse do XML nunca funcionou desde 0.4.10. O menu só
   aparecia em nós que já o tinham registrado por versões ≤0.4.1 ou via reparo manual
   (`systemup_monitor_register_menu()` injeta direto no `$config`, sem parsear o XML).

O agente/heartbeat/upgrade remoto **não** são afetados (não parseiam o XML) — por isso
os nós seguiam online no painel.

---

## Correções (release 0.4.18)

| Arquivo | Mudança |
|---|---|
| `packages/.../pkg/systemup_monitor.xml` | `2>&1` → `2>&amp;1` (XML bem formado) |
| `scripts/build-pfsense-package-artifact.sh` | guard: build falha se `info.xml` ou `systemup_monitor.xml` estiverem mal formados (expat) |
| `packages/pfsense-package/Makefile` | `PORTVERSION=0.4.18` |
| `systemup_monitor.inc` | `SYSTEMUP_MONITOR_AGENT_VERSION` → 0.4.18 |
| `config/package-release.env` | versão/SHA256 0.4.18 |

**Release 0.4.18:** SHA256 `fe0fdfaca6139e7a5e051b4e722cb019df13b6167fef64bdd7a883f6c7a1bf11` (64 307 bytes)

Verificação pós-release:

```bash
curl -s http://127.0.0.1:8088/api/v1/agent/package-release | jq '{version,sha256}'
# 0.4.18 / fe0fdfac…
curl -sI http://127.0.0.1:8088/api/v1/agent/package-artifact | grep -i content-length
# Content-Length: 64307
./scripts/smoke-agent-release.sh 0.4.18   # OK (9/9)
```

---

## Remediação nos firewalls afetados

### Opção A — upgrade remoto (recomendado)

Painel `/nodes` → selecionar os firewalls → **Atualizar package em lote** (alvo
**0.4.18**). O `install-from-release.sh` sobrescreve o XML corrigido e o
`ensure_package_gui_registration` volta a funcionar (o `install_package_xml` passa a
parsear o arquivo).

### Opção B — reparo manual imediato (shell do pfSense, root)

Corrige o XML no lugar e reregistra a GUI sem reinstalar:

```sh
sed -i '' 's|2>&1") == 0);</custom_php_service_status_command>|2>\&amp;1") == 0);</custom_php_service_status_command>|' /usr/local/pkg/systemup_monitor.xml
/usr/local/bin/php -d opcache.enable_cli=0 -f /usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php register-gui < /dev/null
rm -f /tmp/config.cache
```

Recarregar a GUI (Ctrl+F5) → **Services → SystemUp Monitor** deve abrir a página de
configuração normal (abas Configuracao | Diagnostico | Backup) e os links Edit/Add
(`pkg_edit.php`) voltam a renderizar o formulário completo em vez de "Package / Editor"
vazio.

### Frota

Todos os nós em 0.4.10–0.4.17 carregam o XML inválido (mesmo com menu visível).
Recomenda-se lote de upgrade para **0.4.18** em toda a frota elegível.

---

## Lição / prevenção

- Conteúdo PHP/shell dentro de tags XML do pfSense deve usar **CDATA** ou escapar
  `&`, `<`, `>`; o parser (expat) rejeita o arquivo inteiro em caso de entidade inválida.
- O guard de well-formedness no build (`build-pfsense-package-artifact.sh`) impede a
  regressão: qualquer XML inválido agora aborta o release.

## Relacionados

- Doc **132** — release 0.4.10 (origem da regressão)
- Docs **137/138/139/140** — sintomas de menu ausente causados por este parse quebrado
