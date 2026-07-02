# 117 - Plano de execucao: melhorias seguras e fundacoes novas

**Data:** 2026-07-02  
**Status:** Concluido (2026-07-02)  
**Escopo:** Monitor-Pfsense em `/Dados/Monitor-Pfsense`  
**Base canonica:** API `0.6.4`, painel `1.4.5`, package pfSense `0.4.7`  
**Auditoria previa:** `docs/116-AUDITORIA-DOCUMENTAL-CONSOLIDACAO-2026-07-01.md`

Este plano existe para orientar chats limpos no Composer 2.5, Claude ou outro agente de implementacao. Ele transforma as melhorias avaliadas como executaveis em uma trilha segura, faseada e auditavel, sem quebrar funcoes que ja operam hoje.

---

## 1. Objetivo

Evoluir o Monitor-Pfsense em camadas, preservando o produto atual:

- heartbeat, snapshot operacional, alertas, RBAC, MFA, backups, inventario, package upgrade e pfSense upgrade semi-manual devem continuar funcionando;
- nenhuma fase pode exigir acesso inbound generalizado aos pfSense;
- nenhuma fase pode executar comando remoto arbitrario;
- nenhuma fase pode alterar Zabbix, Apache, MySQL, portas reservadas ou servicos do host por conveniencia;
- qualquer recurso com risco operacional deve nascer atras de feature flag, RBAC, auditoria e rollback claro.

---

## 2. Fontes obrigatorias antes de implementar

Todo chat limpo deve ler, nesta ordem:

1. `LEITURA-INICIAL.md`
2. `CORTEX.md`
3. `docs/00-INDICE-OPERACIONAL.md`
4. `docs/116-AUDITORIA-DOCUMENTAL-CONSOLIDACAO-2026-07-01.md`
5. este arquivo: `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md`
6. documentos especificos da fase em execucao

Se a fase tocar backup, ler tambem:

- `docs/64-ESPECIFICACAO-MODULO-BACKUP-PFSENSE-2026-06-08.md`

Se a fase tocar package/agente pfSense, ler tambem:

- `docs/pfsense-package/00-GUIA-OPERACAO-PACKAGE.md`
- `docs/114-UPGRADE-REMOTO-PACKAGE.md`

Se a fase tocar RBAC/permissoes, ler tambem:

- `docs/76-ENCERRAMENTO-TRILHA-RBAC-2026-06-09.md`
- `23-matriz-permissoes-e-escopo-rbac-2026-06-09.md`

---

## 3. Regras de seguranca para todas as fases

Estas regras sao obrigatorias:

- Trabalhar em uma fase por vez.
- Antes de alterar codigo, rodar `git status --short` e preservar mudancas existentes.
- Preferir migrations aditivas; nao remover coluna/tabela/enum sem fase propria de migracao.
- Manter compatibilidade com agentes/package antigos quando viavel.
- Toda nova acao sensivel deve ter RBAC no backend, nao apenas no frontend.
- Toda nova acao sensivel deve gravar `audit_logs`.
- Segredos nunca devem ir para docs, `.env.example` com valor real, migrations, testes ou logs.
- Comandos para pfSense devem ser allowlistados por tipo e payload validado.
- Nao adicionar listener no agente pfSense sem decisao explicita.
- Nao abrir portas novas no host sem justificar e confirmar conflito com Zabbix.
- Nao depender de Redis, Prometheus, Grafana ou outro servico novo na primeira entrega de uma feature; se aparecer necessidade real, documentar como decisao.
- UI deve seguir o padrao operacional existente: densa, legivel, sem landing page, sem decoracao inutil.
- Novas tabelas nascem como model Prisma PascalCase com `@@map(snake_case)`; sempre migrations aditivas.
- Novas permissoes RBAC devem seguir a convencao existente em `permission-keys.ts` (`recurso.acao[.run]`, ex.: `package.upgrade.run`, `backups.view`); nao inventar prefixos novos nem duplicar permissao ja existente.

---

## 4. Gates obrigatorios de cada fase

Cada fase so pode ser marcada como concluida se cumprir estes gates.

| Gate | Obrigatorio |
|------|-------------|
| Contrato | Doc da fase declara se altera API, dados, UI, agente/package ou operacao |
| Banco | Migration aditiva, reversibilidade operacional documentada |
| RBAC | Permissoes novas registradas e refletidas no painel |
| Auditoria | Acoes sensiveis gravadas em `audit_logs` |
| Feature flag | Recursos arriscados nascem desligaveis por env/config |
| Testes | Build e smokes coerentes com a area alterada |
| Handoff | Criar doc de entrega e atualizar `LEITURA-INICIAL.md` se mudar estado operacional |
| Rollback | Explicar como desabilitar/reverter sem quebrar heartbeats existentes |

