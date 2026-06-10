# Evidências Visuais — Onda 1 Simplificação

**Data da coleta:** 2026-03-15  
**Versão em execução:** 0.1.2  
**Escopo:** Aprovação da Onda 1 com evidências objetivas

---

## 1. Confirmação do ambiente em execução

| Item | Valor |
|------|-------|
| **Timestamp da coleta** | 2026-03-15 (horário local do servidor) |
| **Imagem web** | `monitor-pfsense-web:latest` (build 2026-03-14 21:06) |
| **Containers ativos** | monitor-pfsense-web-1, monitor-pfsense-api-1, monitor-pfsense-nginx-1, monitor-pfsense-db-1 |
| **Porta** | 8088 |
| **Versão declarada no código** | 0.1.2 (`package.json`, footer em `layout.tsx`) |

O ambiente mostrado nas evidências é o que está rodando agora (Docker Compose, imagem web recém-buildada).

---

## 2. Evidências por tela

### 2.1 Login

| Verificação | Resultado |
|-------------|-----------|
| "Entrar no painel" presente | ✅ Sim |
| "Autenticacao administrativa do controlador" presente | ✅ Sim |
| Stats "Sessão", "Cookie", "Autoridade" no HTML | ❌ 0 ocorrências (removidos) |
| Seção "Controle de acesso" com 3 cards técnicos | ❌ 0 ocorrências (removida) |
| Footer "Monitor-Pfsense v0.1.2" | ✅ Presente |
| Formulário único (Email, Senha, Entrar) | ✅ Presente |

**Estrutura observada:** PageHero com "Entrar no painel" + formulário "Acesso ao painel" — layout simplificado conforme Onda 1.

---

### 2.2 Sessions (autenticado como admin/superadmin)

| Verificação | Resultado |
|-------------|-----------|
| Cards duplicados (Total, Ativas, Revogadas) — classe `min-h-28` | ❌ 0 ocorrências (removidos) |
| Item "Auditoria" no menu/nav | ✅ Presente (2 ocorrências no HTML) |
| PageHero + lista de sessões | ✅ Mantidos |

**Estrutura observada:** Sem os 3 cards de KPIs duplicados; menu inclui Auditoria para admin.

---

### 2.3 Alertas (autenticado)

| Verificação | Resultado |
|-------------|-----------|
| Botão "Reconhecer" (tradução de Acknowledge) | ✅ Presente (8 ocorrências) |
| SummaryCards Critical/Warning/Info (grid `xl:grid-cols-6`) | ❌ 0 ocorrências (removidos) |
| Cards por status (Open, Acknowledged, Resolved) | ✅ Mantidos |

**Estrutura observada:** Tradução aplicada; os 3 SummaryCards de severidade foram removidos; filtros por status mantidos.

---

### 2.4 Menu/header (com admin)

| Verificação | Resultado |
|-------------|-----------|
| Item "Auditoria" no nav | ✅ Visível para admin/superadmin |
| Dashboard, Firewalls, Alertas, Instalação, Minha conta, Cadastro | ✅ Mantidos |

---

## 3. Ajustes finos pós-build

Nenhum ajuste fino adicional foi aplicado após o build e o redeploy. O estado das telas reflete exatamente o código da Onda 1.

---

## 4. Divergências entre código e ambiente

| Item | Status |
|------|--------|
| Versão 0.1.2 no footer | Código e ambiente iguais |
| Login simplificado | Código e ambiente iguais |
| Sessions sem 3 cards | Código e ambiente iguais |
| Alertas: Reconhecer + sem SummaryCards | Código e ambiente iguais |
| Menu com Auditoria | Código e ambiente iguais |

**Nenhuma divergência identificada.** O ambiente em execução corresponde ao código da Onda 1.

---

## 5. Nota sobre screenshots

Os screenshots automáticos (Playwright) não foram gerados devido à ausência de `libnspr4.so` no ambiente. As evidências acima foram obtidas via:

- `curl` nas páginas `/login`, `/sessions`, `/alerts`
- Grep no HTML renderizado para elementos removidos vs. presentes
- Confirmação da imagem Docker e versão no footer

Para aprovação visual manual, recomenda-se acessar o painel em `http://HOST:8088` e validar as telas diretamente.

---

## 6. Conclusão

- Evidências objetivas confirmam que a Onda 1 está implementada e em execução.
- O ambiente exibido é o que está rodando agora.
- Não há divergências entre código e ambiente.
- Aprovação da Onda 1 pode ser concluída com base neste documento.
