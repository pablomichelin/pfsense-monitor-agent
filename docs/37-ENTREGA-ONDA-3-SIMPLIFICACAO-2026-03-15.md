# Entrega Onda 3 — Simplificação do Painel

**Data:** 2026-03-15  
**Versão:** 0.1.4  
**Escopo:** Simplificações de exposição técnica conforme matriz de decisão (docs/31-MATRIZ-DECISAO-SIMPLIFICACAO-2026-03-14.md)

---

## 1. Resumo do que foi alterado

| Item | Alteração |
|------|-----------|
| **Alertas** | Filtros `severity` e `type` movidos para AdvancedSection "Filtros de diagnostico". Barra principal mantém cliente, site, status e busca. |
| **Bootstrap** | Overrides `release_base_url` e `controller_url` movidos para AdvancedSection "Overrides de homologacao". Fluxo principal: escolher firewall + Abrir. |
| **Detalhe do node** | Campo `ha_role` movido para AdvancedSection "Campos avancados" dentro do formulário Editar cadastro. |

---

## 2. Arquivos modificados

- `apps/web/app/alerts/page.tsx` — severity/type em AdvancedSection
- `apps/web/app/bootstrap/page.tsx` — overrides em AdvancedSection
- `apps/web/app/nodes/[id]/page.tsx` — ha_role em AdvancedSection
- `apps/web/package.json` — versão 0.1.3 → 0.1.4
- `apps/web/app/layout.tsx` — versão no footer 0.1.3 → 0.1.4

---

## 3. Itens da Onda 3 concluídos

- [x] ALERTAS — severity e type em filtros avançados recolhíveis
- [x] BOOTSTRAP — overrides em área avançada
- [x] DETALHE DO NODE — ha_role em AdvancedSection

---

## 4. Comandos/build/redeploy executados

```bash
docker compose build web
docker compose up -d web
```

---

## 5. Testes executados

- smoke-frontend-assets OK
- smoke-agent-release OK
- smoke-realtime-refresh OK
- smoke-auth-sessions OK
- Verificação HTML: v0.1.4 no footer; "Filtros de diagnostico" em /alerts; "Overrides de homologacao" em /bootstrap; "Campos avancados" em /nodes/[id]

---

## 6. Resultado dos testes

- **Alertas:** Filtros principais (cliente, site, status, busca) visíveis; severity/type em seção recolhível
- **Bootstrap:** Escolha do firewall + Abrir em destaque; overrides em seção recolhível
- **Detalhe do node:** Editar cadastro com ha_role em "Campos avancados"
- **Build:** Concluído com sucesso

---

## 7. Versão/documentação atualizada

- Versão do painel: **0.1.4** (layout.tsx, package.json)
- Documento de entrega: `docs/37-ENTREGA-ONDA-3-SIMPLIFICACAO-2026-03-15.md`

---

## 8. Pendências ou riscos residuais

- Nenhum no escopo da Onda 3
- Nada além da Onda 3 foi implementado

---

## Próximo passo recomendado

- Validar manualmente as telas alteradas (alertas, bootstrap, detalhe do node)
- Confirmar que filtros avançados e overrides continuam funcionando quando expandidos
- Simplificação em ondas concluída (Ondas 1, 2 e 3)