---

## 5. Como acompanhar o plano

Atualizar esta tabela ao iniciar e encerrar cada fase.

Status permitidos:

- `Pendente`
- `Em execucao`
- `Bloqueada`
- `Concluida`
- `Cancelada`

| Fase | Nome | Tipo | Status | Entrega |
|------|------|------|--------|---------|
| 0 | Baseline e harness de seguranca | Preparacao | Concluida | `docs/118-BASELINE-MELHORIAS-SEGURAS-2026-07-02.md` |
| 1 | Notificacoes externas | Melhoria segura | Concluida | `docs/119-ENTREGA-NOTIFICACOES-EXTERNAS-2026-07-02.md` |
| 2 | Dashboard frota e matriz de versoes | Melhoria segura | Concluida | `docs/120-ENTREGA-DASHBOARD-FROTA-2026-07-02.md` |
| 3 | Tags, grupos e criticidade | Melhoria segura | Concluida | `docs/121-ENTREGA-TAGS-GRUPOS-CRITICIDADE-2026-07-02.md` |
| 4 | Politica MFA e endurecimento administrativo | Melhoria segura | Concluida | `docs/122-ENTREGA-POLITICA-MFA-2026-07-02.md` |
| 5 | Backup avancado: diff, drift e retencao | Melhoria segura | **Concluida** | `docs/123-ENTREGA-BACKUP-AVANCADO-2026-07-02.md` |
| 6 | Observabilidade historica e rollups | Melhoria segura | **Concluida** | `docs/124-ENTREGA-OBSERVABILIDADE-HISTORICA-2026-07-02.md` |
| 7 | Fundacao de jobs/comandos | Fundacao nova | **Concluida** | `docs/125-ENTREGA-FUNDACAO-JOBS-COMANDOS-2026-07-02.md` |
| 8 | Acoes operacionais allowlistadas | Depende da fase 7 | **Concluida** | `docs/126-ENTREGA-ACOES-OPERACIONAIS-2026-07-02.md` |
| 9 | Certificados e expiracao | Melhoria segura | **Concluida** | `docs/127-ENTREGA-CERTIFICADOS-EXPIRACAO-2026-07-02.md` |
| 10 | Vault e inventario de capacidades pfSense | Fundacao nova | **Concluida** | `docs/128-ENTREGA-VAULT-CAPACIDADES-PFSENSE-2026-07-02.md` |
| 11 | Piloto pfREST read-only e aliases | Depende da fase 10 | **Concluida** | `docs/129-ENTREGA-PFREST-READONLY-ALIASES-2026-07-02.md` |
| 12 | Consolidacao, hardening e release | Fechamento | **Concluida** | `docs/130-ENTREGA-CONSOLIDACAO-HARDENING-RELEASE-2026-07-02.md` |

---

## 6. Escopo fora deste plano

Nao implementar nesta trilha sem nova decisao explicita:

- execucao de comandos remotos arbitrarios;
- restore automatico de `config.xml` diretamente no pfSense;
- abertura inbound do controlador para todos os pfSense como base do produto;
- SSO/proxy completo para GUI do pfSense;
- gestao completa de regras firewall, NAT, port forward e VPN em massa;
- templates de configuracao aplicados automaticamente em frota;
- Prometheus/Grafana como dependencia obrigatoria;
- troca de stack, banco, proxy ou arquitetura de deploy;
- qualquer mudanca que afete Zabbix ou portas reservadas.

Esses itens podem ser reavaliados depois das fundacoes de jobs, vault, capacidades e auditoria estarem maduras.

---

## 7. Fase 0 - Baseline e harness de seguranca

**Objetivo:** preparar o repo para evolucao incremental com medicao clara do que funciona antes de mexer.

**Escopo:**

- confirmar estado atual do stack, versoes e scripts de smoke;
- criar checklist operacional de baseline se ainda nao existir;
- garantir que os agentes futuros tenham uma forma padrao de registrar entrega e atualizar esta trilha.

**Mudancas esperadas:**

- doc de baseline em `docs/118-BASELINE-MELHORIAS-SEGURAS-YYYY-MM-DD.md`;
- nenhuma mudanca de runtime obrigatoria;
- opcional: script agregador de verificacao se os smokes atuais estiverem dispersos demais.

