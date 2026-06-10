# Trilha executável — Front-end Fase 6 (Conta separada + polimento PT-BR)

**Data:** 2026-06-09  
**Status:** concluída  
**Plano mestre:** `29-plano-fase6-conta-separada-polimento-ptbr-2026-06-09.md`  
**Entrega anterior:** `docs/84-ENTREGA-FRONTEND-FASE5-BACKUPS-FROTA-MENU-2026-06-09.md`

## Objetivo

Checklist para criar `/conta`, ajustar `/sessions`, menu Conta e polimento PT-BR — **sem** alterar API.

## Versão alvo

- Painel web: `0.6.0` → `0.7.0` (minor)
- API: `0.2.6` (sem alteração)

---

## Pré-voo

- [x] Ler `29-plano-fase6-conta-separada-polimento-ptbr-2026-06-09.md`
- [x] Confirmar ausência de endpoint troca de senha na API
- [x] Ler `apps/web/app/sessions/page.tsx` atual

---

## Bloco A — Página `/conta`

- [x] `app/conta/page.tsx` — PageHero + seções perfil/senha
- [x] Usar `getSession()` + `roleLabel()`

---

## Bloco B — `/sessions` e navegação

- [x] `sessions/page.tsx` — foco sessões, PT-BR
- [x] `route-policy.ts` — Minha conta → `/conta`, Sessões → `/sessions`
- [x] `breadcrumbs.tsx` — crumbs `/conta` e `/sessions`
- [x] `lib/auth.ts` — revalidate `/conta`, mensagens PT-BR

---

## Bloco C — Polimento PT-BR

- [x] `rbac-labels.ts` — Usuários, Configurações
- [x] `node-config-backups-section.tsx` — Ação

---

## Bloco D — Documentação e versão

- [x] Bump `apps/web/package.json` → `0.7.0`
- [x] Índices + histórico
- [x] `docs/85-ENTREGA-...`
- [x] Build + deploy

```bash
cd apps/web && npm run build
cd /opt/Monitor-Pfsense && docker compose up -d --build
```
