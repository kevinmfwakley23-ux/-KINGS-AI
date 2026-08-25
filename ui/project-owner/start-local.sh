#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${ROOT}/.kings-ui-build"
PORT="${KINGS_CODING_MACHINE_PORT:-8787}"
HOSTNAME="${KINGS_CODING_MACHINE_HOST:-kings.local}"

cd "$ROOT"

# The interactive launcher is also the one-time bootstrap for the local
# development toolchain. The background systemd service never invokes npm/tsc.
if [[ ! -x "$ROOT/node_modules/.bin/tsc" ]]; then
  command -v npm >/dev/null 2>&1 || {
    echo "KINGS CODING MACHINE: npm is required to bootstrap the local toolchain." >&2
    exit 1
  }

  echo "KINGS CODING MACHINE: installing local toolchain..."
  npm install --no-audit --no-fund
fi

TSC="$ROOT/node_modules/.bin/tsc"
if [[ ! -x "$TSC" ]]; then
  echo "KINGS CODING MACHINE: repository TypeScript compiler unavailable after npm install." >&2
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

"$TSC" \
  --target ES2022 \
  --module CommonJS \
  --moduleResolution Node \
  --esModuleInterop \
  --skipLibCheck \
  --strict \
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
