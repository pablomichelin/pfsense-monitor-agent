# Segurança e modelo de ameaças — Monitor-Pfsense

Documento de referência sobre riscos de segurança e invasão dos clientes (firewalls pfSense). Atualizado conforme a arquitetura e as decisões do projeto.

---

## 1. Arquitetura atual (só agente → servidor)

- O **agente** no pfSense inicia toda a comunicação: envia heartbeat e test-connection para o controlador.
- O **servidor** nunca inicia conexão em direção ao firewall. Não há porta aberta no cliente para o Monitor-Pfsense.
- Fluxo: **pfSense (cliente) → HTTPS → controlador**. Nunca: controlador → pfSense.

**Consequência:** do ponto de vista de rede, não existe “porta de entrada” no firewall exposta para o sistema. Um atacante externo não usa o Monitor-Pfsense como canal para “invadir” o pfSense só porque o agente está instalado.

---

## 2. Onde estão os riscos hoje

### 2.1 Comprometimento do servidor (controlador)

Se o **servidor** for invadido:

- **Base de dados:** os `node_secret` estão **criptografados em repouso** (AES-256-GCM). Quem só tiver o dump do banco não obtém os segredos em claro sem a chave (`NODE_SECRET_ENCRYPTION_KEY_BASE64`).
- **Servidor completo (app + env):** com acesso ao processo da API e às variáveis de ambiente, o atacante pode descriptografar os segredos e **impersonar** qualquer node (enviar heartbeats falsos em nome do firewall). Isso **não** abre uma conexão do atacante “para dentro” do pfSense: o firewall continua só fazendo requisições de saída.
- **Efeito nos clientes:** dados falsos no painel (status, métricas), possível confusão operacional. **Não** é execução de código remoto no firewall nem “invasão” do cliente via este canal, porque o servidor não envia comandos ao agente.

### 2.2 Roubo do segredo de um node

Se o **node_secret** de um firewall vazar (ex.: log, backup do config do agente, engenharia social):

- Alguém pode enviar heartbeats **em nome desse node** para o controlador (dados falsos, status errado).
- O atacante **não** ganha acesso ao pfSense por isso: ele só “fala” com o servidor, não com o firewall. O firewall não recebe conexões do atacante.
- Mitigação: **Rekey** no painel invalida o segredo antigo; o agente passa a usar o novo. Quem só tem o segredo antigo deixa de conseguir autenticar.

### 2.3 Homem no meio (MITM)

- Todo o tráfego agente ↔ servidor deve ser **HTTPS** (TLS). O domínio do MVP usa Cloudflare e proxy reverso com TLS até a origem.
- Se o TLS for quebrado ou desabilitado, um MITM pode ver ou alterar payloads (ex.: heartbeat). Por isso **HTTPS é obrigatório** em produção.

### 2.4 Código malicioso no agente ou no package

- Se o **código** do agente ou do package pfSense for alterado (repositório comprometido, build malicioso), aí sim o **próprio código** no firewall pode ser usado para invasão ou backdoor.
- Mitigação: releases versionados, checksum (ex.: SHA256) na instalação, e preferência por artefatos assinados ou de fonte confiável. O script de instalação já valida o SHA256 do artefato.

---

## 3. Se no futuro existir “servidor manda comando para o agente”

Hoje **não** existe canal servidor → agente. Se for introduzido (ex.: **polling de comandos** pelo agente):

- O agente passaria a **executar** ordens vindas do servidor (ex.: “rodar sync”, “verificar atualização”).
- **Novo risco:** se o **servidor** for comprometido, o atacante pode colocar **comandos maliciosos** na fila; quando o agente buscar e executar, o impacto pode ser invasão ou abuso do firewall.

**Para reduzir esse risco:**

1. **Lista restrita de comandos:** o agente só reconhece verbos fixos (ex.: `run_sync`, `check_update`). Nenhum “execute este script” ou payload arbitrário.
2. **Sem código arbitrário:** o corpo do comando não carrega shell script nem binário; no máximo parâmetros limitados (ex.: versão desejada).
3. **Servidor bem endurecido:** controle de acesso, auditoria, atualizações, segregação de rede, para dificultar comprometimento.
4. **Integridade da fila (opcional):** em cenários de maior paranoia, só processos/serviços autorizados poderiam enfileirar comandos (ex.: assinatura ou canal interno), reduzindo o impacto de um único ponto comprometido.

Assim, mesmo com “update pelo servidor para o cliente”, o desenho pode ser feito de forma a **não** abrir porta no cliente e a **limitar** o que o agente executa, reduzindo o risco de invasão dos clientes.

---

## 4. Respostas diretas

| Pergunta | Resposta |
|----------|----------|
| O Monitor-Pfsense abre alguma porta no firewall do cliente? | Não. Só tráfego de **saída** do pfSense em direção ao controlador. |
| O servidor pode “invadir” o pfSense hoje? | Não. Não há canal servidor → agente; o servidor não envia comandos. |
| Se o servidor for invadido, o atacante invade os firewalls? | Com a arquitetura atual, não. No máximo impersona nodes (heartbeats falsos). Se no futuro houver comandos, o risco aumenta e precisa ser mitigado (comandos restritos, sem código arbitrário). |
| Onde está o segredo do node? | No servidor: criptografado no banco (AES-256-GCM), chave no env. No pfSense: em config do agente (ex.: `/usr/local/etc/monitor-pfsense-agent.conf`). Quem tem o segredo pode falar com a API em nome do node. |
| Posso “mandar update” do servidor para o agente hoje? | Não. Não existe esse canal. Se for implementado (ex.: polling de comandos), o desenho deve seguir as práticas da seção 3 para não aumentar o risco de invasão nos clientes. |

---

## 5. Boas práticas operacionais

- Manter **HTTPS** e TLS em todo o percurso (navegador, agente, API).
- **Rekey** se houver suspeita de vazamento do node_secret.
- Manter **NODE_SECRET_ENCRYPTION_KEY_BASE64** fora do repositório e com acesso restrito; rotação exige reprovisionar ou recriptografar segredos.
- Restringir acesso administrativo ao painel e à API (RBAC, senhas fortes, 2FA se disponível).
- Validar checksum (SHA256) na instalação/atualização do agente ou package.
- Monitorar e auditar acessos e alterações sensíveis (já há trilha em `audit_logs`).

---

*Última atualização: 2026-03-15 — arquitetura apenas push (agente → servidor); sem canal servidor → agente.*
