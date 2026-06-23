# 99 — Hotfix: upgrade GUI 0.3.5 → 0.3.9 (`--node-secret` legado)

**Data:** 2026-06-23  
**Package alvo:** `0.3.9` (patch; corrige caminho de upgrade)  
**Problema:** firewalls em **0.3.5** não conseguiam atualizar via GUI porque o `install-from-release.sh` baixado do controlador recusava `--node-secret` na linha de comando.

## Causa raiz

| Camada | Comportamento |
|--------|----------------|
| Package **0.3.5** (`systemup_monitor.inc`) | Montava update passando `--node-secret` ao instalador |
| Instalador em **main** (0.3.7+) | Recusava `--node-secret` (hard exit 1) por segurança |
| Efeito | Chicken-and-egg: cada tentativa GUI baixa instalador novo e falha antes de instalar o tarball |

## Correção

1. `install-from-release.sh` — aceita `--node-secret` **legado** (aviso stderr, sem exit 1). Prioridade: `MONITOR_UPDATE_NODE_SECRET` > `--secret-file` > `--node-secret`.
2. `admin.service.ts` — comandos bootstrap passam a usar env + `--secret-file` (alinhado a `generate-install-command.sh`).
3. Release **0.3.9** — tarball + `config/package-release.env` atualizados.

Após push em `main`, firewalls **0.3.5** podem retentar **Atualizar** na GUI sem instalar package intermediário.

## Workaround SSH — pfSense `168.0.92.207`

Executar no **Diagnostics → Command Prompt** ou SSH:

```sh
NODE_SECRET="$(grep '^NODE_SECRET=' /usr/local/etc/monitor-pfsense-agent.conf | cut -d= -f2- | tr -d '\"')"
SECRET_FILE="/var/db/monitor-pfsense-agent/.update-node-secret"
SHA256="53e2b60b78baec15d5683edc91be73ab5315f51a8024bb3abd77df163180b7f6"
ARTIFACT="https://pfs-monitor.systemup.inf.br/api/v1/agent/package-artifact"
INSTALLER="https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main/packages/pfsense-package/bootstrap/install-from-release.sh"
mkdir -p /var/db/monitor-pfsense-agent && printf '%s' "$NODE_SECRET" > "$SECRET_FILE" && chmod 600 "$SECRET_FILE" && fetch -o /tmp/install-from-release.sh "$INSTALLER" && chmod +x /tmp/install-from-release.sh && env MONITOR_UPDATE_NODE_SECRET="$NODE_SECRET" /tmp/install-from-release.sh --release-url "$ARTIFACT" --sha256 "$SHA256" --secret-file "$SECRET_FILE" --controller-url https://pfs-monitor.systemup.inf.br --node-uid "$(grep '^NODE_UID=' /usr/local/etc/monitor-pfsense-agent.conf | cut -d= -f2- | tr -d '\"')" --customer-code "$(grep '^CUSTOMER_CODE=' /usr/local/etc/monitor-pfsense-agent.conf | cut -d= -f2- | tr -d '\"')" --heartbeat-mode normal && rm -f "$SECRET_FILE"
```

Substituir `SHA256` pelo valor atual em `config/package-release.env` (0.3.9: `53e2b60b78baec15d5683edc91be73ab5315f51a8024bb3abd77df163180b7f6`).

## Testes

```bash
chmod +x scripts/test-install-from-release-args.sh
./scripts/test-install-from-release-args.sh
```

## Referências

- Guia operação §6 troubleshooting: `docs/pfsense-package/00-GUIA-OPERACAO-PACKAGE.md`
- Entrega anterior: `docs/98-ENTREGA-PACKAGE-0.3.8.md`
