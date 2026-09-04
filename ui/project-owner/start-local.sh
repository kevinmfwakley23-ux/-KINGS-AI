#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${ROOT}/.kings-ui-build"
PORT="${KINGS_CODING_MACHINE_PORT:-8787}"
BIND="${KINGS_CODING_MACHINE_BIND:-0.0.0.0}"
NODE_BIN="${KINGS_CODING_MACHINE_NODE:-$(command -v node || true)}"
NPM_BIN="${KINGS_CODING_MACHINE_NPM:-$(command -v npm || true)}"
STATE_ROOT="${KINGS_STATE_ROOT:-${ROOT}/.kings}"
TOKEN_FILE="${KINGS_OWNER_TOKEN_FILE:-${STATE_ROOT}/owner-token}"

cd "$ROOT"

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "KINGS CODING MACHINE: node executable not found." >&2
  exit 1
fi

if [[ -z "$NPM_BIN" || ! -x "$NPM_BIN" ]]; then
  echo "KINGS CODING MACHINE: npm executable not found." >&2
  exit 1
fi

export PATH="$(dirname "$NODE_BIN"):${PATH}"
export KINGS_CODING_MACHINE_BIND="$BIND"

is_loopback_bind() {
  [[ "$1" == "127.0.0.1" || "$1" == "localhost" || "$1" == "::1" ]]
}

if [[ -n "${KINGS_CODING_MACHINE_HOST:-}" ]]; then
  HOSTNAME="$KINGS_CODING_MACHINE_HOST"
elif is_loopback_bind "$BIND"; then
  HOSTNAME="kings.local"
else
  HOSTNAME="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  HOSTNAME="${HOSTNAME:-127.0.0.1}"
fi
export KINGS_CODING_MACHINE_HOST="$HOSTNAME"

PAIR_URL=""
if ! is_loopback_bind "$BIND"; then
  if [[ -z "${KINGS_OWNER_TOKEN:-}" ]]; then
    mkdir -p "$STATE_ROOT"
    umask 077
    if [[ -s "$TOKEN_FILE" ]]; then
      KINGS_OWNER_TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"
    else
      KINGS_OWNER_TOKEN="$($NODE_BIN -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
      printf '%s\n' "$KINGS_OWNER_TOKEN" > "$TOKEN_FILE"
      chmod 600 "$TOKEN_FILE"
    fi
    export KINGS_OWNER_TOKEN
  fi

  if [[ ${#KINGS_OWNER_TOKEN} -lt 24 ]]; then
    echo "KINGS CODING MACHINE: KINGS_OWNER_TOKEN must contain at least 24 characters for LAN exposure." >&2
    exit 1
  fi
  PAIR_URL="http://${HOSTNAME}:${PORT}/?token=${KINGS_OWNER_TOKEN}"
fi

if [[ ! -x "$ROOT/node_modules/.bin/tsc" ]]; then
  echo "KINGS CODING MACHINE: bootstrapping repository toolchain..."
  "$NPM_BIN" install --no-audit --no-fund
fi

TSC="$ROOT/node_modules/.bin/tsc"

if [[ ! -x "$TSC" ]]; then
  echo "KINGS CODING MACHINE: repository TypeScript compiler unavailable after npm install." >&2
  exit 1
fi

if command -v sudo >/dev/null 2>&1 && [[ "$HOSTNAME" == "kings.local" ]]; then
  if ! grep -qE '^127\.0\.0\.1[[:space:]]+kings\.local([[:space:]]|$)' /etc/hosts 2>/dev/null; then
    echo "Configuring local hostname: kings.local"
    echo "127.0.0.1 kings.local" | sudo tee -a /etc/hosts >/dev/null
  fi
fi

if command -v curl >/dev/null 2>&1; then
  HTTP_STATUS="$(curl -sS -o /dev/null --max-time 2 -w '%{http_code}' "http://127.0.0.1:${PORT}/health" 2>/dev/null || true)"
  if [[ "$HTTP_STATUS" == "200" || "$HTTP_STATUS" == "401" || "$HTTP_STATUS" == "503" ]]; then
    echo
    echo "KINGS CODING MACHINE UI ALREADY RUNNING"
    if [[ -n "$PAIR_URL" ]]; then
      echo "Android / LAN pairing: $PAIR_URL"
    else
      echo "Open: http://${HOSTNAME}:${PORT}"
    fi
    echo "Routing: gateway-first; local Ollama is optional fallback only"
    exit 0
  fi
fi

rm -rf "$OUT"
mkdir -p "$OUT"

"$TSC" \
  --target ES2022 \
  --module CommonJS \
  --moduleResolution Node \
  --esModuleInterop \
  --skipLibCheck \
  --strict \
  --types node \
  --outDir "$OUT" \
  ui/project-owner/local-server.ts

OPEN_URL="${PAIR_URL:-http://${HOSTNAME}:${PORT}}"
if [[ "${KINGS_CODING_MACHINE_OPEN_UI:-0}" == "1" ]] && command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$OPEN_URL" >/dev/null 2>&1 || true
fi

echo
echo "KINGS CODING MACHINE UI"
if [[ -n "$PAIR_URL" ]]; then
  echo "Android / LAN pairing: $PAIR_URL"
  echo "Owner token file: $TOKEN_FILE"
  echo "Security: LAN API requires the paired owner credential"
else
  echo "Open: http://${HOSTNAME}:${PORT}"
  echo "Security: loopback-only runtime"
fi
echo "Bind: ${BIND}:${PORT}"
echo "Routing: gateway-first; local Ollama is optional fallback only"
echo

exec "$NODE_BIN" "$OUT/ui/project-owner/local-server.js"
