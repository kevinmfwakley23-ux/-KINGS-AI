#!/usr/bin/env bash
# Install and launch the actual published review APK on a clean Android emulator.
# No owner tokens, model credentials, network backend, or fake test responses.
set -euo pipefail

artifact_dir="${1:-android-artifacts}"
app_id="ai.kings.owner"
if [[ ! -d "$artifact_dir" ]]; then
  echo "Missing downloaded Android artifact directory: $artifact_dir" >&2
  exit 1
fi
mapfile -t apks < <(find "$artifact_dir" -maxdepth 1 -type f -name '*.apk' | sort)
if [[ "${#apks[@]}" -ne 1 ]]; then
  echo "Expected exactly one published APK; found ${#apks[@]}" >&2
  exit 1
fi
if [[ ! -f "$artifact_dir/SHA256SUMS" ]]; then
  echo "Missing published Android checksum manifest" >&2
  exit 1
fi
(cd "$artifact_dir" && sha256sum --check SHA256SUMS)

adb wait-for-device
if [[ "$(adb shell getprop sys.boot_completed | tr -d '\r')" != "1" ]]; then
  echo "Android emulator is not booted" >&2
  exit 1
fi
adb install -r "${apks[0]}"
if ! adb shell pm path "$app_id" | tr -d '\r' | grep -q '^package:'; then
  echo "APK did not install under expected app identity: $app_id" >&2
  exit 1
fi

adb logcat -c
launch_output="$(adb shell monkey -p "$app_id" -c android.intent.category.LAUNCHER 1 2>&1)"
printf '%s\n' "$launch_output"
if ! grep -q 'Events injected: 1' <<< "$launch_output"; then
  echo "Android launcher failed to dispatch the K.I.N.G.S. app" >&2
  exit 1
fi

launched=false
for attempt in {1..20}; do
  if adb shell pidof "$app_id" 2>/dev/null | tr -d '\r' | grep -Eq '^[0-9]+'; then
    launched=true
    break
  fi
  sleep 2
done
if [[ "$launched" != true ]]; then
  echo "K.I.N.G.S. process did not start on Android" >&2
  adb logcat -d -t 150 >&2 || true
  exit 1
fi
sleep 5
if ! adb shell pidof "$app_id" 2>/dev/null | tr -d '\r' | grep -Eq '^[0-9]+'; then
  echo "K.I.N.G.S. Android process exited immediately after launch" >&2
  adb logcat -d -t 150 >&2 || true
  exit 1
fi

# This proves an install and live process, NOT an authenticated backend or AI.
echo "K.I.N.G.S. Android emulator install + launcher smoke: PASS"
