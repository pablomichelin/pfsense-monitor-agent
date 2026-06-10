# Cadastro de firewalls e comandos para o pfSense

Documento operacional do módulo de cadastro (cliente, site, firewall) e da geração dos comandos de instalação e teste no pfSense. Comportamento descrito com base no sistema atual.

---

## 1. Objetivo do módulo de cadastro

- Permitir cadastrar **clientes**, **sites** e **firewalls** (nodes) no controlador.
- Gerar **identificadores técnicos** (códigos e `node_uid`) de forma automática na primeira implantação, evitando redundância.
- Fornecer por firewall o **comando de instalação** do agente (one-shot) e os **comandos de teste/validação** para executar no pfSense.

---

## 2. Fluxo de cadastro

1. **Cliente** — Em **Admin > Novo cliente**: informe o **nome**. O código técnico do cliente é gerado automaticamente no servidor (ex.: "Amazon Xxe" → `AMAZON-XXE`). Não é necessário preencher código na criação.
2. **Site** — Em **Admin > Novo site**: selecione o **cliente**, informe o **nome** e, se quiser, cidade, estado e fuso. O código técnico do site é gerado automaticamente (único por cliente).
3. **Firewall** — Em **Admin > Novo firewall**: selecione o **site**, informe o **hostname** (obrigatório) e, opcionalmente, nome exibido, IPs e versão do pfSense. O **node_uid** é gerado automaticamente a partir do hostname (ex.: `fw-amazon-01` → `fw-amazon-01`). Após criar, o sistema abre a página do firewall com foco na instalação do agente.

Ordem recomendada: primeiro cliente, depois site(s), depois firewall(s).

---

## 3. Campos e finalidade

### Cliente (criação)
| Campo   | Obrigatório | Finalidade |
|--------|-------------|------------|
| Nome   | Sim         | Nome da organização; base para gerar o código técnico no backend. |

### Site (criação)
| Campo     | Obrigatório | Finalidade |
|-----------|-------------|------------|
| Cliente   | Sim         | Vincula o site ao cliente. |
| Nome      | Sim         | Nome do site; base para gerar o código técnico no backend. |
| Cidade/Estado/Fuso | Não  | Metadados operacionais. |

### Firewall (criação)
| Campo            | Obrigatório | Finalidade |
|------------------|-------------|------------|
| Site             | Sim         | Vincula o firewall ao site. |
| Hostname         | Sim         | Identificador do equipamento; **origem do node_uid** gerado no backend (slug único). |
| Nome exibido     | Não         | Nome mostrado no painel (se vazio, usa hostname). |
| IP interno / WAN | Não         | Metadados; o agente pode reportar IPs depois. |
| Versão pfSense   | Não         | Metadado; o agente reporta a versão no heartbeat. |
| Manutenção       | Não         | Se marcado, o node nasce em maintenance mode. |

Na **edição** do firewall constam ainda: versão do agente, papel HA — em geral preenchidos ou atualizados pelo próprio agente ou pelo operador.

---

## 4. Como o comando do pfSense é gerado

- O comando é montado no **backend** (API) ao ser solicitado o **bootstrap-command** do node (`GET /api/v1/admin/nodes/:id/bootstrap-command`).
- O painel (página do firewall e rota `/bootstrap`) chama essa API e exibe o comando na tela.
- O comando usa sempre os dados **reais** do node cadastrado: **node_uid**, **node_secret** (ativo), **customer_code** (código do cliente), **controller_url** e, para o pacote, a **versão** e **SHA256** do artefato configurados no servidor (variáveis de ambiente no `.env.api`: `PACKAGE_RELEASE_VERSION`, `PACKAGE_RELEASE_SHA256`, `PACKAGE_RELEASE_REPO_RAW_BASE`).
- Se essas variáveis estiverem configuradas, o sistema mostra o **comando do pacote** (one-shot com `nohup` e instalação em segundo plano). Caso contrário, pode aparecer apenas o comando do agente legado ou a mensagem de que o comando automático ainda não está disponível.
- Após **rotacionar o secret** do agente na página do firewall, a página é recarregada e o comando exibido é atualizado com o novo secret.

---

## 5. Onde copiar e colar o comando no pfSense

- **Onde:** **Diagnostics > Command Prompt** na interface web do pfSense.
- **O quê:** o **comando principal** exibido na seção "Instalar agente" na página do firewall (ou na rota `/bootstrap` ao selecionar o node).
- **Como:** copie o bloco inteiro (uma linha), cole no Command Prompt e execute. A linha retorna na hora com a mensagem de que a instalação segue em segundo plano; o log pode ser acompanhado com `tail -f /tmp/monitor-install.log`.
- Em 1–2 minutos o firewall deve aparecer **online** no painel, com heartbeats a cada 30 segundos.

