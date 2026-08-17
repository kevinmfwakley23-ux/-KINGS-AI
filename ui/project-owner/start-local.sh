#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TSC="${TSC:-/tmp/kings-typescript/node_modules/.bin/tsc}"
OUT="${ROOT}/.kings-ui-build"
PORT="${KINGS_CODING_MACHINE_PORT:-8787}"
HOSTNAME="${KINGS_CODING_MACHINE_HOST:-kings.local}"

cd "$ROOT"

if [[ ! -x "$TSC" ]]; then
  echo "TypeScript compiler not found at $TSC" >&2
  exit 1
fi

# Make the friendly local hostname resolve on this Linux environment.
# This is local-only and does not expose the machine to the network.
if command -v sudo >/dev/null 2>&1 && [[ "$HOSTNAME" == "kings.local" ]]; then
  if ! grep -qE '^127\.0\.0\.1[[:space:]]+kings\.local([[:space:]]|$)' /etc/hosts 2>/dev/null; then
    echo "Configuring local hostname: kings.local"
    echo "127.0.0.1 kings.local" | sudo tee -a /etc/hosts >/dev/null
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
  --typeRoots /tmp/kings-typescript/node_modules/@types \
  --types node \
  --outDir "$OUT" \
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
