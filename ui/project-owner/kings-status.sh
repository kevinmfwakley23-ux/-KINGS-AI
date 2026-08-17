#!/usr/bin/env bash
set -euo pipefail

PORT="${KINGS_CODING_MACHINE_PORT:-8787}"
HOSTNAME="${KINGS_CODING_MACHINE_HOST:-kings.local}"

if systemctl --user is-active --quiet kings-coding-machine.service; then
  echo "KINGS CODING MACHINE: RUNNING"
else
  echo "KINGS CODING MACHINE: STOPPED"
fi

if curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
  echo "HTTP UI: HEALTHY"
  echo "Open: http://${HOSTNAME}:${PORT}"
else
  echo "HTTP UI: UNREACHABLE"
  echo "Fallback: http://127.0.0.1:${PORT}"
fi

printf 'Model: qwen2.5-coder:1.5b\n'
