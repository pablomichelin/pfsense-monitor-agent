# 63. Plano mestre: organizacao, qualidade e backup pfSense

Data: `2026-06-08`

## Objetivo

Definir um rumo claro para organizar o Monitor-Pfsense, melhorar qualidade tecnica e preparar o desenvolvimento do modulo de backup do `config.xml` dos pfSense.

Este documento nao implementa o backup. Ele define o plano completo para iniciar a implementacao com seguranca, rastreabilidade e menor risco operacional.

## Premissas verdadeiras

- O sistema atual ja tem controlador `NestJS`, painel `Next.js`, banco `PostgreSQL` e package pfSense.
- A arquitetura correta continua sendo `push`: o pfSense envia dados ao controlador.
- O controlador nao deve abrir acesso inbound aos firewalls dos clientes.
- O cadastro atual de `Cliente -> Site -> Firewall/Node` deve ser reaproveitado como dono dos backups.
- O backup sera modulo integrado do Monitor-Pfsense, nao um software novo.
- No pfSense, o backup entra como nova aba `Backup` dentro de `Services > SystemUp Monitor`.
- O package atual em `packages/pfsense-package` e o caminho principal para evoluir o agente.
- `packages/pfsense-agent` deve ser tratado como legado da fase inicial, salvo quando uma tarefa disser o contrario.
- O backup atual por email deve ser aposentado, nao evoluido.
- O `config.xml` do pfSense e dado altamente sensivel.
- O modulo de backup nao deve salvar XML bruto em tabela do banco.
- Download/restore de backup deve ser auditado.
- Restore automatico no pfSense nao entra no primeiro MVP do backup.
- O botao "Solicitar backup agora" no painel deve criar uma solicitacao pendente para o agente, nao tentar acessar o pfSense por SSH, VPN ou porta aberta.

## Problemas que precisam ser resolvidos antes do backup

### 1. Documentacao espalhada

Ha documentos importantes na raiz e em `docs/`, muitos deles historicos. Isso dificulta retomar um chat novo sem reler dezenas de arquivos.

Decisao:

- manter arquivos antigos no lugar por enquanto
- criar uma camada canonica:
  - `docs/00-INDICE-OPERACIONAL.md`
  - este plano mestre
  - especificacao do modulo de backup
- fazer reorganizacao fisica apenas em trilha futura, separada de codigo

### 2. Origem interna desalinhada

Ha referencias antigas a `192.168.100.244:8088`, mas o ambiente informado e observado usa `192.168.100.221`, com publicacao tambem em `192.168.100.221:3031`.

Risco:

- liberar upload de backup para origem errada
- deixar porta exposta sem necessidade
- diagnostico futuro ficar confuso

Acao antes do backup:

- decidir uma origem interna unica
- atualizar `infra/ispconfig/nginx.monitor-pfsense.conf`
- atualizar documentos que ainda citam origem antiga
- validar com `scripts/verify-origin-contract.sh`

### 3. Limite de payload insuficiente

O limite atual de `64 KB` e bom para heartbeat, mas insuficiente para muitos `config.xml`.

Acao antes do backup:

- manter heartbeat limitado a `64 KB`
- criar limite proprio para backup, recomendado inicialmente `5 MB`
- ajustar gateway interno e ISPConfig somente na rota de backup
- nao aumentar tudo indiscriminadamente

### 4. Dados sensiveis

O `config.xml` pode conter:

- usuarios e hashes
- certificados
- chaves privadas
- VPNs
- regras de firewall e NAT
- dados internos de rede
- segredos de pacotes instalados

Acao obrigatoria:

- criptografar backup em repouso
- nunca logar conteudo
- nunca persistir XML puro no PostgreSQL
- restringir download inicialmente a `superadmin`
- auditar ingestao, download, retencao e falhas

### 5. Segredo antigo do Gmail

O fluxo antigo usa senha de app Gmail embutida no script do pfSense.

Acao operacional:

- revogar a senha de app exposta
- remover scripts antigos dos pfSense conforme migracao
- nunca reaproveitar essa senha no novo sistema

## Organizacao desejada do software

### Backend

Manter por dominio:

```text
apps/api/src/
  ingest/
  backups/
  nodes/
  admin/
  alerts/
  auth/
  common/
```

Mudancas recomendadas:

- extrair autenticacao HMAC de node para um service comum
- manter `ingest/heartbeat` focado em snapshot operacional
- criar modulo proprio para backup de config
- criar mecanismo controlado de comandos permitidos por node para `config_backup_now`
- separar criptografia de `node_secret` e criptografia de backups
- adicionar testes ou smokes por rota sensivel

