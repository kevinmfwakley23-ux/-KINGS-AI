#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="${KINGS_LOCAL_HTTPS_CERT_DIR:-${ROOT_DIR}/.kings-local-https}"
KINGS_PORT="${KINGS_CODING_MACHINE_HTTPS_PORT:-8787}"
FORGE_PORT="${AUTHORS_FORGE_HTTPS_PORT:-8788}"
KINGS_HOST="${KINGS_CODING_MACHINE_HTTPS_HOST:-kings.localhost}"
FORGE_HOST="${AUTHORS_FORGE_HTTPS_HOST:-authors-forge.localhost}"

export KINGS_CODING_MACHINE_HTTPS_PORT="$KINGS_PORT"
export AUTHORS_FORGE_HTTPS_PORT="$FORGE_PORT"
export KINGS_CODING_MACHINE_HTTPS_HOST="$KINGS_HOST"
export AUTHORS_FORGE_HTTPS_HOST="$FORGE_HOST"
export KINGS_LOCAL_HTTPS_CERT_DIR="$CERT_DIR"

bash "$ROOT_DIR/scripts/serve-local-https.sh"

exec node "$ROOT_DIR/.kings-ui-build/ui/project-owner/https-runtime.js"