**Validacoes minimas:**

- `git status --short`
- `npm run build` em `apps/api` se houver mudanca de API
- `npm run build` em `apps/web` se houver mudanca de web
- `./scripts/run-smoke-suite.sh` quando o ambiente local estiver pronto

**Criterio de saida:**

- baseline registrado;
- este plano atualizado para marcar a fase como `Concluida`;
- proxima fase escolhida explicitamente.

---

## 8. Fase 1 - Notificacoes externas

**Objetivo:** enviar alertas para canais externos sem mudar a logica atual de abertura, ack e resolve.

**Escopo inicial seguro:**

- email SMTP;
- webhook HTTP generico;
- Telegram bot, se as credenciais forem configuradas por env e nunca versionadas;
- regras simples por severidade, cliente e tipo de alerta.

**Modelo sugerido:**

- `notification_channels`: tipo, nome, status, config criptografada ou config sem segredo;
- `notification_rules`: severidade, tipo de alerta, cliente opcional, canal;
- `notification_deliveries`: alerta, canal, status, tentativa, erro, timestamps.

**Backend:**

- nao alterar o contrato atual de alertas;
- adicionar dispatcher idempotente disparado quando alerta abre ou muda para criticidade relevante;
- retries limitados e sem bloquear request principal;
- evitar logar payload com segredo.

**Frontend:**

- tela administrativa para canais e regras;
- historico de entregas por alerta;
- teste de canal com permissao propria.

**RBAC/auditoria:**

- permissoes sugeridas: `notifications.view`, `notifications.manage`, `notifications.test`;
- auditar create/update/delete/test de canais e regras;
- nao exibir segredos depois de salvos.

**Feature flags:**

- `NOTIFICATIONS_ENABLED=false` por padrao em primeiro deploy, se houver risco operacional;
- flags especificas por provider se necessario.

**Testes:**

- unit tests do roteamento de regras;
- teste de assinatura/mascara de segredo;
- teste de retry sem duplicar entrega;
- build API/web;
- smoke manual com canal fake/webhook local se possivel.

**Rollback:**

- desligar `NOTIFICATIONS_ENABLED`;
- manter alertas internos intactos.

---

## 9. Fase 2 - Dashboard frota e matriz de versoes

**Objetivo:** melhorar visao executiva sem mudar ingestao nem agente.

**Escopo inicial seguro:**

- KPIs agregados: total, online, degradados, offline, maintenance, alertas criticos;
- percentual com backup em dia;
- percentual com package desatualizado;
- matriz pfSense OS e package;
- filtros por cliente/site/status ja existentes.

**Backend:**

- expandir `dashboard` ou criar endpoint novo sem quebrar `GET /api/v1/dashboard/summary`;
- manter escopo RBAC por cliente;
- cache curto, como ja existe no dashboard.

**Frontend:**

- adicionar cards compactos e tabelas de versoes;
- manter `/nodes` como fonte de acao detalhada;
- evitar graficos pesados antes da fase de rollups.

**Testes:**

- testes de agregacao com escopo por cliente;
- build web;
- smoke visual simples em `/dashboard` e `/nodes`.

**Rollback:**

- UI pode ocultar nova secao sem afetar endpoints existentes.

---

## 10. Fase 3 - Tags, grupos e criticidade

**Objetivo:** permitir organizacao flexivel da frota e preparar operacoes em lote com escopo controlado.

**Escopo inicial seguro:**

- tags livres por node;
- grupos ad-hoc de nodes;
- criticidade/SLA por node: `critical`, `standard`, `lab` ou equivalente;
- filtros no inventario.

**Modelo sugerido:**

- `node_tags`, `tags`;
- `node_groups`, `node_group_members`;
- campo ou tabela para `node_criticality`;
- migrations aditivas.

**Backend:**

- CRUD administrativo com RBAC;
- filtros de listagem por tag/grupo/criticidade;
- nunca usar tags como autoridade de permissao; RBAC por cliente continua sendo autoridade.

**Frontend:**

- chips/filtros no inventario;
- edicao em detalhe do firewall;
- tela simples para grupos.

**Testes:**

- escopo por cliente;
- filtros combinados;
- create/update/delete sem afetar status do node.

**Rollback:**

- ocultar filtros e ignorar metadados; heartbeats seguem intactos.

---

## 11. Fase 4 - Politica MFA e endurecimento administrativo

**Objetivo:** transformar MFA de capacidade disponivel em politica operacional clara, sem lockout acidental.

**Escopo inicial seguro:**

