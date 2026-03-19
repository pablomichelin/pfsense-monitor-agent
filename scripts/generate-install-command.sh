#!/usr/bin/env bash
#
# Gera o comando one-shot de instalação do package pfSense com o secret real
# do node obtido da API (servidor). Uso: ./scripts/generate-install-command.sh [NODE_UID] [normal|light]
#
# Requer: curl, jq. Carrega .env.api do projeto para AUTH_BOOTSTRAP_* e opcionalmente
# MONITOR_API_BASE_URL (default http://127.0.0.1:8088).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_UID="${1:-lasalle-agro}"
HEARTBEAT_MODE="${2:-normal}"

case "$(printf '%s' "$HEARTBEAT_MODE" | tr '[:upper:]' '[:lower:]')" in
  light) HEARTBEAT_MODE="light" ;;
  normal|"") HEARTBEAT_MODE="normal" ;;
  *)
    echo "Erro: heartbeat mode inválido: $HEARTBEAT_MODE (use normal ou light)" >&2
    exit 1
    ;;
esac

if ! command -v jq &>/dev/null; then
  echo "Erro: jq é obrigatório. Instale com: apt-get install jq" >&2
  exit 1
fi

# Carregar apenas as variáveis necessárias do .env.api (evitar quebra por valores com espaço)
if [[ -f "$PROJECT_ROOT/.env.api" ]]; then
  while IFS= read -r line; do
    case "$line" in
      AUTH_BOOTSTRAP_EMAIL=*) AUTH_BOOTSTRAP_EMAIL="${line#*=}" ;;
      AUTH_BOOTSTRAP_PASSWORD=*) AUTH_BOOTSTRAP_PASSWORD="${line#*=}" ;;
      MONITOR_API_BASE_URL=*) MONITOR_API_BASE_URL="${line#*=}" ;;
    esac
  done < <(grep -E '^(AUTH_BOOTSTRAP_EMAIL|AUTH_BOOTSTRAP_PASSWORD|MONITOR_API_BASE_URL)=' "$PROJECT_ROOT/.env.api" || true)
fi

API_BASE="${MONITOR_API_BASE_URL:-http://127.0.0.1:8088}"
API_BASE="${API_BASE%/}"
EMAIL="${AUTH_BOOTSTRAP_EMAIL:-}"
PASS="${AUTH_BOOTSTRAP_PASSWORD:-}"

if [[ -z "$EMAIL" || -z "$PASS" ]]; then
  echo "Erro: defina AUTH_BOOTSTRAP_EMAIL e AUTH_BOOTSTRAP_PASSWORD (ex.: em .env.api)" >&2
  exit 1
fi

COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

# Login e guardar cookies
LOGIN_RESP=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$API_BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")

if ! echo "$LOGIN_RESP" | jq -e '.ok == true' &>/dev/null; then
  echo "Erro: login falhou. Verifique AUTH_BOOTSTRAP_EMAIL e AUTH_BOOTSTRAP_PASSWORD." >&2
  echo "$LOGIN_RESP" | jq . 2>/dev/null || echo "$LOGIN_RESP" >&2
  exit 1
fi

# Listar nodes e obter id do node_uid
NODES_JSON=$(curl -s -b "$COOKIE_JAR" "$API_BASE/api/v1/nodes")
NODE_ID=$(echo "$NODES_JSON" | jq -r --arg uid "$NODE_UID" '.items[] | select(.node_uid == $uid) | .id')

if [[ -z "$NODE_ID" || "$NODE_ID" == "null" ]]; then
  echo "Erro: node com node_uid=\"$NODE_UID\" não encontrado." >&2
  exit 1
fi

# Bootstrap command (retorna node_secret, node_uid, client_code)
BOOTSTRAP_JSON=$(curl -s -b "$COOKIE_JAR" "$API_BASE/api/v1/admin/nodes/$NODE_ID/bootstrap-command")
NODE_SECRET=$(echo "$BOOTSTRAP_JSON" | jq -r '.bootstrap.node_secret')
NODE_UID_RESOLVED=$(echo "$BOOTSTRAP_JSON" | jq -r '.node.node_uid')
CLIENT_CODE=$(echo "$BOOTSTRAP_JSON" | jq -r '.node.client_code')

