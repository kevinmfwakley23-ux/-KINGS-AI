#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UNIT_NAME="kings-coding-machine.service"
SERVICE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_SOURCE="$ROOT/ui/project-owner/$UNIT_NAME"
UNIT_TARGET="$SERVICE_DIR/$UNIT_NAME"
BUILD_LOG="/tmp/kings-coding-machine-build.log"

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

# Stop systemd first so the old runtime cannot race the clean build.
systemctl --user stop "$UNIT_NAME" >/dev/null 2>&1 || true

# Stop any interactive/previous compiled server before rebuilding.
pkill -f "$ROOT/.kings-ui-build/ui/project-owner/local-server.js" >/dev/null 2>&1 || true

# Always remove the compiled artifact and rebuild from the current checkout.
rm -rf "$ROOT/.kings-ui-build"

"$ROOT/ui/project-owner/start-local.sh" >"$BUILD_LOG" 2>&1 &
BUILD_PID=$!

# start-local.sh intentionally remains foreground-oriented. Wait until its build
# either creates the compiled server or exits, without leaving a server behind.
for _ in $(seq 1 120); do
  if [[ -f "$ROOT/.kings-ui-build/ui/project-owner/local-server.js" ]]; then
    break
  fi

  if ! kill -0 "$BUILD_PID" >/dev/null 2>&1; then
    echo "KINGS CODING MACHINE: runtime build failed" >&2
    cat "$BUILD_LOG" >&2 || true
    exit 1
  fi

  sleep 0.25
done

if [[ ! -f "$ROOT/.kings-ui-build/ui/project-owner/local-server.js" ]]; then
  echo "KINGS CODING MACHINE: runtime build timed out" >&2
  cat "$BUILD_LOG" >&2 || true
  kill "$BUILD_PID" >/dev/null 2>&1 || true
  exit 1
fi

# start-local.sh now has a compiled runtime. Stop the temporary foreground
# process before giving ownership to systemd.
kill "$BUILD_PID" >/dev/null 2>&1 || true
wait "$BUILD_PID" >/dev/null 2>&1 || true

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
systemctl --user start "$UNIT_NAME"

sleep 2

if systemctl --user is-active --quiet "$UNIT_NAME"; then
  echo "KINGS CODING MACHINE SERVICE: RUNNING"
  echo "Open: http://kings.local:8787"
  echo "Fallback: http://127.0.0.1:8787"
  echo "Node: $NODE_BIN"
  echo "Runtime: freshly compiled from current checkout"
else
  echo "KINGS CODING MACHINE SERVICE: FAILED TO START" >&2
  systemctl --user --no-pager -l status "$UNIT_NAME" || true
  echo
  echo "===== SERVICE JOURNAL =====" >&2
  journalctl --user -u "$UNIT_NAME" --no-pager -n 60 >&2 || true
  exit 1
fi
