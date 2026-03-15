# Evidências Visuais — Onda 2 Simplificação

**Data da coleta:** 2026-03-15  
**Versão em execução:** 0.1.3  
**Escopo:** Aprovação da Onda 2 com evidências objetivas

---

## 1. Confirmação do ambiente em execução

| Item | Valor |
|------|-------|
| **Timestamp da coleta** | 2026-03-15 (horário local do servidor) |
| **Containers ativos** | monitor-pfsense-web-1, monitor-pfsense-api-1, monitor-pfsense-nginx-1, monitor-pfsense-db-1 |
| **Porta** | 8088 |
| **Versão declarada** | 0.1.3 (package.json, footer em layout.tsx) |

---

## 2. Evidências por tela

### 2.1 Inventário (/nodes)

| Verificação | Resultado |
|-------------|-----------|
| Grid `lg:grid-cols-3` (3 cards removidos) | 0 ocorrências (removidos) |
| PageHero com Itens filtrados, Agente ativo, Bloqueados | ✅ Mantido |
| Filtros e tabela de firewalls | ✅ Mantidos |

### 2.2 Bootstrap (/bootstrap)

| Verificação | Resultado |
|-------------|-----------|
| 3 cards (Prontos, Ativos, Bloqueados) duplicados | ❌ Removidos |
| PageHero com Prontos, Ativos, Bloqueados | ✅ Mantido |
| Escopo atual + atalhos Todos/Prontos/Ativos/Bloqueados | ✅ Mantidos |
| Filas (bootstrap, agentes ativos, bloqueios) | ✅ Mantidas |

### 2.3 Dashboard

| Verificação | Resultado |
|-------------|-----------|
| 5 SummaryCards: Online, Degraded, Offline, Alertas abertos, Fora da matriz | ✅ Presentes |
| Cards Nodes e Maintenance | ❌ Removidos |
| Zona quente | ✅ Mantida |
| Matriz de versão | ✅ Mantida |

### 2.4 Admin

| Verificação | Resultado |
|-------------|-----------|
| 4 cards (Clientes, Sites, Nodes, Usuários) | ✅ Mantidos (decisão conservadora) |

---

## 3. Versão no ambiente

- Footer: `Monitor-Pfsense v0.1.3` presente no HTML do login

---

## 4. Conclusão

- Evidências confirmam que a Onda 2 está implementada e em execução.
- Onda 3 **não** foi implementada.