- UI para visualizar enforcement por role;
- modo soft e blocking explicitos;
- aviso de usuarios sem MFA quando role exige;
- runbook de recuperacao.

**Backend:**

- manter `MFA_ENFORCED_ROLES` e `MFA_ENFORCEMENT_BLOCKING`;
- se criar configuracao em banco, manter env como override seguro;
- impedir ativar blocking sem pelo menos um superadmin com MFA e recovery code valido.

**Frontend:**

- painel administrativo de politica MFA;
- indicadores em Usuarios;
- fluxo de enrollment ja existente reaproveitado.

**RBAC/auditoria:**

- permissao sugerida: `security.mfa_policy.manage`;
- auditar mudanca de politica.

**Testes:**

- anti-lockout;
- login com MFA;
- recovery code;
- usuario sem MFA em modo soft.

**Rollback:**

- `MFA_ENFORCEMENT_BLOCKING=false`;
- limpar roles enforced se necessario.

---

## 12. Fase 5 - Backup avancado: diff, drift e retencao

**Status:** Concluida em 2026-07-02 — ver `docs/123-ENTREGA-BACKUP-AVANCADO-2026-07-02.md`

**Objetivo:** aumentar valor do backup sem habilitar restore automatico.

**Escopo inicial seguro:**

- diff entre duas versoes de `config.xml`;
- diff por secoes principais quando tecnicamente seguro;
- retencao configuravel por cliente/node;
- alerta de drift quando hash/secoes mudam fora da janela esperada;
- exportacao assistida com RBAC e auditoria.

**Regras de seguranca:**

- nunca persistir XML puro fora do fluxo criptografado existente;
- descriptografar apenas em memoria ou arquivo temporario controlado;
- mascarar campos sensiveis no diff usando allowlist de secoes conhecidas, com politica fail-closed: secao nao reconhecida e totalmente mascarada (nunca fail-open);
- download/diff sempre auditado.

**Backend:**

- endpoint para diff com `backups.view` (ou `backups.download` para conteudo), permissao ja existente em `permission-keys.ts`;
- parser XML estruturado, nao diff textual cego como unica fonte;
- policy por node/cliente usando estrutura existente `configBackupPolicyJson` se adequada.

**Frontend:**

- seletor de duas versoes;
- visual de diff com secoes colapsaveis;
- alerta claro quando diff mascarou segredos.

**Testes:**

- diff com XML pequeno;
- mascara de segredos;
- RBAC por cliente;
- retencao preserva backup mais novo;
- drift abre alerta sem duplicar.

**Rollback:**

- desabilitar diff/drift por flag;
- backups existentes continuam validos.

---

## 13. Fase 6 - Observabilidade historica e rollups

**Objetivo:** criar historico operacional sem transformar o PostgreSQL em deposito infinito de telemetria bruta.

**Escopo inicial seguro:**

- rollups horarios/diarios de CPU, memoria, disco, status, latencia e disponibilidade;
- graficos de tendencia no detalhe do node;
- relatorio simples por periodo;
- sem Prometheus/Grafana obrigatorio.

**Modelo sugerido:**

- `node_metric_rollups_hourly`;
- `node_metric_rollups_daily`;
- job periodico idempotente no NestJS;
- retencao configuravel.

**Backend:**

- ATENCAO: o controlador NAO retem heartbeat historico (modelo snapshot, doc 61; Zabbix e a fonte de retencao). Nao assumir serie temporal existente;
- esta fase exige uma sub-etapa 6A de amostragem: job periodico que le o snapshot atual de `nodes` (cpu/memoria/disco/status/latencia) e grava as amostras que alimentarao os rollups;
- nao reter payload bruto alem da politica atual sem decisao;
- job deve ter lock simples para evitar concorrencia.

**Frontend:**

- graficos compactos por node;
- periodo 24h, 7d, 30d;
- estado vazio claro quando nao ha dados.

**Testes:**

- rollup idempotente;
- timezone consistente;
- escopo RBAC;
- performance com volume simulado.

**Rollback:**

- parar job;
- ocultar graficos;
- manter snapshot atual como fonte operacional.

---

## 14. Fase 7 - Fundacao de jobs/comandos

**Objetivo:** padronizar comandos e jobs antes de ampliar acoes remotas.

**Por que esta fase vem antes de acoes novas:**

O sistema ja possui `node_commands`, mas comandos em massa e acoes operacionais exigem contrato comum de idempotencia, retries, concorrencia, expiracao e resultado.

**Escopo inicial:**

