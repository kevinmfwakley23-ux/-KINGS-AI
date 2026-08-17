#!/usr/bin/env bash
set -euo pipefail

UNIT_NAME="kings-coding-machine.service"

if systemctl --user is-active --quiet "$UNIT_NAME"; then
  echo "KINGS CODING MACHINE: RUNNING"
else
  echo "KINGS CODING MACHINE: STOPPED"
fi

echo "URL: http://kings.local:8787"
echo "FALLBACK: http://127.0.0.1:8787"
echo "MODEL: qwen2.5-coder:1.5b"

echo
echo "===== SERVICE STATUS ====="
systemctl --user --no-pager --full status "$UNIT_NAME" || true
