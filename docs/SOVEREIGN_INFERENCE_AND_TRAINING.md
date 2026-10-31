# K.I.N.G.S. AI — sovereign inference and real training

## Enforced execution boundary

`KINGS_INTELLIGENCE_MODE=sovereign` is the default for the owner mission
executor, the app-facing Responses API and the seven-domain live benchmark.
Only owner-operated local Ollama inference is currently auto-registered.
OmniRoute, 9Router, and other remote model services cannot silently execute
in sovereign mode, even if gateway credentials exist. A process with no local
model configured cannot generate an answer and must remain unqualified.

The owner controls the K.I.N.G.S. workforce, tool permissions, repository
writes, runtime, evaluation, recovery, and training. **This is not proof that
the original base-model weights were created by K.I.N.G.S.** A licensed
third-party open-weight base fine-tuned by K.I.N.G.S. remains derivative
until independent original model training is undertaken and proven.

Internet research remains available via the existing authenticated HTTPS
research endpoint with private-network blocking, source provenance, and
bounds. Research retrieval is not automatic model-weight training. Copyright,
data provenance, and permission requirements still apply.

## Local deployment — no outside AI agents

Supply a real local model and an owner-operated Ollama server:

```bash
export KINGS_INTELLIGENCE_MODE=sovereign
export KINGS_OLLAMA_BASE_URL=http://127.0.0.1:11434
export KINGS_OLLAMA_MODEL='<exact-installed-local-model>'
export KINGS_APP_ROUTER_PROVIDER_ORDER=ollama-internal
# Optional: verify sufficient RAM/VRAM before raising context.
export KINGS_OLLAMA_CONTEXT_TOKENS=32768
npm run verify
npm start
```

The owner console provides governed autonomous coding missions. Use
`npm run start:router` to run the separate app-facing local Responses API.
Remote Android/Windows/macOS clients need a trusted HTTPS reverse proxy and
authenticated owner sessions. **The Android APK is a native client, not a
phone-hosted foundation model.** The runtime must be reachable.

If a self-hosted inference GPU is on another machine, use a private IP address
or an exact, owner-controlled hostname in
`KINGS_SOVEREIGN_INFERENCE_HOSTS`; never expose unprotected raw Ollama
inference ports. The configured context window is sent to the actual Ollama
`num_ctx` field, not merely displayed on a settings screen. Hardware and
model support determine the real usable context.

## Genuine local fine-tuning

`runtimes/powerhouse-training/sovereign_lora_trainer.py` contains a real
offline LoRA gradient-training implementation. It requires Python, PyTorch,
Transformers, PEFT, Accelerate, and a **local, licensed, owner-approved base
model** with tokenizer and model weights already present on disk.

It consumes the existing private `PowerhouseTrainingPackage` and benchmark
manifest. Preflight fails closed on missing permission attestations, missing
training examples, duplicate prompts, or source groups overlapping validation
and held-out evaluation. Minimum training quantity is **20 examples for each of
the seven domains**, not a claim of sufficient model quality.

To preflight without downloading weights or running a trainer:

```bash
python3 runtimes/powerhouse-training/sovereign_lora_trainer.py \
  --training-package /private/kings/train-package.json \
  --benchmark-manifest /private/kings/benchmark-manifest.json \
  --model-artifact /private/kings/output/kings-adapter.zip \
  --base-model /private/models/licensed-base \
  --validate-only
```

For a real training run, install the optional dependencies into a trusted
offline-compatible Python environment and omit `--validate-only`.
Training uses local model files only, does not execute remote model code, and
disables Hugging Face online access during execution. It trains on approved
prompt/response pairs with target-response-only loss, saves nonempty
`safetensors` LoRA weights plus tokenizer into a ZIP, and prints its hash.
An interrupted/error run must not yield a valid trained model artifact.

The existing `npm run train:powerhouse` is the preferred owner-authorized
launcher: use the absolute Python executable path as `runner.command`, the
trainer script path as a fixed runner argument, and the required
`{trainingPackage}`, `{benchmarkManifest}`, `{modelArtifact}` placeholders
as the values of the corresponding command-line options. The launcher binds
the owner-approved trainer and base identities, checks immutable hashes,
runs without shell/network permission, bounds time and writes a signed build
record. **Never place actual private training data or model weights in Git.**

The resulting adapter is **not** a standalone model: it must be combined with
the exact licensed base model, validated, and exported into a format actually
supported by the owner-operated inference engine. Do not label it ready for
production until full end-to-end inference and independent seven-domain
held-out evaluation have passed.

## Release gates

1. Confirm local model ownership, license, source, actual weights, and hardware.
2. Produce a signed real training build and adapter weight hash.
3. Independently validate and export a deployable inference model.
4. Run private held-out assessments across all seven specialist domains;
   no simulated answers, grades, coding successes, or competitive claims.
5. Verify autonomous code writes/rollbacks, internet-research authorization,
   owner access, and per-user quota/ledger integration.
6. Test on physical Android and supported Windows/macOS computers before
   signing and publishing production releases.

`KINGS_INTELLIGENCE_MODE=hybrid` exists for explicitly approved compatibility
deployments, but it is **not** compliant with the owner's independent-model
goal. The architecture change from the previous cloud-first default is a
deliberate owner instruction and requires owner PR review before merging.