- contrato unico para comandos;
- concorrencia global e por node;
- retry/backoff por tipo;
- expiracao e cancelamento;
- historico de execucao;
- status claro para UI;
- nenhum comando arbitrario.

**Modelo sugerido:**

- estender `node_commands` se suficiente;
- ou adicionar `job_batches` para operacoes em lote;
- evitar Redis na primeira versao;
- usar scheduler/worker interno NestJS com lock no banco.

**Backend:**

- camada `jobs`/`commands` reutilizavel;
- validacao forte de payload por tipo;
- resultado padronizado;
- limite por cliente/node;
- permissao por comando.

**Agent/package:**

- manter polling via heartbeat;
- nao adicionar listener;
- exigir `agent_version` minima por comando;
- comando desconhecido deve falhar de forma segura.

**Frontend:**

- componente padrao de progresso;
- historico de comandos por node;
- lote com sucesso/falha por node.

**Testes:**

- idempotencia;
- retry/backoff;
- expiracao;
- concorrencia;
- command-result tardio;
- compatibilidade com `config_backup_now`, `pfsense_upgrade`, `package_upgrade`.

**Rollback:**

- manter comandos existentes funcionando;
- feature flag para novo worker;
- fallback para comportamento atual se necessario.

---

## 15. Fase 8 - Acoes operacionais allowlistadas

**Status:** Concluida em 2026-07-02 — ver `docs/126-ENTREGA-ACOES-OPERACIONAIS-2026-07-02.md`

**Dependencia:** Fase 7 concluida.

**Objetivo:** adicionar acoes operacionais limitadas e auditadas, sem criar shell remoto.

**Escopo inicial seguro:**

- `service_restart` para lista permitida de servicos;
- `node_reboot` com confirmacao forte e janela de manutencao;
- `config_backup_now` em lote usando fluxo existente;
- opcional: refresh de status/update check.

**Regras:**

- cada acao e um `NodeCommandType` explicito;
- payload pequeno e validado;
- servicos reiniciaveis devem vir de allowlist no package;
- sem campo "command", "shell", "args" livre;
- exigir permissao propria e auditoria;
- `node_reboot` deve checar `haRole`/CARP; bloquear ou exigir dupla confirmacao em no primario de par HA para evitar failover indesejado.

**RBAC sugerido (alinhado a convencao `recurso.acao.run` de `permission-keys.ts`):**

- `backups.run` (reuso — `config_backup_now` em lote ja usa esta permissao)
- `service.restart.run`
- `node.reboot.run`

**Frontend:**

- acoes no detalhe do node;
- lote apenas para grupos/tags com confirmacao;
- mostrar impacto e status por node.

**Agent/package:**

- implementar handlers defensivos;
- lock por acao;
- logs locais;
- command-result sempre enviado.

**Testes:**

- handler desconhecido;
- servico fora da allowlist;
- node offline;
- command-result failed/succeeded;
- UI de confirmacao.

**Rollback:**

- desabilitar por feature flag;
- remover botoes do painel;
- comandos pendentes podem expirar sem impacto.

---

## 16. Fase 9 - Certificados e expiracao

**Objetivo:** dar visibilidade de certificados antes de vencerem.

**Escopo inicial seguro:**

- inventario de certificados reportados pelo agente;
- alerta de expiracao em 30/15/7 dias;
- exibir em detalhe do node;
- sem renovacao automatica.

**Agent/package:**

- coletar certificados relevantes com cuidado;
- enviar apenas metadados: subject, issuer, not_before, not_after, uso/descritor;
- nao enviar chave privada.

**Backend:**

- armazenar snapshot por node;
- abrir/fechar alertas de expiracao;
- respeitar RBAC.

**Frontend:**

- tabela no detalhe do firewall;
- filtro global opcional em alertas.

**Testes:**

- parse de datas;
- certificado expirado;
- certificado renovado fecha alerta;
- payload sem chave privada.

**Rollback:**

- agente pode parar de enviar secao;
- backend ignora ausencia sem degradar node.

---

## 17. Fase 10 - Vault e inventario de capacidades pfSense

**Objetivo:** preparar integracao futura com REST API/pfREST sem ainda fazer gestao remota de configuracao.

**Escopo inicial:**

- inventario por node: REST API instalada, versao, URL base, modo de acesso, capacidades habilitadas;
- cofre de credenciais por node;
- rotacao e teste de credencial;
- nenhuma alteracao de alias/regra/NAT/VPN nesta fase.

**Seguranca:**

