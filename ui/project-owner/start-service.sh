#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${ROOT}/.kings-ui-build"
NODE_BIN="${KINGS_CODING_MACHINE_NODE:-$(command -v node || true)}"

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "KINGS CODING MACHINE: node executable not found" >&2
  exit 1
fi

SERVER="$OUT/ui/project-owner/local-server.js"

if [[ ! -f "$SERVER" ]]; then
  echo "KINGS CODING MACHINE: compiled local server missing: $SERVER" >&2
  echo "Run ui/project-owner/start-local.sh once to build the service runtime." >&2
  exit 1
fi

export PATH="$(dirname "$NODE_BIN"):/usr/local/bin:/usr/bin:/bin:${HOME}/.local/bin"
exec "$NODE_BIN" "$SERVER"
