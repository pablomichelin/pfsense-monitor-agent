# Aviso de crash PHP: logging do supervisor

## Causa e escopo

O pedido partiu do relatório do pfSense 192.168.100.254. Erros fatais Layer7 de 28/10 já estão corrigidos na versão instalada 1.9.161. A única entrada posterior no log de erros PHP era `systemup-agent-recovery: recovery transport unavailable (HTTP 401)`, em 02/11 às 16:23:10 BRT. O supervisor tratava a exceção, mas chamava `error_log()`: o PHP do pfSense destina essa mensagem a `/tmp/PHP_errors.log`, exibido pelo Crash Reporter. Uptime de 71 dias, `/var/crash` vazio, supervisor saudável e agente ativo não indicam kernel panic. A recusa 401 registrada é histórica; não foi atribuída a segredo incorreto nem foi relaxada autenticação.

## Implementação e risco

`watchdog_log()` registra falhas tratadas de recovery/supervisor no syslog, facility DAEMON e severidade WARNING. Não desabilita logs PHP reais, não altera autenticação, allowlist, retries, orçamento de restart nem resposta a comandos. Risco baixo: roteamento do aviso muda; a operação continua visível no log de sistema. PORTVERSION e constante do agente passam para 0.5.32, sem reusar 0.5.31.

## Validação

- PHP local: sintaxe, 10 casos novos de logging e 16 de política PASS. O teste de protocolo exige arquivos root: tentativa no Mac recusou o owner não-root; não é falha funcional nova.
- PHP 8.5.2 nativo do `.254`, em diretório temporário isolado: sintaxe e **36 casos PASS** (10 logging, 16 política, 10 protocolo com transportes sintéticos). Nenhum desses testes reinicia serviços ou envia comandos ao controlador.
- Biblioteca CSRF real do Layer7 instalado: 39 expressões avaliadas, token válido aceito e forjado rejeitado. Nenhum token armazenado.
- Artefato 0.5.32 SHA256 `37189b7089951d859c89990cb28d6916b73131748f96821453dde906190bc5d0`; XMLs parseados e versão substituída no stage. Gerado com Python/tar pelo mesmo conteúdo do recipe, pois `sed -i` do helper de build requer GNU sed no Mac. Fonte do build não foi alterada.

## Estado e rollback

Implementado e validado; pendente de commit/publicação/instalação. A frota não foi consultada nem alterada; oito excluídos e demais equipamentos preservados. API/painel, banco, Zabbix e Theo não precisam de deploy.

Para instalação no `.254`: manter lease nativo de update, backup privado de runtime/configuração/log PHP, preservar modo de heartbeat e backup; instalar pelo bootstrap do artefato e reiniciar somente os processos do Monitor. Conferir versão, logs, heartbeat e invariância da configuração Layer7. Histórico de crash só pode sair do log ativo após arquivo privado verificável; não apagar dados de `/var/crash` nem ocultar erros novos.

Rollback: restaurar runtime e configuração do Monitor do backup privado e reiniciar apenas agente/supervisor. A versão 0.5.31 volta a registrar avisos tratados como erro PHP; não usar rollback de Layer7 para 1.9.159, que reintroduz o fatal CSRF. Publicações futuras continuam exigindo versão nova.