if [[ -z "$NODE_SECRET" || "$NODE_SECRET" == "null" ]]; then
  echo "Erro: não foi possível obter node_secret da API (credencial ativa)." >&2
  exit 1
fi

# Versão e SHA256: config versionado (atualizado por release-pfsense-package.sh) ou fallback local
if [[ -f "$PROJECT_ROOT/config/package-release.env" ]]; then
  set -a
  # shellcheck source=../config/package-release.env
  source "$PROJECT_ROOT/config/package-release.env"
  set +a
  VERSION="${PACKAGE_RELEASE_VERSION:-}"
  SHA256_VALUE="${PACKAGE_RELEASE_SHA256:-}"
  REPO_RAW_BASE="${PACKAGE_RELEASE_REPO_RAW_BASE:-}"
fi
if [[ -z "$VERSION" || -z "$SHA256_VALUE" ]]; then
  SHA256_FILE="$PROJECT_ROOT/dist/pfsense-package/monitor-pfsense-package-v${VERSION:-0.2.1}.tar.gz.sha256"
  if [[ -f "$SHA256_FILE" ]]; then
    VERSION="${VERSION:-0.2.1}"
    SHA256_VALUE=$(awk '{print $1}' "$SHA256_FILE")
  else
    VERSION="${VERSION:-0.2.1}"
    echo "Aviso: config/package-release.env ou $SHA256_FILE não encontrado; SHA256 vazio." >&2
    SHA256_VALUE=""
  fi
fi
REPO_RAW_BASE="${REPO_RAW_BASE:-${GITHUB_RAW_BASE:-https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main}}"
CONTROLLER_URL="${CONTROLLER_URL:-https://pfs-monitor.systemup.inf.br}"

INSTALLER_URL="${REPO_RAW_BASE}/packages/pfsense-package/bootstrap/install-from-release.sh"
ARTIFACT_URL="${REPO_RAW_BASE}/dist/pfsense-package/monitor-pfsense-package-v${VERSION}.tar.gz"

# Colocar secret entre aspas simples no comando gerado para evitar quebra por caracteres especiais
SECRET_QUOTED="'${NODE_SECRET//\'/\'\\\'\'}'"

# Comando roda a instalação em segundo plano para o Command Prompt da GUI retornar na hora (evita carregamento infinito)
if [[ -z "$SHA256_VALUE" ]]; then
  echo "# SHA256 não encontrado localmente; preencha após publicar o artefato." >&2
  CMD="fetch -o /tmp/install-from-release.sh $INSTALLER_URL && chmod +x /tmp/install-from-release.sh && nohup /tmp/install-from-release.sh --release-url $ARTIFACT_URL --sha256 \${SHA256_DO_ARTEFATO} --controller-url $CONTROLLER_URL --node-uid $NODE_UID_RESOLVED --node-secret $SECRET_QUOTED --customer-code $CLIENT_CODE --heartbeat-mode $HEARTBEAT_MODE </dev/null >>/tmp/monitor-install.log 2>&1 & echo 'Instalação em segundo plano. Log: tail -f /tmp/monitor-install.log'"
else
  CMD="fetch -o /tmp/install-from-release.sh $INSTALLER_URL && chmod +x /tmp/install-from-release.sh && nohup /tmp/install-from-release.sh --release-url $ARTIFACT_URL --sha256 $SHA256_VALUE --controller-url $CONTROLLER_URL --node-uid $NODE_UID_RESOLVED --node-secret $SECRET_QUOTED --customer-code $CLIENT_CODE --heartbeat-mode $HEARTBEAT_MODE </dev/null >>/tmp/monitor-install.log 2>&1 & echo 'Instalação em segundo plano. Log: tail -f /tmp/monitor-install.log'"
fi

echo "# Comando de instalação/atualização do package (node: $NODE_UID_RESOLVED, versão: $VERSION, heartbeat: $HEARTBEAT_MODE)"
echo "# Cole no Command Prompt do pfSense (Diagnostics > Command Prompt). Retorna na hora; instalação segue em segundo plano."
echo ""
echo "$CMD"