---

## 6. Comandos de teste e validação no pfSense

Estes comandos devem ser executados no **Diagnostics > Command Prompt** do pfSense.

### 6.1 Pré-instalação (pre-check)

Antes de rodar o comando de instalação, pode-se validar versão, DNS e conectividade:

| Comando / ação | Finalidade | Interpretação esperada |
|----------------|------------|-------------------------|
| `cat /etc/version` | Ver versão do pfSense. | Saída com versão (ex.: 2.8.1). |
| `drill <hostname>` | Testar resolução DNS dos hostnames usados na instalação (controlador, repositório). | Resposta com IP(s). |
| `fetch -qo /tmp/... 'URL'` | Testar acesso HTTP/HTTPS ao controlador (healthz) e às URLs do instalador/artefato. | Arquivo gravado sem erro. |

O painel exibe um bloco **Pre-check no pfSense** (na seção avançada do firewall) com comandos prontos para o controller_url e URLs do release.

### 6.2 Pós-instalação (verificação rápida)

Após instalar o agente, execute na ordem (no Command Prompt):

| Comando | Finalidade | Interpretação esperada |
|---------|------------|-------------------------|
| `service monitor_pfsense_agent status` | Ver se o serviço do agente está rodando. | "monitor_pfsense_agent is running." |
| `/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh print-config` | Ver config carregada (sem mostrar o secret). | Saída com controller_url, node_uid, customer_code, etc. |
| `/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh test-connection` | Testar autenticação com o controlador (sem gravar heartbeat). | "connection validated" ou similar de sucesso. |
| `/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh heartbeat` | Enviar um heartbeat manual. | Resposta HTTP 2xx. |
| `tail -n 50 /var/log/monitor-pfsense-agent.log` | Ver as últimas linhas do log do agente. | Log sem erros críticos. |

Esses comandos estão reunidos no bloco **Verificação rápida** na página do firewall.

### 6.3 Habilitar e iniciar o serviço (se instalou sem --enable)

Se a instalação foi feita sem iniciar o serviço automaticamente:

```bash
/usr/sbin/sysrc monitor_pfsense_agent_enable=YES
/usr/sbin/service monitor_pfsense_agent start
```

Confirme: `service monitor_pfsense_agent status`.

---

## 7. Limitações atuais

- O comando automático (pacote) depende das variáveis de ambiente do servidor (`PACKAGE_RELEASE_VERSION`, `PACKAGE_RELEASE_SHA256`, `PACKAGE_RELEASE_REPO_RAW_BASE`). Se não estiverem configuradas, o painel não exibirá o comando one-shot do pacote.
- O **node_uid** é definido na criação do node (a partir do hostname) e não é alterado ao editar o hostname depois.
- Códigos de cliente e site podem ser editados na tela de edição; alterações manuais podem, em tese, gerar duplicidade ou inconsistência — recomenda-se evitar alterar códigos sem necessidade.

---

## 8. Observações de segurança

- O **node_secret** é exibido apenas para usuários com perfil que permite gestão do node (admin/superadmin). Demais usuários veem apenas o **secret_hint**.
- O comando de instalação contém o secret em texto; deve ser usado apenas no pfSense correto e não compartilhado.
- Após rotacionar o secret no painel, é necessário reinstalar ou reconfigurar o agente no pfSense com o novo comando gerado.
- Comunicação com o controlador deve ser em HTTPS; o agente usa assinatura HMAC para autenticação.

---

## 9. Evitar duplicidade de cadastro

- **Um firewall físico = um node:** não cadastrar o mesmo equipamento duas vezes (dois nodes) para evitar dois conjuntos de credenciais e confusão no painel.
- **Códigos de cliente/site:** na criação, deixar o sistema gerar os códigos. Na edição, alterar **code** somente quando houver motivo claro (ex.: padronização); verificar se não haverá conflito com outro cliente/site.
- **Hostname:** usar um hostname estável e único por firewall; o **node_uid** derivado dele identifica o node de forma única no controlador.

---

## 10. Referências

- **Instalação do agente (procedimento completo):** `docs/INSTALACAO-AGENTE-PFSENSE.md`
- **Comando e artefatos no servidor:** `docs/COMANDO-ATUALIZAR-PACKAGE-PFSENSE.md`
- **Diagnóstico técnico cadastro/comandos:** `docs/22-diagnostico-cadastro-e-comandos-2026-03-14.md`
- **Checklist de homologação em pfSense real:** `17-checklist-homologacao-bootstrap-pfsense-real.md`