### Banco

Manter PostgreSQL como fonte de metadados e auditoria.

Nao guardar `config.xml` bruto no banco.

Usar o cadastro atual como hierarquia operacional:

```text
Client
  Site
    Node
      NodeConfigBackup[]
      NodeCommand[]
```

Criar tabela de metadados:

- node
- hash
- tamanho
- caminho de armazenamento
- versao de criptografia
- horario recebido
- origem
- status

Criar tambem uma tabela de solicitacoes/comandos por node para a acao controlada "backup agora":

- node
- tipo do comando
- status
- usuario solicitante
- horario solicitado
- horario em que o agente pegou
- horario concluido
- expiracao
- erro ou resultado resumido

### Armazenamento

Criar volume dedicado para backups dos pfSense:

```text
data/pfsense-config-backups/
```

Regra:

- arquivos criptografados
- nomes sem segredo
- estrutura por node
- retencao automatica
- checksum persistido

### Frontend

Comecar simples:

- bloco "Backups" no detalhe do firewall
- lista de arquivos de backup pertencentes ao firewall atual
- mostrar ultimo backup, idade, tamanho, hash curto e status
- listar ultimos backups do node
- botao "Solicitar backup agora"
- status da solicitacao: aguardando firewall, executando, recebido, falhou ou expirou
- download apenas para `superadmin`
- pagina global `/backups` fica para segunda etapa

### Package pfSense

Evoluir `packages/pfsense-package`.

Adicionar:

- comando `backup-config`
- estado local de ultimo hash enviado
- agendamento pelo loop do agente
- nova aba `Backup` na GUI local existente `Services > SystemUp Monitor`
- campos na aba `Backup` para habilitar/desabilitar backup
- flag no instalador one-shot

Nao criar um novo script Python isolado.
Nao criar um novo package pfSense separado.
Nao criar um novo caminho no menu do pfSense.

### Repositorio e deploy integrados

Manter codigo, package e artefatos no repositorio principal do Monitor-Pfsense.

Decisao:

- repositorio operacional: `pablomichelin/pfsense-monitor-agent`
- raw base do package: `https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main`
- nao manter repos separados para o backup
- nao publicar `.env`, dumps, backups ou `config.xml` real
- `config/package-release.env` deve apontar para o repo principal

Detalhamento em:

- `docs/65-FRONTEND-E-DEPLOY-BACKUP-PFSENSE-2026-06-08.md`
- `docs/66-DECISAO-MODULO-BACKUP-INTEGRADO-SYSTEMUP-MONITOR-2026-06-08.md`

## Roadmap recomendado

### Fase A - Arrumar a casa documental

Objetivo:

- reduzir confusao de retomada
- criar fonte de verdade para proximos chats

Entregas:

- `docs/00-INDICE-OPERACIONAL.md`
- este plano mestre
- especificacao do modulo de backup
- atualizacao de `LEITURA-INICIAL.md`
- atualizacao de `00-README.md`

Criterio de saida:

- novo chat sabe exatamente por onde comecar

### Fase B - Saneamento de publicacao e seguranca

Objetivo:

- preparar o ambiente para receber payload sensivel

Entregas:

- origem interna unica definida
- porta externa desnecessaria removida ou justificada
- `infra/ispconfig/nginx.monitor-pfsense.conf` alinhado
- limite de upload por rota planejado
- secret Gmail antigo revogado
- revisao de `TRUST_PROXY` e `TRUSTED_PROXY_IPS`
- backup PostgreSQL validado antes de migracoes

Criterio de saida:

- `BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/verify-origin-contract.sh` passa
- healthz, login, SSE e API continuam funcionando

### Fase C - Backend do backup

Objetivo:

- receber e armazenar backup de config com seguranca

Entregas:

- migration Prisma
- modulo `backups`
- endpoint `POST /api/v1/ingest/config-backup`
- endpoint humano para solicitar backup agora
- fila/tabela de comando permitido `config_backup_now`
- criptografia em repouso
- retencao por node
- auditoria
- endpoint de listagem por node
- endpoint de download auditado

Criterio de saida:

- upload assinado por node funciona em teste local
- backup salvo nao fica legivel no disco
- download exige sessao humana autorizada
- solicitar backup agora cria comando pendente e nao abre conexao direta para o pfSense

### Fase D - Package pfSense com envio de backup

Objetivo:

- fazer o pfSense enviar o `config.xml` ao controlador sem email

Entregas:

