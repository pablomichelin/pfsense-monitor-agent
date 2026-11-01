# Aviso quando a exclusão não acontece — 2026-09-29

## O que foi pedido

Se o host tiver um vínculo, como um técnico, a exclusão não pode sumir sem explicação. A tela precisa dizer por que a ação não foi feita.

## Comportamento

O host com técnico vinculado permanece no cadastro. No diálogo de confirmação aparece, por exemplo: "Não excluí Compasi Lages: o técnico Erick (erick) ainda está vinculado a este firewall. Remova esse vínculo antes de excluir o host."

No lote, os hosts sem vínculo são excluídos. Os que têm vínculo ficam, e a lista mostra o mesmo aviso. Outro vínculo interno que impeça a exclusão também gera uma mensagem, em vez de voltar para a lista em silêncio.

## Versões

API `0.11.10`, painel `1.12.16`, package `0.5.25` (sem mudança).
