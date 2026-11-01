# Administrador cria cliente, firewall e exclui host — 2026-09-28

## O que foi pedido

O usuário com perfil Administrador precisa criar clientes, criar firewalls e excluir hosts.

## Comportamento

O perfil já tinha essas permissões na matriz. A API recusava a criação de cliente para qualquer administrador com escopo por cliente.

Agora, quem tem a permissão de cadastro (`inventory.global`) cria o cliente. O cliente novo entra no escopo de quem criou e de quem já enxergava todos os clientes ativos. Em seguida o administrador cria o firewall em Cadastro, no cliente que acabou de entrar no escopo.

Excluir host continua no detalhe do firewall e também aparece no inventário ao selecionar firewalls: **Excluir hosts**.

Um administrador restrito a poucos clientes continua sem ver os demais. Ele cria cliente e firewall só no que passa a ser o escopo dele, e não exclui host de outro cliente.

## Versões

API `0.11.8`, painel `1.12.14`, package `0.5.25` (sem mudança).
