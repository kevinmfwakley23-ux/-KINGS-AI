#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="${KINGS_LOCAL_HTTPS_CERT_DIR:-${ROOT_DIR}/.kings-local-https}"
mkdir -p "$CERT_DIR"

KINGS_PORT="${KINGS_CODING_MACHINE_PORT:-8787}"
FORGE_PORT="${AUTHORS_FORGE_PORT:-8788}"
KINGS_HOST="${KINGS_CODING_MACHINE_HOST:-kings.localhost}"
FORGE_HOST="${AUTHORS_FORGE_HOST:-authors-forge.localhost}"

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to create local certificates." >&2
  exit 1
fi

create_cert() {
  local host="$1"
  local key="$CERT_DIR/${host}.key.pem"
  local cert="$CERT_DIR/${host}.cert.pem"

  if [[ -f "$key" && -f "$cert" ]]; then
    return
  fi

  cat >"$CERT_DIR/${host}.cnf" <<EOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = ${host}

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${host}
DNS.2 = localhost
IP.1 = 127.0.0.1
EOF

  openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "$key" \
    -out "$cert" \
    -days 825 \
    -config "$CERT_DIR/${host}.cnf" \
    >/dev/null 2>&1
}

create_cert "$KINGS_HOST"
create_cert "$FORGE_HOST"

cat <<EOF
Local HTTPS certificates created under:
  $CERT_DIR

K.I.N.G.S. HTTP runtime:
  http://localhost:${KINGS_PORT}

Author's Forge HTTP runtime (reserved separate port):
  http://localhost:${FORGE_PORT}

Hosts/certs prepared for future isolated HTTPS:
  ${KINGS_HOST}
  ${FORGE_HOST}

These are local development certificates only. They are not public TLS certificates.
EOF
