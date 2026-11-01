# Exclusão com técnico vinculado pede confirmação — 2026-09-29

## O que foi pedido

Ao excluir o firewall, avisar se existe técnico vinculado e deixar concluir a exclusão se a pessoa permitir.

## Comportamento

A primeira confirmação não apaga o host quando há técnico. O diálogo muda para **Técnico vinculado**, cita quem está ligado e o botão passa a ser **Excluir mesmo assim**.

Essa segunda confirmação remove o host do monitor e o vínculo do técnico neste painel. A conta local no pfSense não é apagada por esta ação.

Sem técnico vinculado, a exclusão segue na primeira confirmação.

## Versões

API `0.11.11`, painel `1.12.17`, package `0.5.25` (sem mudança).
