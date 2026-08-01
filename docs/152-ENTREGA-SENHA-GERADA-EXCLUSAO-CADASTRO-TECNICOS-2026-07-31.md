# 152 — Senha gerada visível + exclusão do cadastro central de técnicos

Data: `2026-07-31`

Status: **entregue** — API `0.8.5`, painel `1.8.1`

## Versões

| Componente | Versão |
|------------|--------|
| API | `0.8.5` |
| Painel web | `1.8.1` |
| Package pfSense | `0.5.2` (sem alteração) |

## O que foi implementado

### 1. Senha gerada automaticamente — exibição única

- Após provisionar ou resetar senha em lote **sem informar senha**, a API já retornava `password_display_once`.
- Painel: card destacado (borda âmbar) com a senha em fonte mono, botão **Copiar senha** e aviso de exibição única.
- Diferencia mensagem entre senha auto-gerada e senha informada pelo operador.

### 2. Remover técnico do cadastro central

| Método | Rota | Permissão | Comportamento |
|--------|------|-----------|---------------|
| `DELETE` | `/api/v1/technicians/:id` | `technicians.manage` | Soft-delete: `status = revoked` |

- **Não** remove usuário dos firewalls pfSense (offboarding continua na aba Revogar).
- Confirmação: operador digita o **login pfSense** do técnico.
- Auditoria: `technician.registry_revoke`.

### Painel web

- Coluna **Ações** na tabela de cadastro → **Remover do cadastro**.
- Painel de confirmação explica que não afeta firewalls.

## Guia operacional

### Copiar senha gerada

1. `/nodes` → Gestão de técnicos → Provisionar ou Resetar senha.
2. Deixe o campo senha vazio.
3. Execute o lote.
4. Copie a senha no card âmbar antes de fechar o resultado.

### Remover do cadastro (sem tocar firewalls)

1. Na tabela de técnicos, clique **Remover do cadastro**.
2. Digite o login pfSense exato (ex.: `joao.silva`).
3. Confirme.

Para desligar acesso nos pfSense, use a aba **Revogar** separadamente.