- reusar o servico de cifra AES-256-GCM ja existente (mesmo padrao de `NODE_SECRET_ENCRYPTION_KEY_BASE64` / `BACKUP_ENCRYPTION_KEY_BASE64`) em vez de criar um equivalente, para nao multiplicar superficies de chave;
- segredos nunca retornam para UI;
- teste de credencial deve registrar auditoria;
- RBAC especifico;
- opcional: allowlist de origem interna/mTLS somente se houver decisao de infra.

**Modelo sugerido:**

- `node_capabilities`;
- `node_external_credentials`;
- `node_credential_events` se necessario;
- config criptografada por node.

**Backend:**

- CRUD de credencial;
- test connection read-only;
- inventario de capacidades reportado pelo agente ou coletado de forma controlada;
- timeout curto e backoff.

**Frontend:**

- secao "Capacidades" no detalhe do firewall;
- cadastro/rotacao de credencial;
- status read-only.

**Testes:**

- criptografia/decriptografia;
- segredo mascarado;
- RBAC;
- timeout;
- auditoria.

**Rollback:**

- desabilitar integracao;
- credenciais podem permanecer criptografadas e inertes;
- nenhuma mudanca em firewall.

---

## 18. Fase 11 - Piloto pfREST read-only e aliases

**Dependencia:** Fase 10 concluida.

**Objetivo:** validar o caminho de "gerenciador" com o menor risco: read-only primeiro, escrita limitada depois.

**Subfase 11A - Read-only:**

- listar aliases do pfSense via API;
- comparar com ultimo backup `config.xml` quando possivel;
- mostrar divergencias;
- sem gravar alteracao no firewall.

**Subfase 11B - Alias push piloto:**

- CRUD central de aliases em um ambiente lab;
- push para 1 node selecionado;
- preview antes de aplicar;
- apply explicito;
- auditoria antes/depois;
- backup recente obrigatorio;
- feature flag desligada por padrao em producao.

**Regras de seguranca:**

- nao gerenciar regras firewall/NAT/VPN nesta fase;
- nao aplicar lote em producao antes de piloto real;
- nao executar sem backup recente;
- rollback deve ser assistido, nao automatico cego.

**RBAC sugerido:**

- `pfsense.api.view`
- `pfsense.alias.manage`
- `pfsense.alias.apply`

**Testes:**

- read-only sem credencial;
- credencial invalida;
- preview;
- auditoria antes/depois;
- falha no apply;
- backup gate.

**Rollback:**

- feature flag;
- remover botoes de apply;
- manter read-only se seguro.

---

## 19. Fase 12 - Consolidacao, hardening e release

**Objetivo:** fechar a trilha, reduzir divida criada pelas fases e preparar proxima decisao de produto.

**Escopo:**

- revisao de seguranca;
- revisao de RBAC/permissoes;
- revisar smokes e atualizar suite;
- documentar gaps;
- atualizar `LEITURA-INICIAL.md`, `docs/00-INDICE-OPERACIONAL.md` e este plano;
- consolidar docs de entrega.

**Criterio de saida:**

- todas as fases executadas marcadas;
- pendencias reais listadas;
- proxima trilha proposta;
- produto atual funcionando com smokes verdes.

---

## 20. Template de prompt para chat limpo

Use este modelo ao iniciar qualquer fase no Composer 2.5 ou Claude:

```text
Voce esta em /Dados/Monitor-Pfsense.

Objetivo: executar SOMENTE a Fase <NOME/NUMERO> do plano:
docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md

Leia antes de agir:
1. LEITURA-INICIAL.md
2. CORTEX.md
3. docs/00-INDICE-OPERACIONAL.md
4. docs/116-AUDITORIA-DOCUMENTAL-CONSOLIDACAO-2026-07-01.md
5. docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md
6. docs especificos indicados na fase

Regras:
- nao implementar itens fora da fase;
- preservar funcoes atuais;
- nao mexer em Zabbix, Apache, MySQL ou portas reservadas;
- nao criar comandos remotos arbitrarios;
- toda acao sensivel precisa de RBAC, auditoria e rollback;
- antes de editar, rode git status --short e preserve mudancas existentes;
- atualize o status da fase no plano;
- crie doc de entrega em docs/<NUMERO>-ENTREGA-...md;
- atualize LEITURA-INICIAL.md e docs/00-INDICE-OPERACIONAL.md se o estado operacional mudou;
- rode builds/testes coerentes com a area alterada;
- ao final, reporte arquivos alterados, testes, riscos e proximo passo.

Execute a fase de ponta a ponta.
```

---

