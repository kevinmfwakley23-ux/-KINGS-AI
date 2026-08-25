#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TSC="${TSC:-}"
OUT="${ROOT}/.kings-ui-build"
PORT="${KINGS_CODING_MACHINE_PORT:-8787}"
HOSTNAME="${KINGS_CODING_MACHINE_HOST:-kings.local}"

cd "$ROOT"

if [[ -z "$TSC" ]]; then
  for candidate in \
    "$(command -v tsc 2>/dev/null || true)" \
    "$ROOT/node_modules/.bin/tsc" \
    "${HOME}/.local/bin/tsc" \
    "/usr/local/bin/tsc" \
    "/usr/bin/tsc"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      TSC="$candidate"
      break
    fi
  done
fi

if [[ -z "$TSC" || ! -x "$TSC" ]]; then
  echo "KINGS CODING MACHINE: TypeScript compiler not found." >&2
  echo "Install TypeScript locally or set TSC=/path/to/tsc." >&2
  exit 1
fi

if command -v sudo >/dev/null 2>&1 && [[ "$HOSTNAME" == "kings.local" ]]; then
  if ! grep -qE '^127\.0\.0\.1[[:space:]]+kings\.local([[:space:]]|$)' /etc/hosts 2>/dev/null; then
    echo "Configuring local hostname: kings.local"
    echo "127.0.0.1 kings.local" | sudo tee -a /etc/hosts >/dev/null
  fi
fi

if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
  echo
  echo "KINGS CODING MACHINE UI ALREADY RUNNING"
  echo "Open: http://${HOSTNAME}:${PORT}"
  echo "Fallback: http://127.0.0.1:${PORT}"
  echo "Model: qwen2.5-coder:1.5b"
  exit 0
fi

rm -rf "$OUT"
mkdir -p "$OUT"

TSC_ARGS=(
  --target ES2022
  --module CommonJS
  --moduleResolution Node
  --esModuleInterop
  --skipLibCheck
  --strict
  --outDir "$OUT"
)

if [[ -d "$ROOT/node_modules/@types/node" ]]; then
  TSC_ARGS+=(--types node)
fi

"$TSC" \
  "${TSC_ARGS[@]}" \
  ui/project-owner/local-server.ts

if [[ "${KINGS_CODING_MACHINE_OPEN_UI:-0}" == "1" ]] && command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://${HOSTNAME}:${PORT}" >/dev/null 2>&1 || true
fi

echo
echo "KINGS CODING MACHINE UI"
echo "Open: http://${HOSTNAME}:${PORT}"
echo "Fallback: http://127.0.0.1:${PORT}"
echo "Model: qwen2.5-coder:1.5b"
echo

exec node "$OUT/ui/project-owner/local-server.js"
