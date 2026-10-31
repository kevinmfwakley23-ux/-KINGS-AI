# K.I.N.G.S. AI on Android

K.I.N.G.S. AI ships an installable Tauri Android client. The APK is the secure
owner interface; the owner-controlled K.I.N.G.S. runtime supplies routed AI,
coding tools, collectibles research, memory, and evidence through trusted HTTPS.
The phone does not need to hold provider credentials or the model-training
toolchain.

## Build artifact

The `K.I.N.G.S. Android Native APK` GitHub Actions workflow builds with pinned
Node, Java, Android SDK, NDK, Rust, and Tauri versions. It verifies every APK
with Android `apksigner`, generates `SHA256SUMS`, and publishes both with an
`INSTALL.txt` file as the `kings-ai-android-debug-<commit>` workflow artifact.

For a review branch, open a pull request to `main`. Any Android/native-shell
change runs the APK workflow. The workflow can also be started manually with
`workflow_dispatch` for a selected branch.

## Install the review APK

1. Open the successful Android workflow run in GitHub and download its artifact.
2. Extract the ZIP and choose the APK for the phone. Current Android phones
   normally use the `arm64`/`aarch64` build.
3. Verify the APK SHA-256 against `SHA256SUMS`.
4. On the phone, allow installs from the browser or file manager used to open
   the APK, then install it.
5. Open K.I.N.G.S. AI and enter the HTTPS origin of the deployed owner runtime.
6. Enter William's owner token in the one-time bootstrap field. The APK clears
   the field before navigation and never stores the reusable token.

The CI artifact is debug-signed for installation and review. A production Play
Store or long-term release build requires William's private Android signing key;
that key must live in an approved secret manager and must never be committed.

## Owner runtime requirements

- Serve the owner console through trusted HTTPS.
- Set `KINGS_CODING_MACHINE_BIND=0.0.0.0` only behind the trusted HTTPS proxy or
  tunnel.
- Supply `KINGS_CODING_MACHINE_TOKEN` from a secret manager; do not put it in
  the repository or APK.
- Set `KINGS_INTELLIGENCE_MODE=sovereign` (the default). Use an owner-operated
  inference server with `KINGS_SELF_HOSTED_BASE_URL` and
  `KINGS_SELF_HOSTED_MODEL`, or local Ollama with `KINGS_OLLAMA_BASE_URL`
  and `KINGS_OLLAMA_MODEL`.
  External AI gateways are not registered in this mode. Without a configured
  local model, inference fails closed rather than showing fabricated answers.
- The app is a native HTTPS client, not a phone-hosted trained foundation model.
  The backend must remain online for model inference and coding tools. This
  package does not independently prove specialist model quality or offline use.
- Run `npm run verify` before deployment and verify `/health` plus authenticated
  owner status after deployment.
