# Plano 161 — UX: despoluição do painel (operador/técnico)

**Data:** 2026-08-01  
**Status:** **aprovado apenas P0 nesta rodada; P1 e P2 pendentes de aprovação**  
**Escopo desta execução:** gravar/indexar este plano + implementar e entregar somente a Fase P0.  
**Versões de partida:** API `0.10.3` · painel `1.10.7` · package pfSense `0.5.7`  
**Bump esperado no P0:** apenas painel → `1.10.8` (patch). API e package **não** sofrem bump.  
**Trilha encerrada (não reabrir):** roadmap UX Fases 0–8 (`docs/88-ENCERRAMENTO-ROADMAP-UX-FASE0-FASE8-2026-06-09.md`).

---

## 1. Objetivo

Reduzir a carga cognitiva do inventário (`/nodes`) para operador e técnico: varredura legível em ~10s, sem scroll horizontal em monitor de 1440px, filtros sob demanda e ações em lote só com contexto de seleção — sem regredir contratos de URL, Server Actions nem entregas operacionais (backup por filtro, coluna Versão pfSense, Acesso remoto).

## 2. Problema

Em viewport de 1440px, o shell deixa ~1152px de conteúdo (`--sidebar-width: 15rem`, `--app-gutter: 1.5rem`, `.app-page` em largura total). A tabela de inventário soma ~90rem (~1440px) só nos `min-w` das colunas → scroll horizontal garantido. Filtros e painéis de lote competem com a tabela mesmo sem seleção, elevando o ruído visual.

## 3. Princípios

1. **Operação primeiro** — status, identidade, contato, backup e acesso ficam no caminho crítico.
2. **Densidade sem perda de função** — menos colunas dedicadas; sinais secundários viram inline condicionais.
3. **Contratos estáveis** — query params e Server Actions inalterados.
4. **Não regredir campo** — backup por filtro, Versão pfSense (`sort_by=version`) e Acesso (doc 104) permanecem.
5. **Trilha nova** — não reabre o roadmap UX 0–8; P1/P2 exigem nova aprovação.

## 4. Correções de escopo (congeladas nesta aprovação)

| Item | Decisão |
|------|---------|
| Coluna **Versão pfSense** | **Manter** — o formulário oferece `sort_by=version`; remover deixaria a ordenação órfã. |
| Coluna **Acesso** | **Manter** (compactada a botão-ícone) — entrega doc 104, usada em campo. |
| **Tags** na tabela | Remover coluna; filtro por tag no formulário permanece; tags seguem em `/admin/grupos` e detalhe do node. |
| **Criticidade** | Sem coluna; badge inline ao lado do nome **somente quando `critical`**. |
| **Instalação** | Sem coluna; `InstallationBadge` inline abaixo do nome **somente quando o agente não está ativo**; link “Abrir” sai (nome já é link). |
| Backup em lote sem seleção | **Preservar** `mode='filter'` com entrada explícita (“Usar filtro atual (N firewalls)”). |
| Perfil `client` | Continua sem coluna de alertas (`showAlertsColumn`). |
| Fora do P0 | Hero-tax, logout duplicado, ícones/breadcrumbs, semântica do ciano, overview do node, menu admin, bootstrap, elevação, Stitch → P1/P2. |

## 5. Fases

### P0 — Inventário legível (esta rodada — aprovada)

| Subfase | Entrega |
|---------|---------|
| P0.1 | Colunas: manter Status, Firewall, Local, Versão pfSense, Pacote, Último contato, Backup, Alertas (se permitido), Acesso; remover Criticidade/Tags/Instalação como colunas; inline critical + instalação condicional; Acesso ícone ~2.5rem. Alvo: soma `min-w`/`w-` do `<thead>` **≤ 72rem**. |
| P0.2 | Densidade: células `px-3 py-2.5`; nome `text-sm font-medium text-white`; hostname em `title` ou `text-xs` truncado (altura de linha ≤ 56px); Backup estreito. |
| P0.3 | Filtros em `<details>` nativo; `open` só com filtro na URL; summary com contagem/chips; query params intactos. |
| P0.4 | Sem seleção: sem painéis de lote abertos; com seleção: barra sticky + ações ≤1 clique; backup por filtro explícito; Server Actions e props dos painéis inalterados. |
| P0.5 | Migrar tabela para primitivo `DataTable` (`toolbar` = barra de seleção). |

