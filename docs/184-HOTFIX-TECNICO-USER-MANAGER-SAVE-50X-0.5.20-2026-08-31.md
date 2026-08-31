# 184 — Hotfix: 50x ao salvar usuário no User Manager (técnico)

**Data:** 2026-08-31  
**Versões:** package pfSense **0.5.20** · API `0.11.1` (sem mudança) · painel `1.12.6` (sem mudança)

## Problema

Técnico abre System → User Manager, preenche o usuário e clica em **Save**. A GUI responde **50x** (`The web server encountered an error processing this request`).

Admin no mesmo formulário salva normalmente.

## Causa

O guard (`systemup_usermanager_guard.inc`) é carregado em POST **depois** do CSRF ter aberto a sessão. Aí `session_is_technician()` chama:

```php
getUserGroups($name, $authcfg, $_SESSION['user_radius_attributes'] ?? null);
```

`getUserGroups()` declara o 3º argumento **por referência**. Passar o resultado de `??` não é variável → PHP 8 Fatal:

```text
getUserGroups(): Argument #3 ($attributes) could not be passed by reference
```

O admin não cai nesse Fatal: `page-all` / uid 0 faz o guard retornar antes da chamada.

## Correção

- 3º argumento passa a ser a variável `$radiusAttributes`.
- Grupo `admins` é resolvido primeiro por `local_user_get_groups()` (sem by-ref).
- POST reserva `admin`/`root` também em `usernamefld` (campo real do formulário).
- `enforce()` captura `Throwable` para o User Manager não voltar a 50x por falha do guard.

## Como validar

1. Publicar **0.5.20** na frota.
2. Login como técnico → User Manager → criar usuário OpenVPN (senha + Save) → lista, sem 50x.
3. Tentar editar/excluir `admin` → página de recusa.

## Teste

`scripts/test-usermanager-guard-getusergroups-ref.sh` — prova o Fatal da expressão e a chamada com variável.

## Risco e rollback

- **Risco:** baixo — só o guard da GUI; agente/heartbeat inalterados.
- **Rollback:** republicar **0.5.19**. O 50x ao Save do técnico volta.

## Arquivos

- `packages/pfsense-package/files/usr/local/pkg/systemup_usermanager_guard.inc`
- `scripts/test-usermanager-guard-getusergroups-ref.sh`
- `scripts/test-usermanager-guard-getusergroups-ref.php`
