# Desbloqueio ignora ips_liberados — 2026-09-28

## Problema

A consulta em Diagnostics > Tables (`pfctl -sT` / `pfctl -T test`) encontrava o IP em `ips_liberados`. Essa tabela é a lista de liberação dos IPs da operação, não o bloqueio. Removê-la tiraria a permissão.

O bloqueio por senha errada fica em tabelas de lockout do filtro, em geral `webConfiguratorlockout` (GUI) e `sshlockout` (SSH).

## Correção

API `0.11.6`, painel `1.12.12`. Package `0.5.24` sem mudança; vale para os agentes `0.5.23` já instalados.

- O painel esconde `ips_liberados` do resultado e mostra "Nenhum bloqueio encontrado" quando só ela casava.
- A API recusa remoção nessa tabela.
- As demais tabelas do filtro em que o IP estiver continuam disponíveis para desbloqueio.
