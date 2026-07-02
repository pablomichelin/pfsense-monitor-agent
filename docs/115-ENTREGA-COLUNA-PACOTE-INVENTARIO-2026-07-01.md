# 115 — Entrega coluna Pacote no inventário

**Data:** 2026-07-01  
**Versão painel:** `1.4.5`  
**API:** sem alteração (`0.6.4`)  
**Package pfSense:** sem alteração (`0.4.7`)

---

## 1. Resumo

Coluna **Pacote** dedicada na tabela de inventário (`/nodes`), exibindo a versão instalada do package pfSense por firewall. A coluna **Versão pfSense** mostra somente a versão do pfSense OS — sem linha secundária de agente.

Cabeçalhos renomeados para deixar a separação explícita (`Versão pfSense` | `Pacote`). Detalhe do firewall alinhado com os mesmos rótulos.

Destaque visual quando a versão reportada difere da release configurada no controlador (`config/package-release.env`).

---

## 2. Origem dos dados

| Campo no painel | Campo na API / banco | Origem no pfSense |
|-----------------|----------------------|-------------------|
| Pacote | `agent_version` | Heartbeat → `AGENT_VERSION` em `/usr/local/etc/monitor-pfsense-agent.conf`, sincronizado com `SYSTEMUP_MONITOR_AGENT_VERSION` no package |

Nenhuma alteração de contrato API ou agente foi necessária — o dado já era coletado e persistido no snapshot do node.

---

## 3. Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `apps/web/components/nodes/nodes-inventory-table.tsx` | Colunas **Versão pfSense** e **Pacote** separadas |
| `apps/web/components/nodes-table-with-delete.tsx` | Mesma separação (consistência) |
| `apps/web/app/nodes/[id]/page.tsx` | Hero com rótulos **Versão pfSense** / **Pacote** |
| `apps/web/components/nodes/package-version-cell.tsx` | Célula com destaque outdated/atual |
| `apps/web/lib/agent-version.ts` | `resolvePackageVersionState()` |
| `apps/web/lib/api.ts` | `getPackageRelease()` |
| `apps/web/app/nodes/page.tsx` | Busca release alvo; repassa à tabela |
| `apps/web/package.json` | `1.4.5` |

---

## 4. Como validar

1. Acessar `/nodes` autenticado.
2. Confirmar colunas: Status, Firewall, Local, **Versão pfSense**, **Pacote**, Último contato, …
3. Coluna **Versão pfSense** exibe só o OS (ex. `2.7.2`); **Pacote** exibe só `agent_version` (ex. `0.4.7`).
4. Versões abaixo da release alvo aparecem em âmbar com legenda `atual: X.Y.Z`.
5. Ordenação **pacote** continua usando `sort_by=agent_version`.

---

## 5. Deploy

Somente rebuild do painel web:

```bash
cd /Dados/Monitor-Pfsense
docker compose up -d --build web
```

Não exige rollout de package nos firewalls.
