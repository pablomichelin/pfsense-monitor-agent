# 207 — Confiabilidade das atualizações

Data:02/11/2026. Implementação autorizada; não autoriza upgrade do firmware. Oito equipamentos excluídos e HA/CARP preservados.

Contrato: package0.5.28; API0.14.1; web1.15.2. Estados explícitos em pfsense_update_details: checking, waiting, current, available, channel_required, error; etapa, código de saída/HTTP, tentativas e próxima consulta. Migração aditiva JSONB; fallback para agentes anteriores. Somente consultas transitórias repetem automaticamente (60/180/600s, limite3); reparo/seleção/instalação nunca repetem por essa política. Após esgotamento volta à cadência normal6h. Operações do agente compartilham lock de kernel; nunca apagar locks nativos. Escrita de cache atômica e diagnóstico sanitizado.

Canais: apenas estáveis, sem RC/beta/preview e sem fallback para maior versão não comprovadamente estável. IPv4 preservado entre refresh e consulta. Download versionado e hash obrigatório; preservação de releases em uso. Antes de lote: manifesto local versus API e bytes baixados, LAB e canário. Validação em blocos dirigidos sem repetição cumulativa.

Estado: desenvolvimento. Resultado e limitações serão atualizados após validação e publicação.