### P1 — Chrome e hierarquia (pendente de aprovação)

Hero-tax/duplicação de chrome, logout duplicado, ícones e breadcrumbs faltantes, semântica do ciano, overview do node.

### P2 — Admin e polish (pendente de aprovação)

Menu admin, bootstrap, elevação, alinhamento Stitch residual — sem reabrir trilha 88.

## 6. Guardrails de código

- Não tocar no `ConfirmDialog` via portal (hotfix doc 106).
- Não remover `key={pathname}` do `<main>` em `app-shell-layout.tsx`.
- `StatusBadge` continua fonte dos rótulos PT de status.
- Não alterar tokens em `globals.css` / `tailwind.config.ts`.
- Nenhuma mudança em `apps/api`, `packages/`, RBAC, middleware, `route-policy.ts`.
- Flags `canRequestBackupBatch`, `canRunPackageUpgrade`, `canManageTechnicians`, `canResetTechnicianPassword` seguem controlando o que aparece.

## 7. Critérios de aceite do P0

- [ ] Soma dos `min-w` das colunas do inventário ≤ 72rem (medido e registrado).
- [ ] Sem seleção: nenhum painel de lote aberto competindo com a tabela.
- [ ] Com seleção: ações de lote em ≤1 clique, sem rolar duas viewports.
- [ ] Backup “por filtro atual” continua acessível e funcional.
- [ ] Filtros colapsados por padrão; abertos automaticamente quando há filtro na URL.
- [ ] Query params e Server Actions inalterados.
- [ ] Build web OK + `docker compose up -d --build` OK + serviços saudáveis.
- [ ] Perfil `client` continua sem coluna de alertas.

## 8. Documentação e versionamento

### 8.1 — Este plano

Gravar este arquivo e indexar em `docs/00-INDICE-OPERACIONAL.md`, `LEITURA-INICIAL.md` e `00_inicio.md` **sem bump de versão** nesta etapa de plano.

### 8.2 — Após entrega P0

1. Bump apenas `apps/web/package.json` → `1.10.8`.
2. Criar `docs/162-ENTREGA-UX-DESPOLUICAO-P0-INVENTARIO-2026-08-01.md`.
3. Atualizar `LEITURA-INICIAL.md`, `00_inicio.md`, `docs/00-INDICE-OPERACIONAL.md`, `docs/HISTORICO-E-LINHA-DO-TEMPO.md`.
4. Atualizar `docs/SISTEMA-VISUAL-PAINEL.md` (shell real + densidade + colunas canônicas do inventário).
5. Atualizar rodapé “Versões atuais” de `.cursor/rules/versioning.mdc` → painel `1.10.8`.
6. Commit UX separado do commit de higiene 159/160; `git push origin main` + `git pull origin main`.

## 9. Arquivos previstos (P0)

| Arquivo | Mudança |
|---------|---------|
| `apps/web/components/nodes/nodes-inventory-table.tsx` | Colunas, densidade, DataTable, Acesso ícone |
| `apps/web/components/nodes/fleet-inventory-section.tsx` | Lote sob demanda + sticky + backup por filtro |
| `apps/web/app/nodes/page.tsx` | Filtros em `<details>` |
| Docs/índices listados em §8 | Plano + entrega + versões |

## 10. Referências

- `docs/SISTEMA-VISUAL-PAINEL.md`
- `docs/104-ENTREGA-LINK-ACESSO-REMOTO-FIREWALL-2026-06-24.md`
- `docs/106-HOTFIX-ADMIN-NAV-MODAL-PORTAL-2026-06-24.md`
- `docs/108-AUDITORIA-VISUAL-STITCH-2026-06-24.md`
- `docs/109-MELHORIAS-VISUAIS-POS-AUDITORIA-108-2026-06-24.md`
- `docs/88-ENCERRAMENTO-ROADMAP-UX-FASE0-FASE8-2026-06-09.md`
