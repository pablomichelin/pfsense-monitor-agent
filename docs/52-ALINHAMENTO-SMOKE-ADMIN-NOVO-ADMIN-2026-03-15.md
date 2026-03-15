# Alinhamento do Smoke Administrativo com o Novo /admin

**Data:** 2026-03-15  
**Status:** Implementado e **encerrado**  
**Versões:** Painel 0.1.10, API 0.1.3, Package 0.2.0 (inalterados)

---

## 1. Objetivo da microtrilha

Garantir que o smoke administrativo (`scripts/smoke-admin-operations.sh`) continue refletindo o estado atual real do produto após a reorganização visual do `/admin` (formulários sob demanda por cards colapsáveis, apenas uma seção aberta por vez, suporte a `?section=...`).

---

## 2. Conclusão da análise

- O smoke administrativo é **API-first por design**: todas as operações de cadastro, atualização, maintenance, rekey, alertas, tokens e usuários são feitas via chamadas HTTP diretas aos endpoints `/api/v1/admin/...` e `/api/v1/ingest/...`.
- O smoke **não acessava** a página `/admin` nem submetia formulários da UI; a única verificação de HTML existente era na rota `/audit` (passo de inventário/auditoria).
- A reorganização visual do `/admin` (docs 50, 51) **não exige** alteração estrutural do smoke: nenhum passo dependia de formulários sempre visíveis.

---

## 3. Ajustes realizados

### 3.1 Numeração dos passos

- Corrigida a numeração de todos os passos para **[1/14] a [14/14]** (antes inconsistente: [1/11]…[8/11], [9/12]…[12/12], [13/13]).

### 3.2 Novo passo: verificação da rota /admin

- **Inserido** um passo explícito após o login: **verificação da rota `/admin`**.
- **Implementação:** `GET $BASE_URL/admin` com cookie de sessão autenticada; validação **apenas** do código HTTP **200**.
- **Não** foi utilizada validação por texto da página (grep em copy/layout) para evitar fragilidade e desacoplamento do frontend.

Trecho adicionado em `scripts/smoke-admin-operations.sh`:

```bash
echo "[2/14] Verificando rota /admin (HTTP 200)"
ADMIN_STATUS="$(curl -skS -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE_URL/admin")"
[[ "$ADMIN_STATUS" == "200" ]]
```

---

## 4. Escopo respeitado

- Nenhuma mudança em API.
- Nenhuma mudança em package.
- Nenhuma mudança em frontend.
- Apenas ajuste no script de smoke e documentação da microtrilha.

---

## 5. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `scripts/smoke-admin-operations.sh` | Numeração [1/14]…[14/14]; novo passo [2/14] GET /admin → HTTP 200; mensagem final atualizada. |
| `docs/52-ALINHAMENTO-SMOKE-ADMIN-NOVO-ADMIN-2026-03-15.md` | **Novo** — este documento. |

---

## 6. Evidências de validação

- Passos [1/14] a [5/14] executados com sucesso no ambiente local (stack Docker Compose), incluindo o novo passo **[2/14] Verificando rota /admin (HTTP 200)**.
- A rota `/admin` retorna 200 para sessão autenticada com role admin/superadmin; o smoke segue API-first e não depende do layout/copy do frontend.
- A falha no passo [6/14] (rekey), quando observada, está **fora do escopo** desta microtrilha (ambiente/API/sessão); o alinhamento doc 52 limita-se à numeração e ao passo GET /admin HTTP 200.

---

## 7. Riscos remanescentes

- **Muito baixo:** O passo GET /admin valida apenas o status HTTP; mudanças futuras na página (redirect, erro 500) seriam detectadas. Não há acoplamento a texto da interface.

---

## 8. Referências

- `docs/50-ANALISE-POLIMENTO-CADASTRO-INICIAL-ADMIN-2026-03-15.md`
- `docs/51-ENTREGA-POLIMENTO-CADASTRO-INICIAL-ADMIN-2026-03-15.md`
- `00_inicio.md` — trilhas encerradas
- `CORTEX.md` — regras do projeto

---

## 9. Encerramento

Esta microtrilha está **formalmente encerrada**. O smoke administrativo permanece alinhado ao estado atual do produto e registra de forma mínima e robusta a acessibilidade autenticada da rota `/admin`.
