# PROJECT STATUS — Monitor pfSense (pfs-monitor)

Última atualização: **2026-11-01**

API `0.13.0` e painel `1.14.0` publicados. Recuperação durável, paginação acima de 1.000 e LAB 0.5.26 validados; 58 agentes atualizados, oito preservados. Fechamento operacional em `docs/198-FECHAMENTO-ESTABILIZACAO-E-RECUPERACAO-2026-11-01.md`. Oito degradados excluídos; HA/CARP retirado do escopo pelo usuário.

O snapshot abaixo é histórico de setembro; não representa a frota nesta rodada. Não houve intervenção nos oito degradados.

> **Fonte de verdade das versões e entregas:** `LEITURA-INICIAL.md`.

## Snapshot

| Campo | Valor |
|---|---|
| API em produção | `0.11.11` — exclusão com técnico pede confirmação |
| Painel web em produção | `1.12.17` — botão Excluir mesmo assim |
| Package publicado | `0.5.25` — listar bloqueios |
| Frota observada | 58 agentes `0.5.23`; 1 agente `0.5.20` offline desde 2026-09-01 |
| Desbloqueio em lote | Consulta real de IP em tabela confirmada; remoção efetiva ainda não ensaiada |
| Próximo passo | Administrador entra de novo e usa Cadastro e Excluir hosts |

Detalhes e limites: `docs/186-REVISAO-DESBLOQUEIO-TABELAS-PF-2026-09-19.md`.