## 21. Template de entrega de fase

Cada fase concluida deve gerar um documento `docs/XXX-ENTREGA-<NOME>-YYYY-MM-DD.md` com:

```md
# XXX - Entrega: <nome>

**Data:** YYYY-MM-DD
**Fase do plano 117:** Fase N - <nome>
**Componentes alterados:** API / web / package / docs / infra
**Versoes antes:** API X, web Y, package Z
**Versoes depois:** API X, web Y, package Z

## Escopo entregue

## O que nao foi entregue

## Impacto em API, dados, UI e agente

## RBAC e auditoria

## Feature flags e rollback

## Testes executados

## Evidencias operacionais

## Proximo passo
```

---

## 22. Ordem recomendada de execucao

Ordem sugerida para maximizar seguranca e valor:

1. Fase 0 - Baseline
2. Fase 1 - Notificacoes externas
3. Fase 2 - Dashboard frota
4. Fase 3 - Tags/grupos/criticidade
5. Fase 4 - Politica MFA
6. Fase 5 - Backup diff/drift/retencao
7. Fase 6 - Rollups e tendencias
8. Fase 7 - Fundacao jobs/comandos
9. Fase 8 - Acoes operacionais allowlistadas
10. Fase 9 - Certificados
11. Fase 10 - Vault/capacidades
12. Fase 11 - pfREST read-only/aliases piloto
13. Fase 12 - Consolidacao

Fases 1 a 6 podem ser executadas antes das fundacoes mais pesadas. Fases 8 e 11 nao devem comecar sem suas dependencias.

---

## 23. Go/no-go para recursos de maior risco

Antes de liberar Fase 8 em producao:

- Fase 7 concluida;
- comandos existentes ainda funcionando;
- feature flag testada;
- permissao por comando;
- auditoria por comando;
- package minimo validado em lab;
- rollback testado por expiracao/cancelamento.

Antes de liberar Fase 11B em producao:

- Fase 10 concluida;
- backup recente obrigatorio;
- piloto em lab concluido;
- read-only estavel;
- preview e apply separados;
- auditoria antes/depois;
- plano manual de reversao validado.

---

## 24. Marcadores de progresso

Atualizar ao encerrar cada fase:

- fase atual: `12/12` — trilha 117 encerrada em 2026-07-02;
- plano total: `100%` concluido (Fases 0–12);
- criterio de percentual: cada fase concluida conta como 1 unidade, exceto Fase 11 que pode contar como 2 subunidades se dividida em read-only e apply piloto.

Nao usar estes percentuais como indicador de saude do produto atual. Eles medem apenas esta trilha.

---

## 25. Checkpoint e retorno entre fases

Esta secao define um mecanismo seguro para, se uma fase der errado, voltar ao estado exato de uma fase anterior: codigo, banco e versoes. Ela e um **gate obrigatorio ANTES de iniciar cada fase**, somando-se aos gates da secao 4 (nao substitui nenhum deles).

Este checkpoint e **COMPLEMENTAR** ao rollback por feature flag ja descrito em cada fase:

- **rollback por feature flag**: rapido e reversivel em runtime; reverte apenas o *comportamento* (ligar/desligar recurso), sem tocar dados nem schema. E a primeira linha de defesa.
- **retorno de checkpoint**: recuperacao de *estado* quando dados ou migrations ja foram afetados e o flag sozinho nao restaura o que mudou. E a segunda linha de defesa, mais lenta e mais invasiva.

Regra permanente antes de qualquer restore: **nunca** rodar restore de banco em producao sem antes tirar um dump do estado atual. Voltar ao passado sem salvar o presente destroi dados. O dump do estado atual e obrigatorio mesmo quando se tem certeza do checkpoint de destino.

### 25.1. Tag git por fase (checkpoint de codigo)

Antes de comecar a fase, com a arvore limpa (`git status --short` sem pendencias relevantes), fixar um marco imutavel do codigo:

```bash
git tag fase-N-baseline
git push origin fase-N-baseline
```

A tag e coerente com o fluxo canonico do `CORTEX.md` (commit/push para `origin main` e depois `git pull origin main` neste host, que e o servidor do projeto). A tag preserva o commit exato de inicio da fase mesmo que `main` avance.

Para retornar a esse ponto, **preferir sempre uma branch de recuperacao** a partir da tag, nunca sobrescrever `main` as cegas:

```bash
# inspecionar o estado da fase sem alterar branches
git checkout fase-N-baseline

# forma recomendada: branch de recuperacao a partir da tag
git switch -c recuperacao-fase-N fase-N-baseline
```

