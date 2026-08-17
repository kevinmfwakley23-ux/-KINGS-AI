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

if [[ ! -x "$ROOT/ui/project-owner/start-server.sh" ]]; then
  chmod +x "$ROOT/ui/project-owner/start-server.sh"
fi

cp "$UNIT_SOURCE" "$UNIT_TARGET"
systemctl --user daemon-reload
systemctl --user enable "$UNIT_NAME" >/dev/null
systemctl --user restart "$UNIT_NAME"

sleep 2

if systemctl --user is-active --quiet "$UNIT_NAME"; then
  echo "KINGS CODING MACHINE SERVICE: RUNNING"
  echo "Open: http://kings.local:8787"
  echo "Fallback: http://127.0.0.1:8787"
else
  echo "KINGS CODING MACHINE SERVICE: FAILED TO START" >&2
  systemctl --user --no-pager -l status "$UNIT_NAME" || true
  echo
  echo "===== SERVICE JOURNAL =====" >&2
  journalctl --user -u "$UNIT_NAME" --no-pager -n 40 >&2 || true
  exit 1
fi
