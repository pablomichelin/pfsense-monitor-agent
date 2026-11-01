# Listar bloqueios — 2026-09-28

## O que foi pedido

Ao selecionar firewalls e clicar, ver a lista do que está bloqueado em Diagnostics > Tables, sem a tabela de liberação `ips_liberados`.

## Comportamento

Botão **Listar bloqueios** no inventário. O agente lê com `pfctl -t TABELA -T show` só estas tabelas, quando existem e têm entradas:

- `webConfiguratorlockout` (senha errada na interface)
- `sshlockout` (senha errada no SSH)
- `virusprot`
- `snort2c` (no máximo 80 endereços)

Clicar num endereço coloca o valor no campo para a consulta e o desbloqueio.

## Versões

API `0.11.7`, painel `1.12.13`, package `0.5.25`.

O botão só habilita com agente `0.5.25` ou superior. A frota que ainda está em `0.5.23` precisa do upgrade do package antes de listar.
