# 170 — Correção: create de técnico apagava usuários da GUI (órfão Unix)

**Data:** 2026-08-20  
**Versão:** package **0.5.10** (API e painel inalterados)

## Sintoma

Depois de provisionar um técnico pelo painel, um usuário local que **já existia** no pfSense (ex.: `pablo`) some do User Manager. Tentar criá-lo de novo na GUI retorna **“o usuário é reservado pelo sistema”**.

Isso **não** é a proteção de `admin`/`root` do Monitor. É o pfSense recusando o nome porque a conta ainda existe no Unix (`/etc/passwd`) e **não** está mais no `config.xml`.

## Causa

`manage_local_user.php` no `create`:

1. Chamava `local_user_set()` **antes** de gravar o `config.xml` (Unix primeiro).
2. Relia `system/user` e **reescrevia a lista inteira**. Se essa leitura viesse vazia, como dicionário de um único usuário, ou sem `admin`, o `write_config` gravava uma lista truncada.
3. Contas sumiam da GUI; o `pw` no SO permanecia → GUI: *reserved by the system*.

## Correção (0.5.10)

- Lista de usuários normalizada (`init_config_arr`); recusa reescrita sem `admin` / uid 0.
- Ordem da GUI no **create**: **config.xml primeiro**, depois sync Unix.
- `create` em usuário que já está no config vira `set_password` (upsert no agente).
- Conta Unix órfã (nome no `passwd`, ausente no config) é **adotada** (mesmo uid), em vez de falhar ou alocar uid novo.
- Reset de senha preserva name/uid/priv/grupos (não grava item parcial).
- Delete remove o Unix **antes** de gravar o config: se o `del` falhar, a conta permanece na GUI (evita órfão).
- Alocação de uid novo considera `/etc/passwd` (não colide com órfãos).
- `adopt_orphans` só recoloca contas que parecem usuário local pfSense (`home` em `/home/<nome>`), com denylist de serviços.
- Se o `admin` também sumiu do config mas o Unix `admin` (uid 0) existe, o reparo recoloca o `admin` com `page-all` (senha web pode precisar ser redefinida na consola).

## Mandar para a frota inteira

Não dá para saber pelo painel quais boxes ficaram órfãos (o snapshot só vê o `config.xml`). O reparo vai **em todos** no upgrade do package **0.5.10**:

1. Artefato publicado no controlador (`config/package-release.env` + `dist/pfsense-package/`).
2. Em `/nodes`: selecionar a frota (ou filtrar e selecionar todos visíveis).
3. **Atualizar package em lote** → `0.5.10`.
4. O upgrade da frota usa `bootstrap/install.sh` (não o `pkg-install` do FreeBSD). Esse script agora roda `adopt_orphans` após copiar os ficheiros.
5. `adopt_orphans` recoloca no `config.xml` contas Unix locais (`uid >= 2000`, home em `/home/...`) que não estão na GUI (ex.: `pablo`), sem apagar a senha Unix.
6. No User Manager o usuário volta a aparecer. Se o login web falhar, redefine a senha na GUI (o hash web mora no `config.xml`; o SSH/console pode continuar com a senha antiga).

Log no firewall: `/tmp/systemup-monitor-user-repair.log`.

## Recuperar `pablo` agora (num firewall só, sem esperar o lote)

Logado como **admin** (ou SSH root). **Não** recrie pelo Monitor se `pablo` era admin completo do appliance — o provisionamento de técnico entrega só o privilégio SystemUp, sem User Manager.

```sh
pw usershow pablo
grep -i '<name>pablo</name>' /conf/config.xml || echo 'ausente do config.xml'
```

Se existir no `pw` e **não** no `config.xml`:

```sh
pw userdel pablo
```

Depois: **System → User Manager → Add** e recrie `pablo` com os privilégios corretos.

Alternativa: restaurar o bloco `<user>` de `pablo` a partir do backup de `config.xml` feito pelo portal imediatamente antes do provisionamento (se a opção de backup automático estava ligada).

## Rollout

Package **0.5.10** publicado (`scripts/release-pfsense-package.sh`). Atualizar o agente na frota antes de novos provisionamentos.
