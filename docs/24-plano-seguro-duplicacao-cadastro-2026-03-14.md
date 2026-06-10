# Plano seguro para corrigir duplicações de cadastro (2026-03-14)

## Objetivo

Definir ações pragmáticas e conservadoras para reduzir duplicação e risco operacional no cadastro (cliente, site, firewall), **preservando** compatibilidade com dados existentes e sem regressão funcional.

---

## 1. O que está duplicado ou redundante (resumo)

- **Cliente/Site:** código técnico é gerado na criação a partir do nome; na edição o campo **code** é editável. Duas origens de verdade; edição manual pode gerar códigos duplicados ou conflitantes.
- **Node:** não há duplicação de identificador (node_uid único, gerado uma vez). Muitos campos opcionais podem confundir; mitigação por documentação e, se desejado, simplificação futura da UI.

---

## 2. Impacto real por item

| Item | Impacto | Dados existentes |
|------|---------|-------------------|
| Edição de **code** (cliente/site) | Colisão se dois registros ficarem com o mesmo code; filtros e heartbeat usam code. | Qualquer cliente/site com code editado manualmente pode já existir; não podemos assumir que code = slug(name). |
| Remoção do campo code na edição | Elimina risco de colisão por edição; pode frustrar quem precisa corrigir code. | Alto: quem depende de editar code perderia a opção. |
| Validação de unicidade no update (code) | Backend rejeita alteração se o novo code já existir (cliente) ou já existir no mesmo cliente (site). | Baixo: apenas adiciona validação; não altera dados. |
| Documentação + aviso na UI (edição de code) | Reduz uso indevido sem remover funcionalidade. | Nenhum. |

---

## 3. O que pode ser removido (avaliado)

- **Nesta rodada:** **nada**. Remover campos ou opções sem período de transição e sem validação de unicidade aumentaria risco de regressão.
- **Futuro (após validação e avisos):** discutir tornar **code** somente leitura na edição, com fluxo alternativo (ex.: “solicitar alteração de código” que gera novo e migra) em etapa posterior.

---

## 4. O que deve ser mantido

- **Criação:** geração automática de **code** (cliente/site) e **node_uid** (node) a partir de name/hostname. Manter como está.
- **Edição de name, status, city, state, timezone (cliente/site):** manter.
- **Edição de todos os campos atuais do node (hostname, display_name, IPs, versões, ha_role):** manter; node_uid não é editável e não deve passar a ser.
- **Comando principal e comandos de teste:** manter formato e prioridade (package_command ?? command).

---

## 5. O que deve ser consolidado

- **Documentação:** já consolidado em `docs/CADASTRO-E-COMANDOS-PFSENSE.md` (fluxo, campos, comandos, como evitar duplicidade).
- **UI:** já consolidado na página do node (Comando principal, Comandos de teste pré/pós-instalação, botão Copiar).
- **Regra de negócio:** consolidar na próxima etapa (se desejado) a validação de unicidade de **code** no update (cliente e site), para que o backend rejeite alteração que geraria duplicata.

---

## 6. Migração sem quebrar registros existentes

- **Nenhuma migração de dados** é necessária nesta rodada. Códigos e node_uids já existentes permanecem válidos.
- Se no futuro for implementada **validação de unicidade no update**:
  - Cliente: ao atualizar, verificar se já existe outro cliente com o mesmo `code` (excluindo o próprio). Se existir, retornar 409 ou mensagem clara.
  - Site: ao atualizar, verificar se já existe outro site do **mesmo cliente** com o mesmo `code` (excluindo o próprio). Se existir, retornar 409 ou mensagem clara.
- Não alterar **node_uid** em nenhuma migração; ele é identificador estável.

---

## 7. Compatibilidade com dados já cadastrados

- Todas as alterações feitas nesta rodada são **compatíveis**: apenas documentação e organização da tela (comando principal, comandos de teste, botão copiar). Nenhum campo foi removido nem contrato de API alterado.
- Plano futuro (validação de code): **compatível** — apenas rejeita updates que criariam duplicata; dados atuais não são modificados.

---

## 8. Evitar regressão funcional

- **Testes:** rodar a suíte existente (`scripts/run-smoke-suite.sh`) após qualquer mudança em admin ou bootstrap. Inclui fluxos de create/update client, site, node, bootstrap-command, RBAC.
- **Checklist antes de alterar cadastro no futuro:** (1) Backup do banco se for mudar schema ou regras de unicidade. (2) Validar em ambiente de teste create + update de cliente/site/node. (3) Confirmar que o comando gerado para um node continua correto após mudanças.

---

## 9. Testes a executar antes de mudanças futuras (ex.: validação de code)

- Criar dois clientes com nomes que gerem códigos diferentes; editar o code do segundo para o code do primeiro → esperado: backend rejeita (após implementar validação).
- Criar dois sites no mesmo cliente; editar o code do segundo para o code do primeiro → esperado: backend rejeita (após implementar validação).
- Smoke administrativo: create client, create site, create node, get bootstrap-command, rekey, update client/site/node → todos devem passar.

---

## 10. Ações recomendadas (prioridade)

1. **Imediato (já feito):** Documentação e UI (comando principal, comandos de teste, botão copiar). Nenhuma alteração de regra de negócio.
2. **Próxima etapa (segura):** Implementar **validação de unicidade** no update de cliente e site (rejeitar alteração de code se já existir outro registro com o mesmo code). Manter o campo editável; apenas validar.
3. **Opcional (futuro):** Aviso na tela de edição de cliente/site: “Alterar o código pode causar conflito se já existir outro registro com o mesmo código. Use apenas se necessário.”
4. **Opcional (futuro):** Avaliar tornar **code** somente leitura na edição após período com validação + aviso e sem reclamações.

Este plano deve ser seguido em etapas; não fazer “refatoração por impulso” e preservar o funcionamento atual acima de tudo.
