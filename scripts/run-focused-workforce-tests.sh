#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${ROOT}/.kings-focused-test-build"
REPORT="${ROOT}/.kings-focused-test-report.txt"

rm -rf "$OUT"
mkdir -p "$OUT"
: > "$REPORT"

mapfile -t TESTS < <(find "$ROOT/core/workforce" -maxdepth 1 -type f -name '*-test.ts' -printf '%p\n' | sort)

if [[ ${#TESTS[@]} -eq 0 ]]; then
  echo "No focused workforce tests found."
  exit 1
fi

echo "K.I.N.G.S. full focused workforce verification"
echo "Found ${#TESTS[@]} test files."
echo "Failures will be collected; the suite will continue."
echo

total=0
passed=0
failed=0

for source_file in "${TESTS[@]}"; do
  total=$((total + 1))
  test_file="$(basename "$source_file")"
  test_build="$OUT/${test_file%.ts}"
  test_log="$test_build.log"
  mkdir -p "$test_build"

  echo "=== [$total/${#TESTS[@]}] $test_file ==="

  if ! npx tsc \
    --target ES2022 \
    --module CommonJS \
    --moduleResolution Node \
    --esModuleInterop \
    --skipLibCheck \
    --strict \
    --types node \
    --outDir "$test_build" \
    "$source_file" >"$test_log" 2>&1; then
    failed=$((failed + 1))
    printf 'COMPILE FAILURE | %s\n' "$test_file" | tee -a "$REPORT"
    cat "$test_log" | tee -a "$REPORT"
    echo | tee -a "$REPORT"
    echo "RESULT: COMPILE FAILURE"
    echo
    continue
  fi

  mapfile -t emitted_tests < <(find "$test_build" -type f -name "${test_file%.ts}.js" -print | sort)

  if [[ ${#emitted_tests[@]} -ne 1 ]]; then
    failed=$((failed + 1))
    printf 'EMIT FAILURE | %s\n' "$test_file" | tee -a "$REPORT"
    if [[ ${#emitted_tests[@]} -eq 0 ]]; then
      printf 'Expected emitted test basename: %s.js\n' "${test_file%.ts}" | tee -a "$REPORT"
    else
      printf 'Multiple emitted test matches found:\n' | tee -a "$REPORT"
      printf '%s\n' "${emitted_tests[@]}" | tee -a "$REPORT"
    fi
    printf 'All emitted JavaScript files:\n' | tee -a "$REPORT"
    find "$test_build" -type f -name '*.js' -print | sort | tee -a "$REPORT"
    echo | tee -a "$REPORT"
    echo "RESULT: EMIT FAILURE"
    echo
    continue
  fi

  js_file="${emitted_tests[0]}"

  if node "$js_file" >"$test_log" 2>&1; then
    passed=$((passed + 1))
    echo "RESULT: PASS"
  else
    failed=$((failed + 1))
    printf 'RUNTIME FAILURE | %s\n' "$test_file" | tee -a "$REPORT"
    cat "$test_log" | tee -a "$REPORT"
    echo | tee -a "$REPORT"
    echo "RESULT: RUNTIME FAILURE"
  fi

  echo

done

{
  echo "K.I.N.G.S. FOCUSED WORKFORCE TEST SUMMARY"
  echo "Total: $total"
  echo "Passed: $passed"
  echo "Failed: $failed"
  echo "Report: $REPORT"
} | tee -a "$REPORT"

echo
if [[ "$failed" -eq 0 ]]; then
  echo "K.I.N.G.S. FOCUSED WORKFORCE TESTS: SUCCESS"
  exit 0
fi

echo "K.I.N.G.S. FOCUSED WORKFORCE TESTS: FAILURES COLLECTED"
echo "Open $REPORT for the complete failure list."
exit 2