- comando `backup-config`
- leitura de comando pendente `config_backup_now` vindo do controlador
- agendamento diario ou por mudanca
- deduplicacao por SHA256
- estado local em `/var/db/monitor-pfsense-agent/`
- aba `Backup` no package local `Services > SystemUp Monitor`
- flags no instalador
- bump de versao do package
- release com SHA256

Criterio de saida:

- um pfSense real envia backup com sucesso
- se o XML nao mudou, o agente nao envia duplicado
- ao clicar "Solicitar backup agora" no painel, o pfSense executa o envio no proximo ciclo do agente
- logs locais mostram sucesso/falha sem vazar conteudo

### Fase E - Painel de backup

Objetivo:

- dar visibilidade operacional sem poluir o painel

Entregas:

- bloco de backups no detalhe do node
- status de ultimo backup
- lista dos ultimos backups
- botao "Solicitar backup agora" com estado da solicitacao
- download auditado para `superadmin`
- filtro/atalho de auditoria por node

Criterio de saida:

- operador consegue saber se cada firewall tem backup recente
- admin/superadmin consegue pedir um backup sem entrar na GUI do pfSense

### Fase F - Alertas de backup

Objetivo:

- transformar backup em controle operacional

Entregas:

- alerta `config_backup_missing`
- alerta `config_backup_failed`
- regra de atraso configuravel
- dashboard com contagem de backups atrasados

Criterio de saida:

- firewall sem backup recente aparece como problema operacional

### Fase G - Restore manual assistido

Objetivo:

- permitir recuperar backup com seguranca sem automatizar restore remoto

Entregas:

- download do XML descriptografado sob permissao
- aviso claro de sensibilidade
- auditoria forte
- documentacao de restore manual no pfSense

Criterio de saida:

- equipe consegue baixar backup e restaurar manualmente em janela controlada

### Fase H - Criptografia ponta-a-ponta opcional

Objetivo:

- reduzir impacto de comprometimento do servidor

Entregas candidatas:

- pfSense criptografa antes de enviar
- senha/chave por cliente ou por firewall
- servidor armazena sem conseguir ler conteudo
- download exige chave externa

Criterio de saida:

- backup continua recuperavel mesmo se banco/arquivos vazarem sem chave externa

## Melhorias gerais de qualidade

### Codigo

- reduzir logica duplicada de assinatura HMAC
- evitar crescimento de shell script sem limites
- manter package e API com contratos versionados
- criar services pequenos por responsabilidade
- nao misturar upload, criptografia, retencao e auditoria no controller

### Banco

- migrations pequenas e reversiveis quando possivel
- indices por `node_id`, `received_at` e `sha256`
- evitar dados binarios grandes no PostgreSQL
- backup do banco antes de qualquer migration relevante

### API

- validar tamanho por rota
- manter respostas previsiveis
- nunca retornar segredo
- padronizar erros de autenticacao do agente
- proteger download com RBAC e auditoria

### Frontend

- manter painel operacional e compacto
- evitar texto explicativo longo dentro da UI
- priorizar status, ultimo backup e acao clara
- nao criar landing page ou tela decorativa
- nao esconder falhas relevantes

### Operacao

- smokes antes e depois de deploy
- scripts idempotentes
- release do package sempre com SHA256
- logs sem segredo
- documentacao de rollback

## Definition of Done do modulo backup

O modulo so deve ser considerado pronto quando:

- API recebe backup assinado por node real
- arquivo salvo esta criptografado em repouso
- metadados aparecem no painel do node
- retencao funciona
- download exige `superadmin`
- download gera auditoria
- falha de backup gera sinal operacional
- package pfSense envia backup sem crontab manual
- instalacao continua sendo uma linha no pfSense
- smokes foram criados e executados
- documentacao operacional foi atualizada

## O que nao fazer

- nao salvar XML bruto no banco
- nao salvar XML puro em disco
- nao enviar backup por email como solucao final
- nao usar token unico para todos os firewalls
- nao criar endpoint sem HMAC
- nao ativar restore automatico no MVP
- nao aumentar limite global de payload sem controle por rota
- nao mexer no Zabbix por conveniencia
- nao reorganizar fisicamente toda a documentacao junto com mudanca de codigo

## Proximo passo recomendado

Executar a Fase B antes de codar backup:

1. alinhar origem real `Cloudflare -> ISPConfig -> origin`
2. decidir se a origem do Compose fica em `192.168.100.221:3031` ou `192.168.100.221:8088`
3. ajustar documentacao antiga que cita `192.168.100.244`
4. definir limite de upload do backup
5. criar chave `BACKUP_ENCRYPTION_KEY_BASE64`
6. fazer backup e restore testado do PostgreSQL
7. so entao iniciar a Fase C
