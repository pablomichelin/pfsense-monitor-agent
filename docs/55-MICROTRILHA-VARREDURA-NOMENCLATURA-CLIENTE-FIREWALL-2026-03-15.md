# Microtrilha: Varredura Final de Nomenclatura — Cliente e Firewall

**Data:** 2026-03-15  
**Status:** Concluída  
**Versões:** Painel 0.1.13, API 0.1.3 (inalterada), Package 0.2.0 (inalterado)

---

## 1. Objetivo

Varredura final de nomenclatura, textos e resíduos de UX antiga para garantir que a interface e os fluxos administrativos estejam 100% alinhados ao modelo operacional atual: **Cliente** e **Firewall**, sem exposição residual de **Site**, **Clientes e sites**, labels ou referências antigas.

---

## 2. Escopo aplicado

### 2.1 Revalidação e rotas

- **lib/admin.ts:** `revalidatePath('/admin/clientes-sites')` substituído por `revalidatePath('/admin/clientes')` em `updateClientAction` e `updateSiteAction`, alinhando à rota atual.

### 2.2 Textos e opções visíveis

- **"Todos os sites":** Opção padrão do filtro por local (site_id) alterada para **"Todos"** em:
  - `/nodes` (inventário)
  - `/alerts`
  - `/bootstrap`
- **"Cliente / Site":** Label na página de alertas alterada para **"Cliente / Local"**.
- **Separador " / ":** Exibição de "Cliente / Local" e "Cliente — Local — node_uid" padronizada para **" — "** (travessão) em:
  - Dashboard (subtítulo do card do node)
  - Detalhe do node (identityLabel)
  - Inventário (opções do filtro e tabela já tinha header "Local")
  - Alertas (opções do filtro e bloco Cliente/Local)
  - Bootstrap (filtros, select de node, texto "Local:", tabela)

### 2.3 Comentário interno

- **admin-cadastro-cards.tsx:** Comentário "Cadastros avançados: Novo usuário, Token do agente (site não exposto na UX)" simplificado para "Cadastros avançados: Novo usuário, Token do agente".

---

## 3. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `apps/web/lib/admin.ts` | `revalidatePath('/admin/clientes')` em updateClientAction e updateSiteAction. |
| `apps/web/app/nodes/page.tsx` | Opção "Todos os sites" → "Todos"; opções do filtro "client_name — name". |
| `apps/web/app/alerts/page.tsx` | "Todos os sites" → "Todos"; "Cliente / Site" → "Cliente / Local"; opções "client_name — name". |
| `apps/web/app/bootstrap/page.tsx` | "Todos os sites" → "Todos"; exibições com " — " em vez de " / ". |
| `apps/web/app/dashboard/page.tsx` | Subtítulo do node: "client — site.name" com " — ". |
| `apps/web/app/nodes/[id]/page.tsx` | identityLabel com " — " entre cliente, local e node_uid. |
| `apps/web/components/admin-cadastro-cards.tsx` | Comentário da seção avançada sem menção a site. |
| `apps/web/package.json` | Versão 0.1.12 → 0.1.13. |
| `apps/web/app/layout.tsx` | Footer v0.1.13. |

---

## 4. O que não foi alterado

- **Scripts/smoke:** Nenhuma referência a "Clientes e sites" ou rota `/admin/clientes` nos scripts de smoke; continuam usando API (client/site/node). Nenhuma alteração necessária.
- **Documentação consolidada (48–54):** Mantida como registro histórico; não reescrita.
- **Backend, ingest, package, heartbeat:** Inalterados.
- **Regras de negócio do cadastro:** Inalteradas.
- **Filtro por site_id:** Mantido nas páginas (nodes, alerts, bootstrap); apenas o texto da opção padrão e labels foram ajustados para não exibir a palavra "site" ao operador. Coluna da tabela de nodes já estava como "Local".

---

## 5. Versões

| Componente | Versão |
|------------|--------|
| **Painel** | 0.1.12 → **0.1.13** |
| **API** | 0.1.3 (inalterada) |
| **Package** | 0.2.0 (inalterado) |

---

## 6. Validação

- `npm run build` em `apps/web` concluído com sucesso.
- Nenhuma regressão funcional; apenas nomenclatura e formatação visual.

---

## 7. Critérios de aceitação

- Não há resíduo visível de "Site" como ação ou label operacional na UX.
- "Clientes e sites" não aparece onde não faz sentido (menu e atalhos já estavam como "Clientes" na trilha 54).
- revalidatePath e fluxos de redirect alinhados a `/admin/clientes`.
- Documentação da microtrilha criada; 00_inicio, LEITURA-INICIAL e 00-README atualizados.

---

## 8. Referências

- `docs/54-TRILHA-MODELO-OPERACIONAL-CLIENTE-FIREWALL-2026-03-15.md`
- `00_inicio.md`, `LEITURA-INICIAL.md`, `CORTEX.md`, `00-README.md`
