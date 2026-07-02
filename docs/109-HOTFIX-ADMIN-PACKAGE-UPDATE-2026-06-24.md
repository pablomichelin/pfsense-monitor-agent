# Hotfix: "Acao restrita a administradores" no botão Atualizar package

**Data:** 2026-06-24  
**Status:** Corrigido (package 0.4.2)  
**Componente:** `packages/pfsense-package/files/usr/local/pkg/systemup_monitor.inc`

---

## Sintoma

Na GUI do pfSense (Services → SystemUp Monitor → Configuracao), ao clicar em **Atualizar package** com nova versão disponível (ex.: 0.4.2), aparece:

> Acao restrita a administradores.

Mesmo com usuário logado como administrador padrão do pfSense (`admin` / grupo `admins` / `page-all`).

## Causa raiz

Introduzido na auditoria de segurança (0.4.0, item A2): `systemup_monitor_current_user_is_admin()` passava o retorno bruto de `getUserEntry()` para `userHasPrivilege()`.

No **pfSense 2.7+**, `getUserEntry()` retorna:

```php
['idx' => ..., 'item' => $userArray]
```

`userHasPrivilege()` / `get_user_privileges()` esperam o array do **usuário** (`$user['priv']`, grupos, etc.). Com o wrapper, `$user['priv']` vinha vazio → toda verificação falhava → redirect `?msg=forbidden`.

## Correção

1. Desempacotar `$userEntry['item']` antes de `userHasPrivilege()` (compatível com pfSense antigo que retornava o usuário direto).
2. Aceitar privilégios das páginas do package (`page-config_systemup_monitor`, etc.).
3. Fallback: `uid === 0` ou membro do grupo `admins`.

## Deploy

Rebuild e publicação do package 0.4.2:

```bash
cd /Dados/Monitor-Pfsense
./scripts/release-pfsense-package.sh
```

Nos firewalls já em versão anterior: clicar **Atualizar package** após publicar a release corrigida, ou:

```bash
php -f /usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php upgrade
```

## Validação

1. Login como `admin` no pfSense.
2. Services → SystemUp Monitor → Configuracao.
3. Com release mais nova publicada, clicar **Atualizar package** → deve redirecionar com `Atualizacao iniciada` (não `forbidden`).
