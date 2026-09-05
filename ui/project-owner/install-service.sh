#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UNIT_NAME="kings-coding-machine.service"
SERVICE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_SOURCE="$ROOT/ui/project-owner/$UNIT_NAME"
UNIT_TARGET="$SERVICE_DIR/$UNIT_NAME"
PORT="${KINGS_CODING_MACHINE_PORT:-8787}"
BIND="${KINGS_CODING_MACHINE_BIND:-0.0.0.0}"
STATE_ROOT="${KINGS_STATE_ROOT:-$ROOT/.kings}"
TOKEN_FILE="${KINGS_OWNER_TOKEN_FILE:-$STATE_ROOT/owner-token}"
NODE_BIN="${KINGS_CODING_MACHINE_NODE:-$(command -v node || true)}"
NPM_BIN="${KINGS_CODING_MACHINE_NPM:-$(command -v npm || true)}"

is_loopback_bind() {
  [[ "$1" == "127.0.0.1" || "$1" == "localhost" || "$1" == "::1" ]]
}

if [[ -n "${KINGS_CODING_MACHINE_HOST:-}" ]]; then
  HOSTNAME_VALUE="$KINGS_CODING_MACHINE_HOST"
elif is_loopback_bind "$BIND"; then
  HOSTNAME_VALUE="kings.local"
else
  HOSTNAME_VALUE="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  HOSTNAME_VALUE="${HOSTNAME_VALUE:-127.0.0.1}"
fi

if [[ ! -f "$UNIT_SOURCE" ]]; then
  echo "KINGS CODING MACHINE: missing service template: $UNIT_SOURCE" >&2
  exit 1
fi
if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "KINGS CODING MACHINE: node executable not found" >&2
  exit 1
fi
if [[ -z "$NPM_BIN" || ! -x "$NPM_BIN" ]]; then
  echo "KINGS CODING MACHINE: npm executable not found" >&2
  exit 1
fi
if ! command -v systemctl >/dev/null 2>&1; then
  echo "KINGS CODING MACHINE: systemd user services are unavailable on this host" >&2
  exit 1
fi

mkdir -p "$SERVICE_DIR" "$STATE_ROOT"
chmod +x "$ROOT/ui/project-owner/start-local.sh"
chmod +x "$ROOT/ui/project-owner/install-service.sh"

export PATH="$(dirname "$NODE_BIN"):${PATH}"
cd "$ROOT"

if [[ ! -x "$ROOT/node_modules/.bin/tsc" ]]; then
  echo "KINGS CODING MACHINE: installing repository toolchain..."
  "$NPM_BIN" install --no-audit --no-fund
fi

echo "KINGS CODING MACHINE: compiling current adaptive superhost runtime..."
"$NPM_BIN" run build:owner-ui

python3 - \
  "$UNIT_SOURCE" \
  "$UNIT_TARGET" \
  "$ROOT" \
  "$PORT" \
  "$BIND" \
  "$HOSTNAME_VALUE" \
  "$STATE_ROOT" \
  "$NODE_BIN" \
  "$NPM_BIN" <<'PY'
from pathlib import Path
import sys

source_path, target_path, root, port, bind, host, state_root, node_bin, npm_bin = sys.argv[1:]
source = Path(source_path).read_text()
replacements = {
    "@KINGS_ROOT@": root,
    "@PORT@": port,
    "@BIND@": bind,
    "@HOST@": host,
    "@STATE_ROOT@": state_root,
    "@NODE_BIN@": node_bin,
    "@NPM_BIN@": npm_bin,
    "@NODE_DIR@": str(Path(node_bin).parent),
}
for marker, value in replacements.items():
    if "\n" in value or "\r" in value:
        raise SystemExit(f"unsafe newline in service value for {marker}")
    source = source.replace(marker, value)
if "@" in source:
    unresolved = sorted({part for part in source.split() if "@" in part})
    raise SystemExit(f"unresolved service template marker(s): {unresolved}")
Path(target_path).write_text(source)
PY

systemctl --user stop "$UNIT_NAME" >/dev/null 2>&1 || true
systemctl --user daemon-reload
systemctl --user enable "$UNIT_NAME" >/dev/null
systemctl --user start "$UNIT_NAME"

for _ in $(seq 1 80); do
  if systemctl --user is-active --quiet "$UNIT_NAME"; then
    break
  fi
  if systemctl --user is-failed --quiet "$UNIT_NAME"; then
    break
  fi
  sleep 0.25
done

if ! systemctl --user is-active --quiet "$UNIT_NAME"; then
  echo "KINGS CODING MACHINE SERVICE: FAILED TO START" >&2
  systemctl --user --no-pager -l status "$UNIT_NAME" || true
  echo >&2
  echo "===== SERVICE JOURNAL =====" >&2
  journalctl --user -u "$UNIT_NAME" --no-pager -n 80 >&2 || true
  exit 1
fi

echo
 echo "KINGS CODING MACHINE SERVICE: RUNNING"
echo "Runtime root: $ROOT"
echo "Node: $NODE_BIN"
echo "Bind: ${BIND}:${PORT}"
echo "Routing: gateway-first adaptive multi-route failover"

if is_loopback_bind "$BIND"; then
  echo "Open: http://${HOSTNAME_VALUE}:${PORT}"
  echo "Security: loopback-only runtime"
else
  for _ in $(seq 1 40); do
    [[ -s "$TOKEN_FILE" ]] && break
    sleep 0.25
  done
  if [[ -s "$TOKEN_FILE" ]]; then
    OWNER_TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"
    echo "Android / LAN pairing: http://${HOSTNAME_VALUE}:${PORT}/?token=${OWNER_TOKEN}"
    echo "Owner token file: $TOKEN_FILE"
    echo "Security: LAN diagnostics and APIs require the paired owner credential"
  else
    echo "KINGS CODING MACHINE: service is running, but the owner token file was not created." >&2
    echo "Inspect: systemctl --user status $UNIT_NAME" >&2
    exit 1
  fi
fi
