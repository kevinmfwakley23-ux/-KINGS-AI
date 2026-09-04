#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${ROOT}/.kings-live-gateway-build"
SOURCE="${ROOT}/core/workforce/project-owner-model-driven-execution-test.ts"
TEST_BASENAME="project-owner-model-driven-execution-test.js"

if [[ -z "${KINGS_OMNIROUTE_URL:-}" && -z "${KINGS_9ROUTER_URL:-}" && -z "${KINGS_AI_GATEWAYS_JSON:-}" ]]; then
  echo "K.I.N.G.S. LIVE GATEWAY ACCEPTANCE: FAILURE"
  echo "No live gateway is configured. Set KINGS_OMNIROUTE_URL, KINGS_9ROUTER_URL, or KINGS_AI_GATEWAYS_JSON."
  exit 2
fi

rm -rf "$OUT"
mkdir -p "$OUT"

npx tsc \
  --target ES2022 \
  --module CommonJS \
  --moduleResolution Node \
  --esModuleInterop \
  --skipLibCheck \
  --strict \
  --types node \
  --outDir "$OUT" \
  "$SOURCE"

mapfile -t emitted < <(find "$OUT" -type f -name "$TEST_BASENAME" -print | sort)
if [[ ${#emitted[@]} -ne 1 ]]; then
  echo "K.I.N.G.S. LIVE GATEWAY ACCEPTANCE: FAILURE"
  echo "Expected exactly one emitted $TEST_BASENAME, found ${#emitted[@]}."
  find "$OUT" -type f -name '*.js' -print | sort
  exit 3
fi

node "${emitted[0]}"
echo "K.I.N.G.S. LIVE GATEWAY ACCEPTANCE: SUCCESS"
