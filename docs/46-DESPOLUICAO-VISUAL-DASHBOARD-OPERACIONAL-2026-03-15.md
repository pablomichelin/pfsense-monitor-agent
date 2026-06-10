# Despoluição Visual do Dashboard Operacional

**Data:** 2026-03-15  
**Status:** Implementado e documentado  
**Versões:** Painel 0.1.7, API 0.1.2, Package 0.2.0 (inalterado)

---

## 1. Resumo executivo

Trilha de refinamento visual da **lista operacional** do dashboard: remoção das colunas Host e Site da grade principal, mantendo-as disponíveis no detalhe do servidor. Tabela mais enxuta e focada em leitura operacional.

---

## 2. Decisão funcional

- **Removidas da grade principal:** Host/Nome, Site.
- **Justificativa:** O nome do cliente já identifica o item no uso diário; Host e Site acrescentavam ruído visual. A tela inicial prioriza leitura operacional.
- **Onde continuam disponíveis:** Detalhe do servidor (`/nodes/[id]`), inventário (`/nodes`), API. Nenhum dado foi removido do sistema.

---

## 3. Composição final da tabela

| # | Coluna    | Conteúdo |
|---|-----------|----------|
| 1 | Cliente   | Nome do cliente |
| 2 | Status    | Dot + effective_status |
| 3 | pfSense   | Versão ou "—" |
| 4 | CPU       | formatPercent ou "—" |
| 5 | Mem       | formatPercent ou "—" |
| 6 | Disco     | formatPercent ou "—" |
| 7 | Uptime    | formatUptime ou "—" |
| 8 | Ultimo HB | formatRelativeAge |
| 9 | Alert.    | Número (0 ou >0, compacto) |
|10 | M.        | "M" em maintenance, "—" caso contrário |
|11 | Acao      | Link "Abrir" para detalhe |

- **Alertas:** coluna compacta "Alert." com apenas o número.
- **Maintenance:** coluna compacta "M." com "M" ou "—" e title="Maintenance" no "M".

---

## 4. Colunas removidas da grade principal

- **Host** (display_name / hostname) — removida da tabela; permanece no detalhe e no inventário.
- **Site** — removida da tabela; permanece no detalhe e no inventário.

---

## 5. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `apps/web/app/dashboard/page.tsx` | Remoção das colunas Host e Site; headers "Alertas"→"Alert.", "Maint."→"M."; larguras w-14/w-12 nas colunas compactas; M. com "M"/"—" e title |
| `apps/web/package.json` | 0.1.6 → 0.1.7 |
| `apps/web/app/layout.tsx` | Footer v0.1.7 |

---

## 6. Validação

- Dashboard carrega com summary, cards, zona quente, matriz e tabela.
- Tabela exibe 11 colunas (Cliente, Status, pfSense, CPU, Mem, Disco, Uptime, Ultimo HB, Alert., M., Acao).
- Host e Site não aparecem na grade; continuam no detalhe ao clicar "Abrir".
- Build web concluído com sucesso.

---

## 7. Referências

- `docs/45-DASHBOARD-OPERACIONAL-LISTA-SERVIDORES-2026-03-15.md`
- `00_inicio.md`
