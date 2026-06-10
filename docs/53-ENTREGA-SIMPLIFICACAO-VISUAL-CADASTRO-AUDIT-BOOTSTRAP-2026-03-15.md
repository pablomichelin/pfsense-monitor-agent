# Entrega: Microtrilha de Simplificação Visual — Cadastro, Auditoria e Instalação

**Data:** 2026-03-15  
**Status:** Implementado e documentado  
**Versões:** Painel 0.1.11, API 0.1.3 (inalterada), Package 0.2.0 (inalterado)

---

## 1. Resumo executivo

Microtrilha de simplificação de UX/UI operacional do portal, sem reabrir trilhas encerradas e sem alterar heartbeat, package, ingest ou fluxo técnico já estabilizado. Foco em: (1) Cadastro — superfície principal apenas Novo cliente e Novo firewall; (2) Auditoria — lista compacta e payload sob demanda; (3) Instalação — layout equilibrado e filtros compactos.

---

## 2. Escopo implementado

### 2.1 Cadastro (/admin)

| Decisão | Implementação |
|--------|----------------|
| Tela principal com apenas **Novo cliente** e **Novo firewall** | Grid principal em 2 colunas (sm:grid-cols-2) com só esses dois cards. |
| Remover "Novo site" da superfície principal | Mantido em **Cadastros avançados** (modelagem de Site intacta; regra 0/1/2+ sites inalterada). |
| Remover "Novo usuário" e "Token do agente" da superfície principal | Movidos para a seção **Cadastros avançados**, no mesmo bloco que "Novo site". |
| Reduzir altura e "parede de cadastro" | Hero com 2 stats (Clientes, Firewalls); descrição curta; atalhos em linha mais compacta (rounded-md, text-xs, py-1.5). |
| Não quebrar regras consolidadas | CreateNode com client_id/site_id e regra 0/1/2+ sites não alteradas; redirects ?section= continuam funcionando. |

- **Hero:** stats reduzidas para Clientes e Firewalls; descrição: "Novo cliente e novo firewall. Opcoes avancadas (site, usuario, token) abaixo."
- **Atalhos:** mesma linha, tamanho menor (text-xs, padding reduzido).
- **AdminCadastroCards:** grid principal 2 cards; seção "Cadastros avancados" com 3 cards (Novo site, Novo usuario, Token do agente) em sm:grid-cols-2 xl:grid-cols-3.

### 2.2 Auditoria (/audit)

| Decisão | Implementação |
|--------|----------------|
| Lista/timeline compacta | Cada evento em uma linha compacta (py-2.5 px-3), menos altura por item. |
| Payload JSON não expandido por padrão | Detalhes (metadata_json) exibidos só ao clicar em "Detalhes"; botão "Ocultar" recolhe. |
| Priorizar ação, tipo, ator, alvo, data/hora | Linha única com badges action + target_type, ator, alvo (truncado), data/hora e botão Detalhes. |
| Filtros compactos | Form em uma linha (flex-wrap), inputs menores (rounded-lg, py-2), uma stat no hero (Eventos). |

- **AuditEventRow (client component):** linha compacta com action, target_type, actor, target_id, created_at e botão "Detalhes" para expandir payload.
- **Hero:** uma stat (Eventos); descrição: "Historico compacto de acoes. Detalhes (payload) sob demanda."

### 2.3 Instalação (/bootstrap)

| Decisão | Implementação |
|--------|----------------|
| Layout equilibrado (não "gigante para a direita") | Grids alterados de xl:grid-cols-[0.9fr_1.1fr], [1.1fr_0.9fr], [1.2fr_0.8fr] para **md:grid-cols-2** (1fr 1fr). |
| Filtros compactos | Altura h-11 → h-9; padding p-5 → p-3; "Todos os buckets" → "Todos"; placeholder busca "Buscar"; max-w-[16rem] no search. |
| Menos vazios e proporções melhores | space-y-8 → space-y-6; títulos text-2xl → text-xl/text-lg; p-5 → p-4 nos painéis; resultSummary e blocos com menos espaço. |
| Comando de instalação preservado | Bloco de comando principal e CopyButton mantidos; fluxo operacional inalterado. |

---

## 3. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `apps/web/app/admin/page.tsx` | Hero com 2 stats e descrição curta; atalhos compactos; remoção de getUsersList. |
| `apps/web/components/admin-cadastro-cards.tsx` | Grid principal só 2 cards (Novo cliente, Novo firewall); Novo site, Novo usuário e Token do agente na seção Cadastros avançados. |
| `apps/web/app/audit/page.tsx` | Uso de AuditEventRow; hero com 1 stat; filtros em linha compacta; sem payload visível por padrão. |
| `apps/web/components/audit-event-row.tsx` | **Novo** — linha compacta por evento; botão Detalhes/Ocultar para metadata_json. |
| `apps/web/app/bootstrap/page.tsx` | Grids md:grid-cols-2; filtros compactos (h-9, p-3); space-y-6; títulos e painéis com menos padding. |
| `apps/web/package.json` | 0.1.10 → 0.1.11 |
| `apps/web/app/layout.tsx` | Footer v0.1.11 |

---

## 4. Versões

| Componente | Versão |
|------------|--------|
| **Painel** | 0.1.10 → **0.1.11** |
| **API** | 0.1.3 (inalterada) |
| **Package pfSense** | 0.2.0 (inalterado) |

---

## 5. Restrições respeitadas

- Nenhuma alteração em heartbeat, ingest, package ou automação homologada.
- Modelagem de Site mantida; regra client_id 0/1/2+ sites intacta.
- Smoke administrativo (GET /admin HTTP 200) continua válido; apenas mudança visual.
- Rotas /admin/usuarios e /admin/clientes-sites e atalhos preservados.
- Redirects ?section=client|node|user|agent-token|site continuam funcionando.

---

## 6. Critérios de aceitação atendidos

### Cadastro
- Tela principal mostra apenas "Novo cliente" e "Novo firewall".
- "Novo site" não aparece como card principal (está em Cadastros avançados).
- "Novo usuário" e "Token do agente" não aparecem como cards principais (estão em Cadastros avançados).
- Altura da área principal reduzida (hero + atalhos + 2 cards).
- Leitura mais simples e óbvia.

### Auditoria
- Eventos em linhas compactas.
- Payload não fica exposto por padrão; abre sob "Detalhes".
- Página menos alta e menos cansativa.

### Instalação
- Layout em colunas iguais (md:grid-cols-2).
- Sem aparência de página puxada para a direita.
- Filtros e blocos com proporções mais equilibradas.
- Fluxo mais limpo e objetivo.

---

## 7. Validação

- `npm run build` em `apps/web` concluído com sucesso.
- Rotas /admin, /audit e /bootstrap geradas; sem alteração de contrato de API.
- Nenhuma alteração em apps/api, package pfSense ou scripts de smoke além do que já existia.

---

## 8. Documentos a atualizar

- `00_inicio.md` — registrar trilha e versão 0.1.11.
- `LEITURA-INICIAL.md` — última entrega e notas.
- `00-README.md` — índice e entrada para doc 53.

---

## 9. Referências

- docs/47 (simplificação cadastro Cliente+Firewall)
- docs/48, 49 (desmembramento interface admin)
- docs/50, 51 (polimento cadastro inicial)
- docs/52 (alinhamento smoke admin)
- CORTEX.md, 00_inicio.md
