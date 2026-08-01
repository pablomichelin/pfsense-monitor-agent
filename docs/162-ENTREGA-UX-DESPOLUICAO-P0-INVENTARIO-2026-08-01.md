# Entrega 162 — UX despoluição P0 (inventário `/nodes`)

**Data:** 2026-08-01  
**Plano:** `docs/161-PLANO-UX-DESPOLUICAO-PAINEL-OPERADOR-2026-08-01.md`  
**Versão painel:** `1.10.8` (patch)  
**API / package:** sem bump (`0.10.3` / `0.5.7`)  
**Status:** P0 entregue. P1 e P2 **não** implementados (pendentes de aprovação).

---

## Objetivo

Reduzir carga cognitiva do inventário para operador/técnico: varredura ~10s, sem scroll horizontal em 1440px, filtros sob demanda e ações em lote só com contexto.

## O que mudou por arquivo

| Arquivo | Mudança |
|---------|---------|
| `apps/web/components/nodes/nodes-inventory-table.tsx` | Colunas enxutas; densidade `px-3 py-2.5`; nome `text-sm`; criticidade/instalação inline condicionais; Acesso ícone; migração para `DataTable` |
| `apps/web/components/nodes/fleet-inventory-section.tsx` | Sem painéis de lote abertos sem seleção; sticky com seleção; backup por filtro via “Usar filtro atual (N)” |
| `apps/web/app/nodes/page.tsx` | `PageSection "Filtros"` → `<details>` com summary/chips; `open` quando há filtro na URL |
| `apps/web/package.json` | `1.10.7` → `1.10.8` |
| Docs/índices | Plano 161, esta entrega, `SISTEMA-VISUAL-PAINEL.md`, histórico, versioning |

## Colunas removidas (e por quê)

| Coluna | Destino |
|--------|---------|
| **Criticidade** | Badge inline ao lado do nome **somente se `critical`** |
| **Tags** | Fora da tabela (filtro por tag permanece; tags em `/admin/grupos` e detalhe) |
| **Instalação** | `InstallationBadge` abaixo do nome **somente se agente não ativo**; link “Abrir” removido (nome já é link) |

**Mantidas de propósito:** Status, Firewall, Local, Versão pfSense (`sort_by=version`), Pacote, Último contato, Backup, Alertas (não-client), Acesso (doc 104, compactado).

## Largura medida (soma `min-w` / `w-` do `<thead>`)

| Cenário | Soma |
|---------|------|
| **Antes** (todas as colunas dedicadas + checkbox) | **~90rem** |
| **Depois** (checkbox + alertas) | **61rem** |
| Alvo P0 | ≤ 72rem |

Detalhe depois (rem): checkbox 2.5 + Status 7 + Firewall 12 + Local 8 + Versão 6.5 + Pacote 6.5 + Último 5.5 + Backup 6 + Alertas 4 + Acesso 3 = **61**.

## Decisão: hostname

Hostname passou para o atributo `title` do link do nome (não renderiza segunda linha). Motivo: manter altura de linha ≤ 56px com `py-2.5` + `text-sm`; hostname continua acessível no hover.

## Backup por filtro preservado

Sem seleção: nenhum painel de lote aberto. Botão secundário **“Usar filtro atual (N firewalls)”** revela `FleetBatchBackupPanel` com `mode='filter'`, `nodeIds` = todos os visíveis, `totalVisibleCount`, `clientId` e `label` no formato anterior.

Com seleção: painel de backup em `mode='selection'`; o mesmo botão de filtro permanece disponível na barra sticky (toggle), sem alterar Server Actions nem contratos dos painéis.

## Checklist de aceite P0

- [x] Soma `min-w` ≤ 72rem (61rem medido)
- [x] Sem seleção: nenhum painel de lote aberto
- [x] Com seleção: ações em ≤1 clique (barra sticky acima da tabela)
- [x] Backup por filtro acessível (“Usar filtro atual”)
- [x] Filtros colapsados por padrão; abertos com filtro na URL
- [x] Query params e Server Actions inalterados
- [x] Build web + `docker compose up -d --build` + serviços saudáveis
- [x] Smoke HTTP 200 em `/healthz` e `/login` via `http://192.168.100.221:3031` (e via nginx no compose). Nota: `127.0.0.1:8088` no host fica bloqueado por regra iptables pré-existente (ACCEPT só LAN; DROP genérico em `:8088`) — não introduzido por esta entrega.
- [x] Perfil `client` sem coluna de alertas (`showAlertsColumn`)
- [ ] E2E visual opcional: Playwright sem browser instalado neste ambiente (`npx playwright install` pendente) — não bloqueante

## Fora de escopo (P1/P2)

Hero-tax/duplicação de chrome, logout duplicado, ícones e breadcrumbs faltantes, semântica do ciano, overview do node, menu admin, bootstrap, elevação, Stitch.
