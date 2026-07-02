# 128 — Entrega: Vault e inventário de capacidades pfSense

**Data:** 2026-07-02  
**Fase do plano 117:** Fase 10 — Vault e inventário de capacidades pfSense  
**Componentes alterados:** API, web, package/agent, docs  
**Versões antes:** API `0.6.9` · web `1.5.0` · package `0.4.9`  
**Versões depois:** API `0.7.0` · web `1.5.1` · package `0.4.9`

**Referências:** `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md` §17

---

## Escopo entregue

### Objetivo

Preparar integração futura com pfREST: inventário por firewall, cofre de credenciais cifrado, teste read-only de conexão. **Sem alteração de alias/regra/NAT/VPN nesta fase.**

### Feature flags (default seguro)

| Variável | Default |
|----------|---------|
| `NODE_CAPABILITIES_ENABLED` | `false` |
| `PFSENSE_VAULT_ENABLED` | `false` |
| `PFSENSE_VAULT_TEST_TIMEOUT_MS` | `5000` |

Agente: `MONITOR_AGENT_CAPABILITIES_ENABLED` (default `0`).

### Dados (migration `20260702200000_node_capabilities_vault`)

- `node_capabilities` — snapshot por node (pfREST instalado, versão, URL, modo, probes)
- `node_external_credentials` — segredos cifrados AES-256-GCM (mesmo `NodeSecretCryptoService`)
- `node_credential_events` — trilha created/rotated/revoked/test_*

### API

| Método | Rota | Permissão |
|--------|------|-----------|
| `GET` | `/api/v1/node-capabilities/status` | `pfsense.api.view` |
| `GET` | `/api/v1/nodes/:id/capabilities` | `pfsense.api.view` |
| `POST` | `/api/v1/nodes/:id/capabilities/credentials/pfrest` | `pfsense.credentials.manage` |
| `POST` | `/api/v1/nodes/:id/capabilities/credentials/pfrest/rotate` | `pfsense.credentials.manage` |
| `DELETE` | `/api/v1/nodes/:id/capabilities/credentials/pfrest` | `pfsense.credentials.manage` |
| `POST` | `/api/v1/nodes/:id/capabilities/credentials/pfrest/test` | `pfsense.credentials.manage` |

Heartbeat opcional `capabilities{}` quando `NODE_CAPABILITIES_ENABLED=true`.

### Package / agente

- `build_capabilities_json()` — detecta `pfSense-restapi` via `pkg`, URL base sugerida por `mgmt_ip`
- Enviado em heartbeat normal (não light) com `MONITOR_AGENT_CAPABILITIES_ENABLED=1`

### Painel web

- Seção **Capacidades pfREST** no detalhe do firewall (`NodeCapabilitiesPanel`)
- Cadastro/rotação/teste/revogação via server actions (`pfsense-capabilities-actions.ts`)
- Segredos **nunca** retornam à UI (apenas `secret_hint`)

### Testes

- `apps/api/test/node-capabilities-pfsense-api.test.mjs` — normalização capabilities, parse/compare aliases

---

## Rollback

1. `NODE_CAPABILITIES_ENABLED=false` e `PFSENSE_VAULT_ENABLED=false`
2. Agente sem `MONITOR_AGENT_CAPABILITIES_ENABLED`
3. Credenciais permanecem cifradas e inertes; nenhuma escrita no pfSense

---

## Próximo passo

**Fase 11** — Piloto pfREST read-only e aliases (`docs/129-...`).
