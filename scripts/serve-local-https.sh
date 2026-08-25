#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="${KINGS_LOCAL_HTTPS_CERT_DIR:-${ROOT_DIR}/.kings-local-https}"
mkdir -p "$CERT_DIR"

KINGS_PORT="${KINGS_CODING_MACHINE_HTTPS_PORT:-8787}"
FORGE_PORT="${AUTHORS_FORGE_HTTPS_PORT:-8788}"
KINGS_HOST="${KINGS_CODING_MACHINE_HTTPS_HOST:-kings.localhost}"
FORGE_HOST="${AUTHORS_FORGE_HTTPS_HOST:-authors-forge.localhost}"

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to create local certificates." >&2
  exit 1
fi

create_cert() {
  local host="$1"
  local key="$CERT_DIR/${host}.key.pem"
  local cert="$CERT_DIR/${host}.cert.pem"
  local cnf="$CERT_DIR/${host}.cnf"

  if [[ -f "$key" && -f "$cert" ]]; then
    return
  fi

  cat >"$cnf" <<EOF
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
    -config "$cnf" \
    >/dev/null 2>&1
}

create_cert "$KINGS_HOST"
create_cert "$FORGE_HOST"

HOSTS_FILE="/etc/hosts"
if [[ -w "$HOSTS_FILE" ]]; then
  for host in "$KINGS_HOST" "$FORGE_HOST"; do
    if ! grep -qE "^[[:space:]]*127\.0\.0\.1[[:space:]].*\b${host}\b" "$HOSTS_FILE"; then
      printf '\n127.0.0.1 %s\n' "$host" >> "$HOSTS_FILE"
    fi
  done
else
  echo "WARNING: cannot modify $HOSTS_FILE as current user."
  echo "Chrome may still resolve *.localhost automatically; otherwise add both hosts to /etc/hosts manually."
fi

cat <<EOF
Local HTTPS setup complete.

Certificates:
  $CERT_DIR

K.I.N.G.S.:
  https://${KINGS_HOST}:${KINGS_PORT}
  https://${KINGS_HOST}:${KINGS_PORT}/health

Author's Forge:
  https://${FORGE_HOST}:${FORGE_PORT}
  https://${FORGE_HOST}:${FORGE_PORT}/health

These certificates are local development certificates only.
Chrome may warn that they are not trusted until the local CA/certificates are explicitly trusted.
EOF
