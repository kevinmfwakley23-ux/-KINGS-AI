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

exec node "$OUT/ui/project-owner/local-server.js"
