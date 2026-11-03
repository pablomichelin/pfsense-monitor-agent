# Aviso indevido de crash PHP: logging do supervisor

## Problema

Falhas de transporte já tratadas pelo supervisor eram enviadas a `error_log()`. Na configuração nativa do pfSense, isso alimenta o relatório de erro PHP mesmo quando o processo segue funcionando. Uma recusa HTTP 401 deve continuar visível como falha operacional; ela não prova encerramento do processo nem autoriza relaxar autenticação.

## Correção

Package **0.5.32**, fonte `26173c3`: `watchdog_log()` envia as exceções tratadas de recovery/supervisor para syslog, facility DAEMON e severidade WARNING. Erros PHP reais continuam registrados normalmente. Não muda HMAC, RBAC, allowlist, política de restart, orçamento de tentativas, controlador ou painel. A versão anterior não foi reconstruída.

## Validação

- Sintaxe PHP aprovada.
- PHP nativo: 36 casos dirigidos aprovados, sendo 10 de logging, 16 de política e 10 de protocolo com transportes sintéticos.
- O teste de protocolo exige execução root; sua recusa inicial no Mac sem root foi confirmada como proteção esperada e o grupo passou no ambiente nativo adequado.
- Teste de integração confirmou aviso no syslog e ausência de escrita indevida no log de erro PHP.
- Artefato publicado baixado e conferido contra o hash do candidato validado.
- Configuração funcional preservada, processos do agente/supervisor ativos e contato com o controlador confirmado. Janela curta de observação, sem alegação de ausência universal de crashes.

## Operação e rollback

Instalação validada no ambiente autorizado, com lease nativo e backup privado. Histórico de erro foi preservado antes de reabrir o log ativo. Detalhes de equipamento, inventário, caminhos de backup e hashes operacionais ficam na documentação privada.

O operador decidiu manter a instalação somente no equipamento já validado. Nenhuma distribuição adicional foi executada. Qualquer expansão de escopo exige nova decisão do operador.

Rollback usa o backup operacional privado do componente e reinicia somente agente/supervisor. A versão anterior reintroduz o roteamento incorreto dos avisos tratados; não restaurar configurações globais do firewall sobre mudanças concorrentes. Publicações futuras continuam exigindo versão nova.
