# Painel e autenticação

Visão objetiva do painel e do fluxo de autenticação, com base no comportamento atual do sistema.

---

## Objetivo do painel

- **Monitor-Pfsense** é o painel operacional do controlador central de monitoramento de firewalls pfSense.
- Permite: visão resumida (dashboard), listagem e filtro de firewalls, detalhe por firewall (métricas, serviços, alertas), **instalação/integração** (comando one-shot e comandos de teste para colar no pfSense), gestão de sessões da conta (“Minha conta”) e, para perfis admin, **cadastro** (cliente, site, firewall) e administração (usuários, tokens, auditoria).
- Objetivo de uso: operação de campo com comandos prontos para copiar no pfSense, sem edição manual complexa; leitura rápida de status e alertas.

---

## Fluxo atual de autenticação

1. **Acesso sem sessão:** ao acessar uma rota protegida, o frontend chama a API (com cookie vazio ou inexistente); a API retorna 401; o frontend redireciona para `/login`.
2. **Login:** o usuário informa email e senha em `/login`; o formulário submete via server action que chama `POST /api/v1/auth/login`. O backend valida credenciais (usuário local no banco ou bootstrap configurado), cria sessão no banco, define cookie HttpOnly e SameSite e retorna sucesso. O frontend redireciona para `/dashboard`.
3. **Navegação autenticada:** todas as requisições à API levam o cookie de sessão. O layout carrega `getOptionalSession()`; se houver sessão, exibe email no header, itens de menu (Dashboard, Firewalls, Alertas, Instalação, Minha conta e, se admin, Cadastro) e botão Sair.
4. **RBAC:** o papel do usuário (`session.user.role`) define se o item “Cadastro” e as rotas `/admin` e `/audit` (conforme papel) estão acessíveis. O backend rejeita requisições não autorizadas com 403.
5. **Logout:** o usuário clica em “Sair”; a server action chama o endpoint de logout; o backend invalida a sessão; o frontend redireciona para `/login`.
6. **Sessões (Minha conta):** em `/sessions` o usuário vê as sessões da própria conta e pode revogar outras sessões (não a atual). Superadmin pode revogar sessões de outros usuários em `/admin`.

---

## Onde está implementado

- **Frontend:** `apps/web/app/login/page.tsx`, `apps/web/lib/auth.ts` (loginAction, logoutAction), `apps/web/app/layout.tsx` (header com nav e Sair), `apps/web/components/app-nav.tsx`.
- **Backend:** `apps/api` — módulo de auth (login, logout, sessão, CSRF, guards por role).
- **Documentação de cadastro e comandos:** `docs/CADASTRO-E-COMANDOS-PFSENSE.md`, `docs/22-diagnostico-cadastro-e-comandos-2026-03-14.md`.
