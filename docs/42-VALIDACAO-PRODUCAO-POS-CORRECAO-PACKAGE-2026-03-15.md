# Validação Produção — Pós-Correção do Fluxo Package

**Data:** 2026-03-15  
**Objetivo:** Confirmar em produção que a correção do desalinhamento (doc 41) está refletida corretamente.

---

## 1. Resumo executivo

A validação no ambiente real de produção foi concluída com sucesso. O container da API possui as variáveis `PACKAGE_RELEASE_*` corretas, o endpoint `bootstrap-command` retorna `package_command` preenchido e o script `verify-bootstrap-release.sh` passa em modo package contra a produção.

**Confirmação:** Produção está **alinhada** com a correção documentada no doc 41.

---

## 2. Valores confirmados de `PACKAGE_RELEASE_*`

Verificação via `docker exec monitor-pfsense-api-1 env`:

| Variável | Valor |
|----------|-------|
| **PACKAGE_RELEASE_VERSION** | `0.2.0` |
| **PACKAGE_RELEASE_SHA256** | `62260cc8a2689b09720e3a8858fa398e857ceff03063de31a600e6d21d0c31bb` |
| **PACKAGE_RELEASE_REPO_RAW_BASE** | `https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main` |

---

## 3. Resultado do endpoint bootstrap-command

**URL:** `https://pfs-monitor.systemup.inf.br/api/v1/admin/nodes/61d6ae1c-1ee7-478c-ab35-ac3258aa2d6d/bootstrap-command`  
**Node:** lasalle-agro

| Campo | Valor |
|-------|-------|
| **package_command** | **PRESENTE** (769 chars) |
| **command** | null |
| **node_uid** | lasalle-agro |

O `package_command` contém o comando one-shot completo com:
- `install-from-release.sh`
- `monitor-pfsense-package-v0.2.0.tar.gz`
- SHA256, controller-url, node-uid, node-secret, customer-code

---

## 4. Confirmação de alinhamento

| Verificação | Resultado |
|-------------|-----------|
| Variáveis PACKAGE_RELEASE_* no container | OK |
| package_command preenchido | OK |
| verify-bootstrap-release.sh em produção | OK (modo package) |
| Artefato e installer acessíveis | OK |

**Conclusão:** Produção está alinhada com a correção do doc 41.

---

## 5. Divergências

Nenhuma.

---

## 6. Comandos executados

```bash
# 1. Healthz
curl -skS "https://pfs-monitor.systemup.inf.br/healthz"

# 2. Env vars no container
docker exec monitor-pfsense-api-1 env | grep PACKAGE_RELEASE_

# 3. Bootstrap em produção
BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/verify-bootstrap-release.sh 61d6ae1c-1ee7-478c-ab35-ac3258aa2d6d
```

---

## 7. Referências

- docs/41-CORRECAO-DESALINHAMENTO-FLUXO-PACKAGE-2026-03-15.md
- docs/40-VALIDACAO-PFSENSE-REAL-LASALLE-AGRO-2026-03-15.md
