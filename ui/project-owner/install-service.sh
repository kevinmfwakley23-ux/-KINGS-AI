#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UNIT_NAME="kings-coding-machine.service"
SERVICE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_SOURCE="$ROOT/ui/project-owner/$UNIT_NAME"
UNIT_TARGET="$SERVICE_DIR/$UNIT_NAME"

mkdir -p "$SERVICE_DIR"

if [[ ! -f "$UNIT_SOURCE" ]]; then
  echo "Missing service unit: $UNIT_SOURCE" >&2
  exit 1
fi

NODE_BIN="${KINGS_CODING_MACHINE_NODE:-$(command -v node || true)}"
if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "KINGS CODING MACHINE: node executable not found" >&2
  exit 1
fi

chmod +x "$ROOT/ui/project-owner/start-local.sh"
chmod +x "$ROOT/ui/project-owner/start-service.sh"

# Bootstrap/build the runtime once using the repository-owned toolchain.
"$ROOT/ui/project-owner/start-local.sh" >/tmp/kings-coding-machine-build.log 2>&1 || {
  echo "KINGS CODING MACHINE: runtime build failed" >&2
  cat /tmp/kings-coding-machine-build.log >&2 || true
  exit 1
}

# Stop any interactive instance so systemd becomes the sole owner of the port.
if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 1 "http://127.0.0.1:8787/health" >/dev/null 2>&1; then
  pkill -f "$ROOT/.kings-ui-build/ui/project-owner/local-server.js" || true
fi

# Materialize the service unit with the exact Node executable available now.
python3 - "$UNIT_SOURCE" "$UNIT_TARGET" "$NODE_BIN" <<'PY'
from pathlib import Path
import sys

source = Path(sys.argv[1]).read_text()
target = Path(sys.argv[2])
node = sys.argv[3]

source = source.replace(
    "ExecStart=/usr/bin/env node %h/KINGS-AI/ui/project-owner/start-service.js",
    f"ExecStart={node} %h/KINGS-AI/ui/project-owner/start-service.js",
)

target.write_text(source)
PY

systemctl --user daemon-reload
systemctl --user enable "$UNIT_NAME" >/dev/null
systemctl --user restart "$UNIT_NAME"

sleep 2

if systemctl --user is-active --quiet "$UNIT_NAME"; then
  echo "KINGS CODING MACHINE SERVICE: RUNNING"
  echo "Open: http://kings.local:8787"
  echo "Fallback: http://127.0.0.1:8787"
  echo "Node: $NODE_BIN"
else
  echo "KINGS CODING MACHINE SERVICE: FAILED TO START" >&2
  systemctl --user --no-pager -l status "$UNIT_NAME" || true
  echo
  echo "===== SERVICE JOURNAL =====" >&2
  journalctl --user -u "$UNIT_NAME" --no-pager -n 40 >&2 || true
  exit 1
fi
