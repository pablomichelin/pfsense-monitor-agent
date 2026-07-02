# 116 — Auditoria documental e consolidacao

**Data:** 2026-07-01  
**Escopo:** saneamento de documentacao canonica e operacional (sem alteracao de runtime)  
**Referencia:** missao de auditoria documental do repositorio Monitor-Pfsense

---

## 1. Objetivo

Alinhar documentos de retomada, operacao e continuidade ao estado **real** do software em `2026-07-01`, eliminando contradicoes entre entrypoints canonicos e preservando entregas historicas como historico.

---

## 2. Fontes de verdade consultadas

| Item | Valor verificado | Arquivo |
|------|------------------|---------|
| API | `0.6.4` | `apps/api/package.json` |
| Painel | `1.4.5` | `apps/web/package.json` |
| Package pfSense | `0.4.7` | `packages/pfsense-package/Makefile` |
| Agente (package) | `0.4.7` | `systemup_monitor.inc` → `SYSTEMUP_MONITOR_AGENT_VERSION` |
| Release publicada | `0.4.7` + SHA256 | `config/package-release.env` |
| Artefato | `monitor-pfsense-package-v0.4.7.tar.gz` | `dist/pfsense-package/` |

**Modulos confirmados no codigo (nao apenas na doc):**

- backup `config.xml`: `backups-ingest.controller`, `backups.controller`, Prisma `NodeConfigBackup`, painel `/backups`, pagina `backup_systemup_monitor.php`
- MFA: `auth.controller` (`/mfa/*`)
- RBAC granular: `admin.controller`, `route-policy.ts`, `permissions-matrix`
- `remote_access_url`: schema Prisma + inventario web
- `package_upgrade`: `package-upgrade.controller` + handler no package (≥ 0.4.6)
- `pfsense_upgrade`: `pfsense-upgrade.controller`
- Coluna **Pacote** no inventario: entrega `docs/115` (painel `1.4.5`)

---

## 3. Inconsistencias principais encontradas

| Problema | Onde aparecia | Correcao |
|----------|---------------|----------|
| Painel `1.4.4` vs codigo `1.4.5` | `LEITURA-INICIAL`, `00-INDICE`, `HISTORICO` | Atualizado para `1.4.5` |
| Artefato/proximo passo apontando `0.4.6` | `LEITURA-INICIAL` | Release/artefato `0.4.7`; proximo passo unificado |
| Proximos passos conflitantes (`0.4.5`, `0.4.6`, backup nao implementado) | `LEITURA-INICIAL`, `00_inicio`, `00-INDICE` | Secao **Estado consolidado** + proximo passo unico |
| Backup "nao existe" | `LEITURA-INICIAL` (snapshot 2026-06-08), `00-INDICE`, `00-README`, `DIRETRIZES` | Marcado como historico ou corrigido para **implementado** |
| Package "atual" `0.3.6` / `0.3.8` | `00-INDICE`, trilha 0.3.6+ "ativa" | Release atual `0.4.7`; trilha 0.3.x **encerrada** |
| Versoes RBAC desatualizadas (`0.3.1` / `1.1.1`) | `00-INDICE` | Versoes de produto atuais na secao RBAC |
| Origem interna `192.168.100.244` | `07-api-e-fluxos.md` | `192.168.100.221:3031` |
| Telas/rotas ausentes (`/backups`, `/conta`, coluna Pacote) | `08-painel`, `DIRETRIZES` | Documentadas |
| Upgrade remoto com exemplos fixos `0.4.6` | `114-UPGRADE-REMOTO-PACKAGE.md` | Release alvo `0.4.7`; minimo handler continua `0.4.6` |
| Guia package referencia `0.3.10+` | `pfsense-package/00-GUIA-OPERACAO-PACKAGE.md` | `0.4.7` + secao upgrade remoto |
| `00_inicio` sem entregas 2026-06-30 / 2026-07-01 | `00_inicio.md` | Cabecalho e estado resumido atualizados |

---

## 4. Arquivos alterados nesta auditoria

### Entrypoints e governanca

- `LEITURA-INICIAL.md`
- `CORTEX.md`
- `00-README.md`
- `00_inicio.md`
- `docs/00-INDICE-OPERACIONAL.md`

### Operacionais

