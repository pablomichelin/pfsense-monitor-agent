# 182 — Técnico pode gerir usuários no pfSense (exceto admin/root)

**Data:** 2026-08-31  
**Versões:** package pfSense **0.5.18** · API `0.11.1` (sem mudança) · painel `1.12.6` (sem mudança)

## Problema

Os técnicos provisionados recebiam o privilégio `page-systemup-technician-admin` **sem** User Manager. Eles precisam criar usuários locais para conexões **OpenVPN** (autenticação pelo User Manager do pfSense) e não conseguiam abrir a tela.

O bloqueio existia para o técnico não alterar a senha do `admin`.

## Solução

- O privilégio passa a incluir `system_usermanager.php` e `system_usermanager_addprivs.php`.
- Group Manager e settings de autenticação (LDAP/RADIUS) continuam bloqueados.
- Guard na GUI: técnico **não** cria, edita, troca senha, privilegia nem exclui `admin` ou `root` (também uid 0 / `scope=system`).
- Conta `admin` de verdade (page-all / grupo admins) não é afetada pelo guard.
- Técnicos **já provisionados** herdam a mudança no upgrade do package — o privilégio é resolvido dinamicamente, sem re-criar o usuário.

## Como validar

1. Publicar **0.5.18** no firewall (upgrade de package no painel; SHA `c50c40b7…`).
2. Login como técnico → **System → User Manager** abre.
3. Criar um usuário de OpenVPN (senha + certificado, se o servidor usar) → ok.
4. Editar/excluir outro usuário comum → ok.
5. Editar ou excluir `admin` / `root` → redireciona para a página de recusa.

## Arquivos

- `packages/pfsense-package/files/usr/local/pkg/priv/systemup_technician.inc`
- `packages/pfsense-package/files/usr/local/pkg/systemup_usermanager_guard.inc`
- `packages/pfsense-package/files/usr/local/www/systemup_usermanager_denied.php`
