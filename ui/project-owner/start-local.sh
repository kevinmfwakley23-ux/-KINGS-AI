#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TSC="${TSC:-/tmp/kings-typescript/node_modules/.bin/tsc}"
OUT="${ROOT}/.kings-ui-build"
PORT="${KINGS_CODING_MACHINE_PORT:-8787}"

cd "$ROOT"

if [[ ! -x "$TSC" ]]; then
  echo "TypeScript compiler not found at $TSC" >&2
  exit 1
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
  xdg-open "http://127.0.0.1:${PORT}" >/dev/null 2>&1 || true
fi

exec node "$OUT/ui/project-owner/local-server.js"