- `docs/DIRETRIZES-E-FUNCIONAMENTO.md`
- `docs/HISTORICO-E-LINHA-DO-TEMPO.md`
- `docs/114-UPGRADE-REMOTO-PACKAGE.md`
- `docs/pfsense-package/00-GUIA-OPERACAO-PACKAGE.md`

### Base numerada (notas de atualizacao, sem reescrever historico)

- `07-api-e-fluxos.md`
- `08-painel-web-e-telas.md`
- `11-monitoramento-backup-e-operacao.md`
- `12-roadmap-de-fases.md`
- `16-status-e-progresso-do-projeto.md`

### Novo

- `docs/116-AUDITORIA-DOCUMENTAL-CONSOLIDACAO-2026-07-01.md` (este arquivo)

---

## 5. Decisoes: historico vs verdade atual

| Decisao | Motivo |
|---------|--------|
| **Preservar** blocos longos de `LEITURA-INICIAL` (MVP 2026-03-15) | Valor historico; rotulados como **Arquivo historico** |
| **Preservar** docs de entrega (`docs/98`, `docs/114-ENTREGA-*`, etc.) sem editar versoes da epoca | Registro factual de cada entrega |
| **Corrigir** apenas trechos que se apresentavam como estado atual ou proximo passo | Evitar operador seguir versao/release errada |
| **Nao mover** arquivos em massa | Regra existente em `00-INDICE-OPERACIONAL.md` |
| Snapshot **2026-06-08** em `00-INDICE` mantido como subsecao historica | Contexto de migracao de origem e planejamento de backup |

---

## 6. Estado canonico apos saneamento (resumo)

- **Versoes:** API `0.6.4` · painel `1.4.5` · package `0.4.7`
- **Ultima entrega:** coluna **Pacote** — `docs/115-ENTREGA-COLUNA-PACOTE-INVENTARIO-2026-07-01.md`
- **Proximo passo operacional:** rollout package `0.4.7`; agentes &lt; 0.4.6 exigem instalacao manual uma vez; depois upgrade remoto via painel
- **Ordem de leitura:** inalterada — `LEITURA-INICIAL.md` → `CORTEX.md` → `docs/00-INDICE-OPERACIONAL.md`

---

## 7. Riscos e pendencias documentais remanescentes

| Item | Risco | Mitigacao sugerida |
|------|-------|-------------------|
| `LEITURA-INICIAL.md` ainda e extenso (~500+ linhas de historico MVP) | Novo chat pode ler demais contexto antigo | Continuar usando secao **Estado consolidado** no topo; considerar extracao futura em trilha propria |
| Nao ha doc de entrega dedicado ao bump `0.4.7` (so release env + doc 115 referencia) | Operador pode nao saber o que mudou entre 0.4.6 e 0.4.7 | Criar entrega apenas se houver delta funcional relevante |
| Docs `docs/63`–`docs/67` (plano backup 2026-06-08) ainda descrevem fases pre-implementacao em partes | Confusao ao implementar manutencao | Ao tocar backup, ler `docs/64` + codigo; plano 63 e checklist 67 sao parcialmente superseded |
| `07-api-e-fluxos.md` e `06-modelo-de-dados-inicial.md` sao base antiga | Contratos incompletos vs API atual | Nota no topo de `07` aplicada; modelo de dados completo exigiria trilha API dedicada |
| Runbook ISPConfig backup limit (`docs/95-RUNBOOK-*`) pode estar pendente no host | Upload backup &gt; limite em producao | Validar snippet no host 253 quando houver janela |
| Percentuais de fase (`93%`, Fase 1 100%) desatualizados semanticamente | Metrica de progresso nao reflete produto maduro | Tratar percentuais como historico do MVP; nao usar para go/no-go operacional |

---

## 8. Validacao pos-auditoria

Checklist rapido para proximo operador:

1. `LEITURA-INICIAL`, `00-INDICE`, `00-README`, `00_inicio` citam as mesmas versoes e ultima entrega.
2. Nenhum doc canonico afirma que backup nao existe.
3. Nenhum doc canonico aponta `0.4.6` ou `0.3.x` como release atual.
4. `config/package-release.env` e tabela de versoes no topo de `LEITURA-INICIAL` concordam.

---

*Auditoria executada em 2026-07-01. Proxima revisao documental recomendada apos a proxima entrega de produto (bump de versao ou feature visivel).*
