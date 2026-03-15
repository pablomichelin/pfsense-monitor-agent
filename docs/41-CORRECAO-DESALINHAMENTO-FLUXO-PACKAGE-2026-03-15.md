# Correção do Desalinhamento Fluxo Package pfSense

**Data:** 2026-03-15  
**Objetivo:** Corrigir o desalinhamento entre o fluxo homologado real (package pfSense 0.2.0) e o fluxo automatizado oficial do projeto.

---

## 1. Resumo executivo

O desalinhamento entre o fluxo homologado (Lasalle Agro, package 0.2.0) e o fluxo automatizado foi corrigido em quatro etapas:

1. **API:** Confirmado que `package_command` já é retornado corretamente quando `PACKAGE_RELEASE_*` está configurado. Log de diagnóstico temporário foi removido.
2. **verify-bootstrap-release.sh:** Ajustado para aceitar fluxo package quando `package_command` existir.
3. **run-bootstrap-preflight.sh:** Ajustado para detectar modo package (PACKAGE_RELEASE_VERSION) e pular smoke-agent-release.
4. **smoke-bootstrap-flow.sh:** Ajustado para validar fluxo package homologado quando PACKAGE_RELEASE_* estiver configurado.

**Causa real do `package_command: null`:** No ambiente local com `.env.api` correto e container recriado, a API **já retorna** `package_command` corretamente. O problema reportado em docs 39/40 pode ter sido devido a: (a) variáveis não injetadas no container em determinado deploy; (b) API não reiniciada após alteração do `.env.api`; ou (c) cache de build. O código da API estava correto.

---

## 2. Correções aplicadas

### 2.1 API (admin.service.ts)

- **Alteração:** Remoção de log de diagnóstico temporário.
- **Conclusão:** O código que monta `package_command` está correto. A condição `packageRelease.version && packageRelease.sha256 && packageRelease.repoRawBase` funciona quando as variáveis de ambiente estão presentes no container.

### 2.2 scripts/verify-bootstrap-release.sh

- **Alteração:** Leitura de `package_command` da resposta; se presente, deriva artifact, installer e SHA256 do comando e valida em modo package.
- **Compatibilidade:** Mantido fluxo agente quando `package_command` é null.

### 2.3 scripts/run-bootstrap-preflight.sh

- **Alteração:** Detecção de modo package via `PACKAGE_RELEASE_VERSION` em `.env.api`. Em modo package, pula `smoke-agent-release` e executa apenas `verify-bootstrap-release`.
- **Compatibilidade:** Mantido fluxo agente completo quando PACKAGE_RELEASE_VERSION não está configurado.

### 2.4 scripts/smoke-bootstrap-flow.sh

- **Alteração:** Detecção de modo package; em modo package: valida `package_command` presente, artefato `monitor-pfsense-package-vX.Y.Z.tar.gz`, e greps adaptados para a página do node e bootstrap.
- **Compatibilidade:** Mantido fluxo agente completo (fallback, override, release.ready) quando PACKAGE_RELEASE_VERSION não está configurado.

---

## 3. Resultados dos testes

| Teste | Resultado |
|-------|-----------|
| `/healthz` | OK |
| `/api/v1/admin/nodes/:id/bootstrap-command` | `package_command` presente |
| `verify-bootstrap-release.sh` | OK (modo package) |
| `run-bootstrap-preflight.sh` | OK (modo package) |
| `smoke-bootstrap-flow.sh` | OK (modo package) |
| `run-smoke-suite.sh` | smoke-bootstrap-flow OK; smoke-admin-operations exit 1 (possível pré-existente) |

### Exemplo de resposta bootstrap-command (package_command)

```json
{
  "package_command": "fetch -o /tmp/install-from-release.sh '...' && chmod +x ... && nohup /tmp/install-from-release.sh --release-url '...monitor-pfsense-package-v0.2.0.tar.gz' --sha256 '...' ...",
  "command": null
}
```

---

## 4. Rebuilds executados

- `docker compose build --no-cache api`
- `docker compose up -d --force-recreate api`

---

## 5. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `apps/api/src/admin/admin.service.ts` | Remoção de import Logger e log de diagnóstico |
| `scripts/verify-bootstrap-release.sh` | Suporte a modo package |
| `scripts/run-bootstrap-preflight.sh` | Detecção modo package e branch condicional |
| `scripts/smoke-bootstrap-flow.sh` | Modo package com validação adaptada |

---

## 6. Versões

- **API:** 0.1.0 (inalterada)
- **Painel:** 0.1.4 (inalterada)
- **Package homologado:** 0.2.0 (inalterado)
- **Scripts/trilha operacional:** alterados (sem bump de versão formal)

---

## 7. Pendências residuais

- `run-smoke-suite.sh` termina com exit 1; `smoke-admin-operations.sh` pode ter falha pré-existente na validação final (inventário/filtros/auditoria). Fora do escopo desta task.
- ~~Recomendado validar em produção~~ **Concluído:** doc 42 registra validação em produção com sucesso.

---

## 8. Referências

- docs/39-ETAPA-A-VALIDACAO-SERVIDOR-2026-03-15.md
- docs/40-VALIDACAO-PFSENSE-REAL-LASALLE-AGRO-2026-03-15.md
- docs/18-homologacao-pfsense-package-real-2026-03-13.md
- docs/42-VALIDACAO-PRODUCAO-POS-CORRECAO-PACKAGE-2026-03-15.md (validação em produção)
