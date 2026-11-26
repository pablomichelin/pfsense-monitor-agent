# PROJECT STATUS — Monitor pfSense (pfs-monitor)

Última atualização em **26/11/2026**.

## Controlador candidato

| Componente | Em execução, observado em 26/11 | Candidato em QA |
|---|---|---|
| API | 0.14.3 | 0.14.4 |
| Painel | 1.16.1 | 1.16.2 |
| Package | 0.5.35 publicado | 0.5.39 em ramo separado, com validação nativa pendente |

Imagens do controlador de QA compiladas da revisão `960709a5f6d598fc869b408cb024bd3a3d650b9b`. Provas em PostgreSQL 17, HTTPS e Chromium com dados sintéticos. Foram validados separadamente heartbeat assinado, tempo real, sessões, auditoria, cadastros concorrentes, seletor de Grupos e Tags, isolamento de cliente e alertas. O candidato mantém as 44 migrations existentes.

A migração aditiva de contagens por métrica integra somente o ensaio `b4d73da`. Recuperação do histórico e de retentativas de notificação após reinício continuam abertas. A preparação do controlador e do package não equivale à ativação em produção.

## Histórico de 02/11/2026

API **`0.13.1`**, painel **`1.14.1`** e package **`0.5.26`** publicados. Revisão 199: 15 achados corrigidos; C01/C02 comprovados e corrigidos; duas migrations e limpeza A06 aplicadas; stack saudável. Evidências em `docs/200-CORRECOES-RELATORIO-199-2026-11-02.md`. Recuperação durável e paginação acima de 1.000 continuam aprovadas; último registro de frota confirmado: 58 agentes atualizados, oito preservados. Oito degradados excluídos e HA/CARP retirado do escopo. **Recuperação integral da API 0.13.1 aprovada no 220**: backup de dados restaurado, checksum/GPG/TAR das imagens aprovados, quatro imagens importadas e boot isolado PostgreSQL/API/web/nginx aprovado, com limpeza comprovada. Custódia offsite geográfica permanece melhoria operacional.

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
