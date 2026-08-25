#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${ROOT}/.kings-focused-test-build"

rm -rf "$OUT"
mkdir -p "$OUT"

mapfile -t TESTS < <(find "$ROOT/core/workforce" -maxdepth 1 -type f -name '*-test.ts' -printf '%f\n' | sort)

if [[ ${#TESTS[@]} -eq 0 ]]; then
  echo "No focused workforce tests found."
  exit 1
fi

echo "K.I.N.G.S. focused workforce verification"
echo "Found ${#TESTS[@]} test files."

echo

for test_file in "${TESTS[@]}"; do
  echo "=== $test_file ==="
  ts_file="core/workforce/$test_file"

  npx tsc \
    --target ES2022 \
    --module CommonJS \
    --moduleResolution Node \
    --esModuleInterop \
    --skipLibCheck \
    --strict \
    --types node \
    --outDir "$OUT" \
    "$ts_file"

  js_file="$OUT/core/workforce/${test_file%.ts}.js"
  if [[ ! -f "$js_file" ]]; then
    echo "Compiled test not found: $js_file"
    exit 1
  fi

  node "$js_file"
  echo
 done

echo "K.I.N.G.S. FOCUSED WORKFORCE TESTS: SUCCESS"
