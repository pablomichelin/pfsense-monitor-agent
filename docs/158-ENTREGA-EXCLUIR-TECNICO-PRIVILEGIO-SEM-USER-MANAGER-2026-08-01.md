# 158 — Excluir técnico + privilégio sem User Manager

**Data:** 2026-08-01  
**Versões:** package **`0.5.6`** · painel **`1.10.6`** · API `0.10.1` (sem mudança de contrato)

## 1) Exclusão real como fluxo principal

Pedido do operador: “revogar” (desativar) não é prático — precisa **excluir** o usuário do pfSense.

- Aba renomeada para **Excluir** (antes “Revogar”).
- Padrão do modo: **Excluir usuário do firewall** (`delete`); desativar fica como opção secundária.
- Textos e confirmações deixam claro que a exclusão remove a conta do pfSense.

O backend já tinha `local_user_delete` / `action: delete` — a mudança é de UX e prioridade operacional.

## 2) Técnico não altera senha do admin

Pedido: técnicos podem fazer quase tudo, mas **não** alterar a senha do `admin`; só a própria.

- Package passa a instalar privilégio customizado `page-systemup-technician-admin` em `/usr/local/pkg/priv/systemup_technician.inc`.
- No `local_user_create` com `privilege_profile=admin_full`, o agente atribui esse privilégio (não mais `page-all`).
- O privilégio lista dinamicamente as páginas de `/usr/local/www`, **exceto** User Manager e Group Manager; mantém `system_usermanager_passwordmg.php` (senha própria).

### Contas já criadas com `page-all`

Usuários provisionados antes do 0.5.6 continuam com `page-all` até serem **excluídos e recriados** (ou editados manualmente no pfSense). Novos provisions após upgrade 0.5.6 já nascem com o perfil restrito.

## Artefato

- `monitor-pfsense-package-v0.5.6.tar.gz` em `config/package-release.env`
