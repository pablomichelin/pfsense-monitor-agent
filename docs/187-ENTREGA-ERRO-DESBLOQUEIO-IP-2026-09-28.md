# Erro genérico no desbloqueio de IP — 2026-09-28

## O que aconteceu

Na consulta de desbloqueio da **Inova Energia**, o painel mostrou:

> Falhou — An error occurred in the Server Components render...

O log do container web registrou a causa real, digest `214104960`:

`ip must be a valid IPv4 or IPv6 address`

O Next.js em produção omite a mensagem de uma exceção lançada por Server Action. O painel atribuía esse texto ao firewall.

## Correção

Painel **1.12.10**. API `0.11.4` e package `0.5.23` sem mudança.

- A ação de consulta e de remoção devolve o erro como dado, em português.
- Endereço inválido aparece como aviso do formulário, sem marcar o firewall como falha.
- São aceitos host `/32` e `/128`, IPv6 entre colchetes e IPv4 com porta. Máscara diferente de host continua recusada, com mensagem explícita.

## Como repetir

Em `/nodes`, selecionar o firewall, informar só o endereço (ex.: `203.0.113.10`) e consultar. Se o texto não for um IP, o aviso aparece na hora, sem o erro genérico do Next.js.
