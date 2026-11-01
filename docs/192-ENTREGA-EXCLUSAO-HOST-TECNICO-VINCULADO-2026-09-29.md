# Exclusão de host com técnico vinculado — 2026-09-29

## O que aconteceu

O administrador excluiu Compasi Lages, a tela voltou para a lista sem erro, e o host antigo continuou na pesquisa. Um cadastro novo ficou online ao lado do antigo, offline desde 2026-09-01.

## Causa

O host antigo tinha a conta do técnico `erick`. Essa ligação no banco recusava o `DELETE`. A auditoria era gravada antes da falha, e a lista de firewalls ignorava o parâmetro de erro.

## Correção

A exclusão remove o vínculo do técnico e o host na mesma transação. Se ainda falhar, a lista mostra a mensagem. O cadastro offline duplicado de Compasi Lages (`fw-sz35p9hw`) foi removido depois da correção. O Compasi Lages online (`fw-1e40wg0o`, pfSense 2.8.1, pacote 0.5.25) permanece.

Imepar está online com pacote `0.5.25` e pfSense `2.7.0-RELEASE`. Atualizar o sistema operacional do firewall reinicia o equipamento e não foi disparado.

## Versões

API `0.11.9`, painel `1.12.15`, package `0.5.25` (sem mudança).
