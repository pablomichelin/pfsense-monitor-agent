# Simplificação do Modelo Operacional de Cadastro — Cliente e Firewall

**Data:** 2026-03-15  
**Status:** Implementado, documentado e **encerrado**  
**Versões:** Painel 0.1.8, API 0.1.3, Package 0.2.0 (inalterado)

---

## 1. Resumo executivo

Trilha para simplificar o fluxo de cadastro: o usuário opera principalmente em **Cliente** e **Firewall**. Site permanece na modelagem e no banco, mas deixa de ser etapa principal obrigatória na interface. Regra segura de associação: quando apenas `client_id` é enviado, o backend usa ou cria um único site; quando o cliente tem múltiplos sites, exige seleção explícita de site.

---

## 2. Decisões registradas

| Decisão | Descrição |
|--------|-----------|
| **Manter Site na modelagem** | Site não foi removido do banco nem da arquitetura. Node continua com FK para Site; Client → Site → Node permanece. |
| **Rebaixar Site na UX principal** | Site deixa de ser etapa principal visível. "Novo site" foi movido para a seção **Cadastros avancados**. No fluxo "Novo firewall", o usuário escolhe **Cliente**; o site é resolvido automaticamente quando há 0 ou 1 site, ou exibido quando há 2+ sites. |
| **Regra segura de associação** | Não usar "primeiro site" arbitrário. Ver seção 3. |
| **Compatibilidade** | CreateNode continua aceitando `site_id`; chamadas existentes que enviam `site_id` seguem funcionando. |

---

## 3. Regra segura de associação (createNode)

O endpoint `POST /api/v1/admin/nodes` aceita **um** dos seguintes parâmetros:

- **`site_id`** — comportamento atual: valida o site e cria o node nesse site.
- **`client_id`** — regra por quantidade de sites do cliente:

| Situação | Comportamento |
|----------|----------------|
| Cliente com **0 sites** | Cria um site default (nome "Principal", code único) e associa o node a esse site. |
| Cliente com **1 site** | Usa esse site para o node. |
| Cliente com **2+ sites** | **Não** escolhe automaticamente. Retorna `400 Bad Request` com mensagem orientando a enviar `site_id` para escolher o site. |

Não é permitido usar "primeiro site" ou associar a qualquer site existente sem critério quando o cliente tem múltiplos sites.

---

## 4. Comportamento no frontend

- **Novo firewall (fluxo principal):**
  - Campo principal: **Cliente** (obrigatório).
  - Se o cliente tiver **0 ou 1 site:** não exibe seletor de site; envia apenas `client_id`. O backend usa ou cria o site.
  - Se o cliente tiver **mais de um site:** exibe seletor **Site** (obrigatório) e envia `site_id` no submit.
- **Novo site:** movido para a seção **Cadastros avancados**, fora do protagonismo da tela principal.
- **Editar clientes / Editar sites:** mantidos; filtros por cliente e site em listagens permanecem.

---

## 5. API

- **CreateNodeDto:** `site_id` e `client_id` opcionais. Validação no service: exatamente um dos dois deve ser informado; caso contrário, `400 Bad Request`.
- **createNode (AdminService):** resolve `siteId` conforme a regra acima; cria o node com esse `siteId`. Compatível com chamadas que enviam apenas `site_id`.

---

## 6. Arquivos alterados

| Arquivo | Alteração |
|---------|------------|
| `apps/api/src/admin/dto/create-node.dto.ts` | `site_id` e `client_id` opcionais. |
| `apps/api/src/admin/admin.service.ts` | `BadRequestException`; createNode com regra 0/1/2+ sites; get-or-create site default quando 0 sites. |
| `apps/api/package.json` | 0.1.2 → 0.1.3 |
| `apps/web/lib/api.ts` | createNode aceita `site_id?` e `client_id?`. |
| `apps/web/lib/admin.ts` | createNodeAction envia `site_id` ou `client_id` conforme o form. |
| `apps/web/components/create-node-form.tsx` | **Novo** — formulário com select Cliente; exibe Site apenas quando o cliente tem 2+ sites. |
| `apps/web/app/admin/page.tsx` | Card "Novo firewall" usa CreateNodeForm; "Novo site" movido para seção "Cadastros avancados". |
| `apps/web/package.json` | 0.1.7 → 0.1.8 |
| `apps/web/app/layout.tsx` | Footer v0.1.8 |

---

## 7. Validação

1. **Cliente sem site:** cadastrar firewall só com cliente; sistema cria site default; node associado ao site criado.
2. **Cliente com 1 site:** cadastrar firewall só com cliente; sistema usa o site existente.
3. **Cliente com múltiplos sites:** frontend exige escolha de site; backend não escolhe automaticamente; associação correta.
4. **Compatibilidade:** createNode com `site_id` (fluxo antigo) continua funcionando.
5. **Interface:** fluxo principal com Cliente + Firewall; "Novo site" em Cadastros avancados.

---

## 8. Referências

- `00_inicio.md` — ponto de continuidade; secao Trilhas encerradas
- `LEITURA-INICIAL.md` — ultima entrega e notas para proximo chat
- `00-README.md` — indice e status do projeto
- `CORTEX.md` — regras do projeto
- `docs/46-DESPOLUICAO-VISUAL-DASHBOARD-OPERACIONAL-2026-03-15.md` — trilha anterior (dashboard)

---

## 9. Encerramento da trilha

Esta trilha está **formalmente encerrada**. Não reabrir sem decisão explícita.

**Resumo para continuidade:**

- **Versões vigentes:** Painel 0.1.8, API 0.1.3, Package 0.2.0.
- **Cadastro principal:** fluxo Cliente + Firewall; "Novo site" em Cadastros avancados.
- **Regra de associação:** `client_id` → 0 sites (cria default), 1 site (usa), 2+ sites (exige `site_id`). `site_id` → comportamento legado mantido.
- **Coerência:** Site permanece na modelagem e no banco; apenas a UX foi simplificada.