`git reset --hard` em `main` reescreve historico e pode apagar trabalho ja publicado — **nao usar em `main` sem ressalva forte e sem confirmar que nada posterior sera perdido**. O caminho seguro e criar a branch de recuperacao, validar e so entao decidir a estrategia de merge.

### 25.2. Dump de banco antes de cada migration (checkpoint de dados)

Migration aditiva protege o schema, mas **NAO desfaz alteracoes de dados** (backfill, updates, delecoes). Por isso, antes de rodar qualquer migration da fase, gerar um dump rotulado por fase.

Reaproveitar o script ja existente `scripts/backup-postgres.sh` (usa `docker compose exec -T db pg_dump ... --format=custom --compress=9 --no-owner --no-privileges` sobre o servico `db` do `compose.yaml`, com credenciais lidas de `.env.db` via `$POSTGRES_USER`/`$POSTGRES_DB`). Rotular pela fase e gravar **fora do repositorio** (sem segredos versionados):

```bash
# dump rotulado por fase, gravado em diretorio externo ao repo
TIMESTAMP="fase-N-pre-migration-$(date -u +%Y%m%d-%H%M%SZ)" \
  scripts/backup-postgres.sh /caminho/externo/backups-monitor-pfsense/postgres
```

O script gera `postgres-<db>-<TIMESTAMP>.dump` mais o `.sha256`. Passar um diretorio externo evita versionar dump (que pode conter dados sensiveis). Se preferir o comando cru, sem o script:

```bash
docker compose exec -T db pg_dump \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --format=custom --compress=9 --no-owner --no-privileges \
  > /caminho/externo/backups-monitor-pfsense/postgres/fase-N-pre-migration.dump
```

Restaurar tem dois modos:

- **validacao segura (recomendada primeiro)**: `scripts/verify-backup-restore.sh <arquivo.dump>` sobe um Postgres temporario descartavel e restaura ali, sem tocar o banco de producao. Use para confirmar que o dump e restauravel antes de qualquer acao destrutiva.
- **restore real em producao (ultimo recurso)**: primeiro tirar um dump do estado atual (regra acima), depois restaurar o checkpoint sobre o servico `db`:

```bash
# 1) salvar o presente antes de voltar ao passado (obrigatorio)
TIMESTAMP="pre-restore-$(date -u +%Y%m%d-%H%M%SZ)" \
  scripts/backup-postgres.sh /caminho/externo/backups-monitor-pfsense/postgres

# 2) restaurar o checkpoint da fase
docker compose exec -T db pg_restore \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --clean --if-exists --no-owner --no-privileges \
  < /caminho/externo/backups-monitor-pfsense/postgres/postgres-<db>-fase-N-pre-migration-<timestamp>.dump
```

### 25.3. Registro de versoes antes/depois (ponto de retorno oficial)

O ponto de retorno oficial de cada fase e o par **versoes antes/depois** ja exigido pelo template de entrega da secao 21. As fontes de verdade das versoes sao:

- `config/package-release.env` — `PACKAGE_RELEASE_VERSION` (package pfSense);
- `apps/api/package.json` — `version` (API);
- `apps/web/package.json` — `version` (web).

Capturar as versoes no inicio da fase (antes) e no fim (depois), e registra-las no doc de entrega:

```bash
grep -E '^PACKAGE_RELEASE_VERSION=' config/package-release.env
node -p "require('./apps/api/package.json').version"
node -p "require('./apps/web/package.json').version"
```

Como as versoes vivem versionadas no git, a tag `fase-N-baseline` (secao 25.1) tambem congela essas versoes; e possivel recupera-las direto da tag sem checkout:

```bash
git show fase-N-baseline:config/package-release.env | grep PACKAGE_RELEASE_VERSION
git show fase-N-baseline:apps/api/package.json | grep '"version"'
git show fase-N-baseline:apps/web/package.json | grep '"version"'
```

Assim, "versoes antes/depois" do template de entrega e a tag git funcionam como o mesmo ponto de retorno: o doc registra o alvo, a tag garante a recuperacao.

---

## 26. Observacoes finais

Este plano favorece entregas pequenas e reversiveis. A evolucao para "gerenciador centralizado" deve acontecer por evidencias: primeiro visibilidade e seguranca, depois fundacoes, depois pilotos controlados, e so entao gestao remota mais ampla.

Se uma fase revelar risco maior que o previsto, marcar como `Bloqueada`, documentar o motivo e escolher a proxima fase independente.
