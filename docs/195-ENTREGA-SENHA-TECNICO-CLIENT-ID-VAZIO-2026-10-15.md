# Troca de senha de técnico com um firewall selecionado — 2026-10-15

## O que foi pedido

Alterar a senha do técnico no firewall Renova, único host marcado no inventário. A tela mostrava `client_id must be a UUID`.

## Causa

O alvo do lote são os firewalls marcados. O `client_id` vinha do filtro de cliente. Com “Todos os clientes”, o formulário enviava string vazia. A API exigia UUID nesse campo opcional e recusava a ação antes de olhar a seleção.

## Comportamento

String vazia em `client_id` passa a ser tratada como ausência do filtro. Provisionar, alterar senha e remover técnico usam só os firewalls selecionados.

## Versões

API `0.11.12`, painel `1.12.18`, package `0.5.25` (sem mudança).
