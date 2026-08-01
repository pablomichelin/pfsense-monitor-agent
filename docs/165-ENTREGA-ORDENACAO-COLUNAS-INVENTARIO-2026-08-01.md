# 165 — Ordenação por colunas no inventário

**Data:** 2026-08-01  
**Versões:** API **`0.10.5`** · painel **`1.10.11`**

## Motivo

Operador pediu clicar nos cabeçalhos do inventário (Status, Firewall, Versão, Pacote, Backup, Alertas) para listar crescente/decrescente, estilo Windows Explorer.

## Entrega

- Cabeçalhos clicáveis com indicador ▲/▼ (e ↕ quando inativo).
- 1º clique na coluna → crescente; 2º → decrescente (preserva filtros da URL).
- API `GET /nodes` aceita `sort_by`: `status` | `name` | `version` | `agent_version` | `backup` | `alerts` | `last_seen`.
- Ordenação final em memória após derivar status efetivo / backup visual / alertas abertos.

## Uso

Em `/nodes`, clique no título da coluna. Filtros avançados também listam as mesmas opções de ordenação.
