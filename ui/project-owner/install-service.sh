#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVICE_SRC="$ROOT/ui/project-owner/kings-coding-machine.service"
SERVICE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
SERVICE_DST="$SERVICE_DIR/kings-coding-machine.service"

mkdir -p "$SERVICE_DIR"
cp "$SERVICE_SRC" "$SERVICE_DST"
chmod +x "$ROOT/ui/project-owner/start-local.sh"

systemctl --user daemon-reload
systemctl --user enable --now kings-coding-machine.service

printf '\nKINGS CODING MACHINE SERVICE INSTALLED\n'
printf 'Status: systemctl --user status kings-coding-machine.service\n'
printf 'Stop:   systemctl --user stop kings-coding-machine.service\n'
printf 'Start:  systemctl --user start kings-coding-machine.service\n'
printf 'Logs:   journalctl --user -u kings-coding-machine.service -f\n'
printf 'Open:   http://kings.local:8787\n'
