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

CA_KEY="$CERT_DIR/kings-local-ca.key.pem"
CA_CERT="$CERT_DIR/kings-local-ca.cert.pem"

if [[ ! -f "$CA_KEY" || ! -f "$CA_CERT" ]]; then
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$CA_KEY" \
    -out "$CA_CERT" \
    -days 825 \
    -subj "/CN=K.I.N.G.S. Local Development CA" \
    >/dev/null 2>&1
fi

create_leaf_cert() {
  local host="$1"
  local key="$CERT_DIR/${host}.key.pem"
  local csr="$CERT_DIR/${host}.csr.pem"
  local cert="$CERT_DIR/${host}.cert.pem"
  local ext="$CERT_DIR/${host}.ext.cnf"

  if [[ -f "$key" && -f "$cert" ]]; then
    return
  fi

  openssl req -new -newkey rsa:2048 -nodes \
    -keyout "$key" \
    -out "$csr" \
    -subj "/CN=${host}" \
    >/dev/null 2>&1

  cat >"$ext" <<EOF
basicConstraints=CA:FALSE
subjectAltName=DNS:${host},DNS:localhost,IP:127.0.0.1
extendedKeyUsage=serverAuth
EOF

  openssl x509 -req \
    -in "$csr" \
    -CA "$CA_CERT" \
    -CAkey "$CA_KEY" \
    -CAcreateserial \
    -out "$cert" \
    -days 825 \
    -sha256 \
    -extfile "$ext" \
    >/dev/null 2>&1
}

create_leaf_cert "$KINGS_HOST"
create_leaf_cert "$FORGE_HOST"

HOSTS_FILE="/etc/hosts"
if [[ -w "$HOSTS_FILE" ]]; then
  for host in "$KINGS_HOST" "$FORGE_HOST"; do
    if ! grep -qE "^[[:space:]]*127\.0\.0\.1[[:space:]].*\b${host}\b" "$HOSTS_FILE"; then
      printf '\n127.0.0.1 %s\n' "$host" >> "$HOSTS_FILE"
    fi
  done
else
  echo "WARNING: cannot modify $HOSTS_FILE as current user."
  echo "The services still bind to 127.0.0.1; use localhost URLs if Chrome resolves them, or add the hostnames manually."
fi

cat <<EOF
Local HTTPS runtime assets are ready.

K.I.N.G.S.:
  https://${KINGS_HOST}:${KINGS_PORT}
  https://${KINGS_HOST}:${KINGS_PORT}/health

Author's Forge:
  https://${FORGE_HOST}:${FORGE_PORT}
  https://${FORGE_HOST}:${FORGE_PORT}/health

Local CA:
  $CA_CERT

To make Chrome trust both services, import the local CA certificate into the ChromeOS/Linux trust store as appropriate for your environment.
EOF
