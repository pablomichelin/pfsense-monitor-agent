# Journal de comandos — fonte candidata 0.5.26

Fonte congelada para build/homologação pelo coordenador. Sem build, publicação,
alteração de versão, commit, push ou acesso a appliances nesta frente.

## Contrato alinhado com a API

- Gate pela versão persistida do node: protocolo novo somente `>=0.5.26`.
  O controlador mantém o comportamento legado para `0.5.25`.
- Heartbeat entrega apenas `pending/awaiting_pickup` ou `picked_up/ready`, com
  `delivery_attempt = retryCount`, inteiro >=0. Payload ausente vira `{}`;
  payload explicitamente inválido é recusado.
- ACK/result enviam `delivery_attempt` no nível superior, preservado no journal.
  Respostas devem ecoar ID e tentativa. Tentativa ausente/inválida: 400;
  diferente da persistida: 409 antes de mutação. Responsabilidade da API.
- Backup manual envia `X-Command-Delivery-Attempt`; agendado sem command ID não
  envia esse header. O controlador deve fazer o fence antes de ingest/CAS.
- Somente o vencedor do CAS de `running`, com `execute:true`, `terminal:false`
  e `recovery_required:false`, pode iniciar uma ação. `picked_up` não autoriza.
- `config_backup_now` e `table_search` podem receber nova tentativa estritamente
  maior, em `pending`, após falha local terminal/outbox de falha. Nunca reabrir
  tombstone de escrita sensível, sucesso, cancelamento ou expiração. Uma resposta
  antiga não substitui payload, resultado nem tentativa mais recente.
- Resultados tardios usam exclusivamente as rotas/regras existentes da API;
  não são permissão para repetir uma ação. O finalizador existente de upgrade
  do OS continua responsável pela confirmação manual/versão após reboot.

## Persistência e recuperação

Diretório padrão: `/conf/monitor-pfsense-agent/command-journal`, root:0700;
arquivos root:0600. Chave aleatória local separada, AES-256-GCM, autenticação por
ID e escopo node/controlador. O registro conserva a tentativa monotônica por ID
e só aceita operações do worker que carregam a mesma tentativa. A chave local
protege contra exposição acidental de payload; quem obtém chave e journal pode
decifrá-lo. Não protege contra comprometimento de root.

Escrita: arquivo temporário cifrado, flush/fsync, rename e fsync do diretório.
Criação de diretórios também sincroniza seus pais. Falhas, permissões inseguras,
chave ausente e ciphertext adulterado impedem execução. `flock` serializa drains;
locks do estado não são mantidos durante HTTP/execução. A resposta de heartbeat
passa por FIFO até a gravação cifrada; senha de comando não é escrita em arquivo
temporário, argv ou ambiente. Helpers recebem o payload por pipe/stdin.

| Interrupção | Recuperação |
| --- | --- |
| Antes de gravar payload | Sem ACK; aguardar reentrega pelo controlador |
| Resposta `picked_up` perdida | Repetir ACK do mesmo ID/tentativa, conservando payload cifrado |
| Intenção gravada, pedido `running` não recebido | Repetir o pedido; só executar com nova concessão CAS explícita |
| `running` aceito, resposta perdida | Repetição sem concessão gera resultado indeterminado; não executar |
| SIGKILL/crash após concessão/início da ação | Não repetir; reconciliar com resultado indeterminado se não houver resultado durável |
| Resultado gravado, rede/resposta perdida | Reenviar apenas a outbox com ID/tentativa originais |
| Wrapper vivo | Aguardar; identidade inclui PID e instante de início |
| OS preparado manualmente/reboot pendente | Preservar finalizador existente, sem relançar wrapper |

Ambiguidade envia `status:failed` e
`result_json.execution_recovery_status:"indeterminate"`, inclusive sem retries
configurados e quando o ACK de recuperação já observa estado terminal. A API
permanece autoridade para estados terminais e reconciliação tardia. Isso **não
prova exactly-once**: uma ação pode ter ocorrido antes de sua confirmação.
SIGKILL não executa traps; arquivos de metadados temporários podem restar, mas
o payload sensível desse protocolo permanece cifrado. RAM/swap/core dumps e o
config.xml mantido pelo próprio pfSense não são uma promessa de ausência de
plaintext. Fsync aprovado em teste não certifica corte elétrico/hardware.

Tombstones não têm purge automático nesta entrega. Custos: um pequeno registro
cifrado por command ID, inode correspondente e varredura linear por heartbeat.
Falta de espaço impede novas ações duráveis; o envio de heartbeat continua sendo
tentado. Não apagar tombstones/outbox ou chave para liberar espaço sem reconciliar
com o controlador: isso elimina a memória local de deduplicação. Quota/retention
ficam documentadas como limite, sem nova fila de trabalho nesta rodada.

## Evidência local e integração do build

Novo grupo `scripts/test-agent-journal-recovery.py`: falhas de ACK, CAS ambíguo,
duplicatas, SIGKILL, outbox/restart, permissões/ciphertext, concorrência,
finalizador OS, resultados tardios, stdin, payload ausente e fences de tentativa.
Executado por blocos dirigidos; reexecuções apenas após falha ou mudança no caminho
afetado. Os 16 testes antigos e os 3 de segredo não foram repetidos. O harness
antigo foi ajustado para manter parsing/dispatch/cleanup isolados, pois a entrega
durável agora é coberta pelo grupo novo; sintaxe conferida, sem reexecução.

`command_journal.php` consta em `pkg-plist`, no instalador tarball e na seção
`INSTALL_SCRIPT` do Makefile, junto dos helpers PHP. A versão candidata continua
0.5.26; a distribuição depende do resultado de laboratório registrado pelo coordenador.

## Uma validação na plataforma nova — somente LAB10 autorizado

O coordenador deve conferir os hashes da fonte, gerar/instalar a candidata somente
no LAB10 e executar o novo grupo **uma vez no FreeBSD** se Python 3 já estiver
disponível. Não instalar Python nem repetir Linux por esse motivo:

```sh
python3 scripts/test-agent-journal-recovery.py
```

Sem Python, copiar apenas o teste PHP nativo ao LAB e executar com o helper
instalado. O teste usa diretório privado descartável, subprocessos novos e ação
sintética por pipe. Não usa controlador/rede/configuração pfSense nem executa
ações reais. Limpa sua fixture inclusive em falha normal:

```sh
/usr/local/bin/php /CAMINHO/DO/TESTE/journal-native-freebsd.php \
  /usr/local/libexec/monitor-pfsense-agent/command_journal.php
```

O smoke PHP cobre root-only, fsync/rename no filesystem real, AES-GCM, reinício
de processos/outbox, tombstone, ambiguidade, permissões e corrupção. Não substitui
os casos SIGKILL/concurrency de todo o grupo Python. Não foi executado localmente
nem remotamente nesta frente; seu primeiro resultado será evidência do LAB.

Depois, conforme coordenação: backup remoto com gate da tentativa e conta local
**descartável** via API final publicada; verificar cadastro/efeito, outbox e estado
terminal, remover a conta de teste. Nunca remover journal da instância real para
forçar repetição. Sem credenciais em comandos/logs. LAB10 CE2.9/PHP8.5.7 não prova
HA/CE2.8; CARP sem peer (`carp.allow=0`) não é homologação HA. Oito degradados seguem
excluídos. Resultados de laboratório devem ser registrados pelo operador que os
observou, sem presumir sucesso pela instalação.
