#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UNIT_NAME="kings-coding-machine.service"
BASE_URL="${KINGS_CODING_MACHINE_STATUS_URL:-http://127.0.0.1:8787}"
STATE_ROOT="${KINGS_STATE_ROOT:-${ROOT}/.kings}"
TOKEN_FILE="${KINGS_OWNER_TOKEN_FILE:-${STATE_ROOT}/owner-token}"
OWNER_TOKEN="${KINGS_OWNER_TOKEN:-}"

if [[ -z "$OWNER_TOKEN" && -s "$TOKEN_FILE" ]]; then
  OWNER_TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"
fi

CURL_AUTH=()
if [[ -n "$OWNER_TOKEN" ]]; then
  CURL_AUTH=(-H "Authorization: Bearer ${OWNER_TOKEN}")
fi

if systemctl --user is-active --quiet "$UNIT_NAME"; then
  echo "KINGS CODING MACHINE SERVICE: RUNNING"
else
  echo "KINGS CODING MACHINE SERVICE: STOPPED"
fi

echo "URL: http://kings.local:8787"
echo "FALLBACK: ${BASE_URL}"

echo
if ! command -v curl >/dev/null 2>&1; then
  echo "PRODUCTION READINESS: UNKNOWN"
  echo "curl is required to query the live K.I.N.G.S. readiness endpoint."
else
  ready_body="$(curl "${CURL_AUTH[@]}" --fail --silent --show-error --max-time 10 "${BASE_URL}/ready" 2>/dev/null)"
  ready_status=$?
  if [[ "$ready_status" -eq 0 ]]; then
    echo "PRODUCTION READINESS: READY"
    printf '%s\n' "$ready_body"
  else
    echo "PRODUCTION READINESS: NOT READY"
    echo "The service may be running, but one or more mandatory execution dependencies are unavailable or owner authentication is required."
    health_body="$(curl "${CURL_AUTH[@]}" --silent --show-error --max-time 10 "${BASE_URL}/health" 2>/dev/null || true)"
    if [[ -n "$health_body" ]]; then
      printf '%s\n' "$health_body"
    else
      echo "Health endpoint is unreachable at ${BASE_URL}/health."
    fi
  fi
fi

echo
echo "===== SERVICE STATUS ====="
systemctl --user --no-pager --full status "$UNIT_NAME" || true
