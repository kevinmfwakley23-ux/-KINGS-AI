#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${ROOT}/.kings-focused-test-build"

rm -rf "$OUT"
mkdir -p "$OUT"

mapfile -t TESTS < <(find "$ROOT/core/workforce" -maxdepth 1 -type f -name '*-test.ts' -printf '%p\n' | sort)

if [[ ${#TESTS[@]} -eq 0 ]]; then
  echo "No focused workforce tests found."
  exit 1
fi

echo "K.I.N.G.S. focused workforce verification"
echo "Found ${#TESTS[@]} test files."
echo

for source_file in "${TESTS[@]}"; do
  test_file="$(basename "$source_file")"
  echo "=== $source_file ==="

  npx tsc \
    --target ES2022 \
    --module CommonJS \
    --moduleResolution Node \
    --esModuleInterop \
    --skipLibCheck \
    --strict \
    --types node \
    --outDir "$OUT" \
    "$source_file"

  js_file="$OUT/${test_file%.ts}.js"
  if [[ ! -f "$js_file" ]]; then
    echo "Compiled test not found: $js_file"
    echo "Emitted files under $OUT:"
    find "$OUT" -maxdepth 3 -type f -name '*.js' -print | sort
    exit 1
  fi

  node "$js_file"
  echo
done

echo "K.I.N.G.S. FOCUSED WORKFORCE TESTS: SUCCESS"
