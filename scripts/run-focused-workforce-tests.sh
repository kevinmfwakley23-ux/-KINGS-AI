#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${ROOT}/.kings-focused-test-build"

rm -rf "$OUT"
mkdir -p "$OUT"

mapfile -t TEST_PATHS < <(find "$ROOT/core/workforce" -maxdepth 1 -type f -name '*-test.ts' -printf '%p\n' | sort)

if [[ ${#TEST_PATHS[@]} -eq 0 ]]; then
  echo "No focused workforce tests found."
  exit 1
fi

echo "K.I.N.G.S. focused workforce verification"
echo "Found ${#TEST_PATHS[@]} test files."
echo

for test_path in "${TEST_PATHS[@]}"; do
  test_file="${test_path#${ROOT}/}"
  echo "=== ${test_file} ==="

  npx tsc \
    --target ES2022 \
    --module CommonJS \
    --moduleResolution Node \
    --esModuleInterop \
    --skipLibCheck \
    --strict \
    --types node \
    --outDir "$OUT" \
    "$test_path"

  relative_ts="${test_path#${ROOT}/}"
  relative_js="${relative_ts%.ts}.js"
  js_file="$OUT/$relative_js"

  if [[ ! -f "$js_file" ]]; then
    echo "Compiled test not found: $js_file"
    echo "Emitted files under $OUT:"
    find "$OUT" -type f | sort | head -50
    exit 1
  fi

  node "$js_file"
  echo
done

echo "K.I.N.G.S. FOCUSED WORKFORCE TESTS: SUCCESS"
