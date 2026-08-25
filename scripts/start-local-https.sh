#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${KINGS_HTTPS_BUILD_DIR:-${ROOT_DIR}/.kings-https-build}"
LOG_FILE="${KINGS_HTTPS_LOG_FILE:-${ROOT_DIR}/.kings-local-https.log}"
PID_FILE="${KINGS_HTTPS_PID_FILE:-${ROOT_DIR}/.kings-local-https.pid}"
CERT_DIR="${KINGS_LOCAL_HTTPS_CERT_DIR:-${ROOT_DIR}/.kings-local-https}"
KINGS_PORT="${KINGS_CODING_MACHINE_HTTPS_PORT:-8787}"
FORGE_PORT="${AUTHORS_FORGE_HTTPS_PORT:-8788}"
KINGS_HOST="${KINGS_CODING_MACHINE_HTTPS_HOST:-kings.localhost}"
FORGE_HOST="${AUTHORS_FORGE_HTTPS_HOST:-authors-forge.localhost}"

cd "$ROOT_DIR"

export KINGS_CODING_MACHINE_HTTPS_PORT="$KINGS_PORT"
export AUTHORS_FORGE_HTTPS_PORT="$FORGE_PORT"
export KINGS_CODING_MACHINE_HTTPS_HOST="$KINGS_HOST"
export AUTHORS_FORGE_HTTPS_HOST="$FORGE_HOST"
export KINGS_LOCAL_HTTPS_CERT_DIR="$CERT_DIR"

bash "$ROOT_DIR/scripts/serve-local-https.sh"

if [[ -f "$PID_FILE" ]]; then
  old_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ "$old_pid" =~ ^[0-9]+$ ]] && kill -0 "$old_pid" 2>/dev/null; then
    echo "K.I.N.G.S. HTTPS runtime already running (PID $old_pid)."
    exit 0
  fi
  rm -f "$PID_FILE"
fi

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

npx tsc \
  --target ES2022 \
  --module CommonJS \
  --moduleResolution Node \
  --esModuleInterop \
  --skipLibCheck \
  --strict \
  --types node \
  --outDir "$BUILD_DIR" \
  ui/project-owner/https-runtime.ts

nohup node "$BUILD_DIR/https-runtime.js" >>"$LOG_FILE" 2>&1 &
pid=$!
echo "$pid" > "$PID_FILE"

echo "Started K.I.N.G.S. + Author's Forge HTTPS runtime (PID $pid)."

for _ in {1..30}; do
  kings_ok=0
  forge_ok=0

  curl -ksSf "https://127.0.0.1:${KINGS_PORT}/health" >/dev/null 2>&1 && kings_ok=1 || true
  curl -ksSf "https://127.0.0.1:${FORGE_PORT}/health" >/dev/null 2>&1 && forge_ok=1 || true

  if [[ "$kings_ok" -eq 1 && "$forge_ok" -eq 1 ]]; then
    echo "K.I.N.G.S.: https://127.0.0.1:${KINGS_PORT}"
    echo "Author's Forge: https://127.0.0.1:${FORGE_PORT}"
    echo "HTTPS runtime health checks: PASS"
    exit 0
  fi

  if ! kill -0 "$pid" 2>/dev/null; then
    echo "HTTPS runtime exited unexpectedly." >&2
    echo "--- runtime log ---" >&2
    cat "$LOG_FILE" >&2 || true
    rm -f "$PID_FILE"
    exit 1
  fi

  sleep 1
done

echo "HTTPS runtime did not become healthy within 30 seconds." >&2
echo "--- runtime log ---" >&2
cat "$LOG_FILE" >&2 || true
exit 1
