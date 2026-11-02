# Recuperação remota em lote — 02/11/2026

## Resultado comprovado

26 agentes em0.5.29, todos com backup remoto posterior succeeded;32 em0.5.27 ainda pendentes no lote0a8ecbec-74f4-46fe-a38d-cdf8a8c5f51e; oito excluídos em0.5.26 intocados. No lote56 são24 upgrades succeeded e32 pending, mais LAB/canário fora desse lote.

Após a recuperação local previamente registrada, a operação adicional recuperou13 agentes: seis por SSH e sete pelo painel automatizado. Credenciais consultadas na documentação autorizada, sem reprodução neste relatório ou repositório. No caminho por servidor intermediário, identidade do firewall foi validada antes da ação; o servidor intermediário não teve serviço reiniciado. Os acessos não foram habilitados nem ampliados.

Reiniciado somente monitor_pfsense_agent, inclusive após a transição do processo antigo quando necessário. Os13 backups novos iniciais (Plus local, cinco SSH e sete painéis) passaram; o sexto SSH foi validado separadamente por5100b08c-5020-4236-8a46-57e4413e96cf succeeded. As evidências dos12 agentes anteriores não foram repetidas. Sem novos builds, migrations ou suíte cumulativa.

## Limite ainda aberto

A recuperação em lote é viável com acesso administrativo existente. Não é uma capacidade universal já entregue pelo produto. Os32 restantes têm limitações de conectividade, autenticação, credencial não localizada ou ambígua na fonte consultada e avisos de certificado no navegador. Não atribuir trava comprovada a todos sem inspeção. Avisos de segurança não foram contornados; credenciais não foram alteradas. Comandos mantêm expiração normal, sem duplicatas ou ressurreição.

Enviar reboot pela mesma fila travada não resolve o bloqueio e pode causar reinício tardio. Nenhum reboot foi enfileirado ou executado, mesmo havendo autorização do usuário. Não houve alteração de firmware, canais, rede, VPN, DNS, HA/CARP, Zabbix ou Theo.

## Solução permanente proposta — ainda não implementada

Adicionar supervisor local independente do daemon/fila. Ele deve respeitar agente habilitado, identidade e processo esperado; detectar travamento persistente com evidência, aguardar ausência de instalador ativo, reiniciar somente o serviço e registrar motivo/resultado. Exigir exclusão mútua, limite de tentativas e intervalo mínimo entre reinícios; não reagir a simples indisponibilidade do controlador com loop de restart. Não remover arquivo de lock como tentativa de liberar flock.

Uma ação remota de recuperação precisa ser recebida por caminho independente, autenticada por identidade própria do equipamento, restrita ao serviço permitido, com validade curta e execução única auditada. Não criar shell arbitrário, token compartilhado ou abertura inbound geral. Supervisor local e comando remoto são capacidades distintas; não alegar que uma implica a outra.

Validar em um grupo dirigido: daemon morto, journal bloqueado, instalador ativo, agente desabilitado, controlador indisponível, repetição/expiração e limite de reinícios; depois LAB e canário. Só então publicar nova versão imutável e distribuir no escopo autorizado. Essa versão protege instalações que a recebem, mas não consegue sozinha alcançar um agente antigo cujo único canal já está bloqueado. Para esses, concluir acesso administrativo em lote ou recuperação externa existente.

## Higiene

Arquivos temporários de credenciais e scripts desta recuperação são descartáveis e devem ser removidos antes do encerramento. Não guardar senhas em memória operacional ou Git. Artefatos imutáveis e backups operacionais existentes permanecem necessários.
