# 127 — Entrega: Certificados e expiração

**Data:** 2026-07-02  
**Fase do plano 117:** Fase 9 — Certificados e expiração  
**Componentes alterados:** API, web, package/agent, docs  
**Versões antes:** API `0.6.8` · web `1.4.9` · package `0.4.8`  
**Versões depois:** API `0.6.9` · web `1.5.0` · package `0.4.9` (código; release publicada permanece `0.4.7` até `release-pfsense-package.sh`)

**Referências:** `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md` §16

---

## Escopo entregue

### Objetivo

Visibilidade de certificados antes de vencerem — inventário por firewall, alertas em 30/15/7 dias, exibição no detalhe do node. **Sem renovação automática** e **sem trânsito/repouso de chaves privadas**.

### Feature flags (default seguro)

| Variável | Default |
|----------|---------|
| `CERTIFICATES_ENABLED` | `false` |
| `CERTIFICATES_MIN_AGENT_VERSION` | `0.4.9` |

Agente: `MONITOR_AGENT_CERTIFICATES_ENABLED` (default `0`).

### Contrato heartbeat (backward compatible)

Campo opcional `certificates[]` com metadados:

| Campo | Descrição |
|-------|-----------|
| `cert_key` | Identificador estável (`cert:{refid}`, `ca:{refid}`, `system:{hash}`) |
| `subject` | Subject DN |
| `issuer` | Emissor (opcional) |
| `not_before` / `not_after` | ISO8601 |
| `usage` | Descritor legível (ex.: Web GUI, OpenVPN) |

Rejeição fail-closed se payload incluir `private_key`, `key` ou `prv`.

### Backend

Migration `20260702190000_node_certificates`:

- tabela `node_certificates` (snapshot por node);
- enum `alert_type.certificate_expiring`.

Ingest (`CERTIFICATES_ENABLED=true`):

- upsert/remove snapshot por heartbeat completo;
- abre alerta no limiar mais crítico ativo (30 → 15 → 7 dias);
- resolve alertas quando certificado renovado, removido ou > 30 dias;
- heartbeat light ou ausência de `certificates` **não** altera snapshot (rollback seguro).

RBAC: leitura via `firewalls.view` no detalhe do node (`GET /api/v1/nodes/:id` inclui `certificates`).

### Package / agente (`0.4.9`)

- `build_certificates_json()` — lê `<cert>` e `<ca>` do `config.xml` + certificado Web GUI em `/var/etc/cert.pem`;
- extrai metadados via `openssl_x509_parse` (somente PEM público);
- envia em heartbeat normal (não light) quando `MONITOR_AGENT_CERTIFICATES_ENABLED=1`.

### Painel web

- Seção **Certificados** na aba Visão geral do firewall (`NodeCertificatesPanel`);
- badges de dias restantes (verde / aviso / crítico);
- filtro `certificate_expiring` em `/alerts` e regras de notificação.

### Testes

- `apps/api/test/certificate-expiration.test.mjs` — parsing, thresholds 30/15/7, rejeição de chave privada, alerta expirado/renovado.

---

## Rollback

1. `CERTIFICATES_ENABLED=false` — API ignora seção `certificates` no ingest
2. Agente com `MONITOR_AGENT_CERTIFICATES_ENABLED=0` — deixa de enviar metadados
3. Migration aditiva — dados inertes sem flag
4. Snapshot anterior preservado se agente parar de enviar seção

---

## Homologação sugerida

1. `docker compose exec -T api npx prisma migrate deploy`
2. Habilitar `CERTIFICATES_ENABLED=true` em staging
3. Package **0.4.9** no lab + `MONITOR_AGENT_CERTIFICATES_ENABLED=1` no `.conf`
4. Heartbeat normal → verificar tabela em detalhe do firewall
5. Certificado com expiração ≤ 30d → alerta `certificate_expiring` em `/alerts`
6. Renovar certificado no pfSense → alerta resolvido automaticamente

---

## Próximo passo

**Fase 10** — Vault e inventário de capacidades pfSense (REST API instalada, cofre de credenciais, read-only primeiro).
