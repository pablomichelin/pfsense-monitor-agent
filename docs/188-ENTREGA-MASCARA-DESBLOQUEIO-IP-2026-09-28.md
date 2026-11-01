# Máscara de rede no desbloqueio de IP — 2026-09-28

## O que mudou

No inventário `/nodes`, o campo de desbloqueio ganhou um seletor de máscara ao lado do IP. As opções vão de `/32` a `/1`, e `/32` começa selecionado.

- `/32` consulta e remove só o endereço. Continua funcionando no agente `0.5.23`.
- `/1` a `/31` usam o endereço de rede. Ex.: `203.0.113.10` com `/24` consulta `203.0.113.0/24`. Exige agente `0.5.24`.
- Colar `203.0.113.10/24` preenche o endereço e seleciona `/24`.

## Versões

API `0.11.5`, painel `1.12.11`, package `0.5.24`.

O artefato `0.5.24` fica publicado no controlador. A frota que ainda reporta `0.5.23` só desbloqueia host (`/32`) até receber esse package.
