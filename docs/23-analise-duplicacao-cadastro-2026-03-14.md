# Análise da duplicação de cadastro (2026-03-14)

## Objetivo

Identificar campos/opções duplicados, sobrepostos ou desnecessários no cadastro (cliente, site, firewall) e pontos que podem induzir erro operacional ou cadastros inconsistentes, **sem** remover ou alterar comportamento nesta etapa.

---

## 1. Cliente

### Campos na criação
- **name** (obrigatório). Código é gerado no backend a partir do nome.

### Campos na edição
- **name**, **code** (editável), **status**.

### Análise
- **Duplicação conceitual:** o **code** deriva do **name** na criação, mas na edição o usuário pode alterar **code** independentemente. Dois clientes podem acabar com o mesmo código se alguém editar manualmente (ex.: ambos "AMAZON-XXE").
- **Redundância:** não há dois campos que signifiquem a mesma coisa; há **duas origens de verdade** para o código (auto na criação, manual na edição), o que pode gerar inconsistência.
- **Necessidade do code editável:** há casos legítimos (padronização, correção de typo no código sem mudar o nome). Remover a edição do code pode frustrar operação.
- **Risco:** alterar o code pode quebrar referências (ex.: heartbeat usa `customer_code`); o backend não impõe unicidade global no update hoje — precisa ser verificado no código (constraint no banco).

---

## 2. Site

### Campos na criação
- **client_id**, **name** (obrigatórios), **city**, **state**, **timezone**, **status** (hidden).

### Campos na edição
- **name**, **code** (editável), **city**, **state**, **timezone**, **status**.

### Análise
- Mesma situação do cliente: **code** gerado a partir de **name** na criação; na edição **code** é editável. Risco de dois sites do mesmo cliente com o mesmo código se editado manualmente.
- **Unicidade:** o código do site é único **por cliente** (buildUniqueSiteCode usa clientId). Editar o code de um site para um já existente no mesmo cliente pode causar conflito (constraint no banco).
- **Necessidade:** mesma do cliente — às vezes é útil ajustar o code sem mudar o nome.

---

## 3. Firewall (node)

### Campos na criação
- **site_id**, **hostname** (obrigatórios), **display_name**, **management_ip**, **wan_ip**, **pfsense_version**, **maintenance_mode**.

### Campos na edição (detalhe do node)
- **hostname**, **display_name**, **management_ip**, **wan_ip**, **pfsense_version**, **agent_version**, **ha_role**.

### Análise
- **node_uid:** não é exibido no formulário de criação nem na edição. É gerado uma vez a partir do hostname (slug). **Não há duplicação** de identificador; alterar hostname na edição **não** altera node_uid (correto).
- **Sobreposição hostname x display_name:**
  - **hostname:** identificador técnico; origem do node_uid; deve ser estável.
  - **display_name:** rótulo exibido no painel; opcional; pode ser igual ou diferente do hostname.
  - Não são duplicados; finalidades diferentes. Podem confundir se o operador achar que “nome exibido” é o identificador.
- **Campos opcionais no create:** management_ip, wan_ip, pfsense_version são metadados que o agente pode preencher depois. Ter esses campos no create **não** é duplicação; pode ser **poluição** se o operador achar que precisa preencher tudo. Documentar que são opcionais e que o agente atualiza depois reduz confusão.
- **agent_version, ha_role na edição:** preenchidos/atualizados pelo agente ou manualmente. Não duplicam nada; são apenas metadados adicionais.
- **Duplicação de cadastro (mesmo firewall duas vezes):** não é duplicação de campo, e sim **uso operacional**: cadastrar o mesmo equipamento como dois nodes (dois hostnames/node_uids). Isso gera dois conjuntos de credenciais e confusão no painel. Mitigação: documentação e checklist (“um firewall físico = um node”).

---

## 4. Resumo: o que está duplicado ou redundante

| Item | Tipo | Impacto |
|------|------|--------|
| Cliente/Site: **code** editável vs gerado na criação | Duas origens de verdade para o mesmo identificador | Risco de código duplicado ou inconsistente se editado sem critério. |
| Cliente/Site: exibir **code** na edição mas não na criação | Assimetria de UI | Pode confundir; não é duplicação de dado. |
| Node: muitos campos opcionais no create/edit | Poluição visual / possível confusão | Operador pode achar que tudo é obrigatório. |
| Cadastrar o mesmo firewall duas vezes (dois nodes) | Uso operacional | Duplicação de entidade, não de campo. |

---

## 5. O que não está duplicado

- **command vs package_command:** a API retorna os dois; o frontend usa `package_command ?? command`. Um só é exibido; prioridade correta.
- **node_uid:** gerado uma vez; não editável na UI; sem duplicação.
- **hostname vs display_name:** finalidades distintas; ambos úteis.

---

## 6. O que pode induzir erro operacional

- Editar **code** de cliente ou site sem verificar se já existe outro com o mesmo código (pode violar constraint ou gerar inconsistência em relatórios/filtros).
- Cadastrar o mesmo firewall duas vezes (dois nodes) e instalar o agente nos dois — dois heartbeats para o mesmo equipamento.
- Preencher **node_uid** manualmente na criação: o DTO aceita `node_uid` opcional, mas o **formulário não envia**. Se no futuro o form enviar node_uid, o backend usa; hoje não há risco.

---

## 7. Conclusão da análise

- **Duplicação crítica:** código de cliente/site editável em paralelo à geração automática na criação; risco de colisão ou inconsistência.
- **Não crítico:** muitos campos opcionais no node (melhorar com documentação e, se desejado, UI mais enxuta em etapa futura).
- **Operacional:** “um firewall = um node” e “evitar editar code sem necessidade” devem constar na documentação e no plano de correção; nenhuma remoção de campo ou alteração de comportamento foi feita nesta análise.

Próximo passo: plano seguro para corrigir duplicações (documento 24), com priorização e migração sem regressão.
