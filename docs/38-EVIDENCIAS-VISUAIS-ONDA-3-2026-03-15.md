# Evidências Visuais — Onda 3 Simplificação

**Data da coleta:** 2026-03-15  
**Versão em execução:** 0.1.4  
**Escopo:** Aprovação da Onda 3 com evidências objetivas

---

## 1. Confirmação do ambiente em execução

| Item | Valor |
|------|-------|
| **Versão declarada** | 0.1.4 (package.json, footer) |
| **Porta** | 8088 |

---

## 2. Evidências por tela

### 2.1 Alertas

| Verificação | Resultado |
|-------------|-----------|
| Filtros principais: cliente, site, status, busca | ✅ Presentes |
| "Filtros de diagnostico" (AdvancedSection) | ✅ Presente |
| severity e type dentro da seção recolhível | ✅ Presentes |
| Query params preservados | ✅ Sim |

### 2.2 Bootstrap

| Verificação | Resultado |
|-------------|-----------|
| Escolha do firewall + Abrir em destaque | ✅ Mantido |
| "Overrides de homologacao" (AdvancedSection) | ✅ Presente |
| release_base_url e controller_url dentro da seção | ✅ Presentes |
| Fluxo principal intacto | ✅ Sim |

### 2.3 Detalhe do node

| Verificação | Resultado |
|-------------|-----------|
| "Campos avancados" (AdvancedSection) | ✅ Presente |
| ha_role dentro da seção | ✅ Presente |
| Formulário Editar cadastro com demais campos | ✅ Mantidos |
| Botões principais (Maintenance, Rekey, Salvar) | ✅ Preservados |

---

## 3. Conclusão

- Evidências confirmam que a Onda 3 está implementada.
- Nada além da Onda 3 foi alterado.
