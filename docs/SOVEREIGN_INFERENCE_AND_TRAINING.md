# K.I.N.G.S. AI — sovereign inference and real training

## Enforced execution boundary

`KINGS_INTELLIGENCE_MODE=sovereign` is the default for the owner mission
executor, the app-facing Responses API and the seven-domain live benchmark.
Two owner-operated inference adapters are supported: `kings-self-hosted` uses an
OpenAI-compatible local model server (for example llama.cpp or vLLM serving
your own weights), and `ollama-internal` provides a local fallback. The
default priority is `kings-self-hosted,ollama-internal`. Both stay under
K.I.N.G.S. routing and agent governance. OmniRoute, 9Router, and other
remote model services cannot silently execute
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

Supply a real local model using an owner-operated OpenAI-compatible
inference server, Ollama, or both:

```bash
export KINGS_INTELLIGENCE_MODE=sovereign
# Preferred when serving K.I.N.G.S.-controlled weights on llama.cpp/vLLM:
export KINGS_SELF_HOSTED_BASE_URL=http://127.0.0.1:8000/v1
export KINGS_SELF_HOSTED_MODEL='<exact-locally-loaded-model>'
# Capabilities must reflect verified actual capabilities, not promises:
export KINGS_SELF_HOSTED_CAPABILITIES=reasoning
# Optional fallback, if installed:
export KINGS_OLLAMA_BASE_URL=http://127.0.0.1:11434
export KINGS_OLLAMA_MODEL='<exact-installed-local-model>'
export KINGS_APP_ROUTER_PROVIDER_ORDER=kings-self-hosted,ollama-internal
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

When using `KINGS_SELF_HOSTED_BASE_URL`, its path must be `/v1`, and its
`KINGS_SELF_HOSTED_MODEL` must name the loaded model exactly—not an
auto-routed virtual provider. The internal adapter preserves token usage and
model identity in K.I.N.G.S. evidence. Absent/unverified capabilities are not
fabricated. This is an operational inference route, not proof of model quality.

If a self-hosted inference GPU is on another machine, use a private IP address
or an exact, owner-controlled hostname in
`KINGS_SOVEREIGN_INFERENCE_HOSTS`; never expose unprotected raw Ollama
inference ports. The configured context window is sent to the actual Ollama
`num_ctx` field, not merely displayed on a settings screen. Hardware and
model support determine the real usable context.

## Use the seven K.I.N.G.S. specialist offices

After deploying the owner runtime behind authenticated HTTPS, the Android,
macOS, Windows and browser owner console shows a **K.I.N.G.S. Sovereign Chat**
section. The seven office options are chat, coding, collectibles, sports
cards, book editing, publishing, and storytelling. `GET /api/owner-chat`
reports model identity and declared capabilities. An owner-authorized
`POST /api/owner-chat` sends a bounded chat request to the actual owner-operated
inference engine. This does not hand off to outside AI agents.

If no model qualifies for the selected specialist capabilities, the request
returns `NO_QUALIFIED_LOCAL_MODEL` (503) rather than substituting an unrelated
model or a fabricated answer. Declared capabilities are owner configuration,
**not** verification that the model performs at a professional level.

## On-demand web research without outside AI inference

The owner console provides a first-party internet research panel backed by
`POST /api/owner-research`. The server requires the owner's session and
`X-KINGS-Owner-Action: retrieve-public-sources`. Supply a question and at
most five explicit public HTTPS source URLs. K.I.N.G.S. runs the existing
governed `AppBrainGateway` and `WebAccessAdapter` (private-network blocked,
redirects disabled, response/time bounded). No outside AI agent is invoked.
No permanent knowledge promotion or model weight training occurs implicitly.

This is source retrieval rather than an unlimited autonomous crawler. Real
source access must be tested with backend network permissions; fetching
content does not establish a legal right to train on that content.

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

## Doubled training capability — supervised LoRA + preference DPO

The optional second **real gradient-training program** is
`runtimes/powerhouse-training/sovereign_preference_stage.py`. It is invoked
after successful supervised LoRA updates when the owner supplies
`--preference-package`. Unlike repeatedly training on the same answers,
the second program uses **new, separate, rights-cleared chosen/rejected
response pairs** to optimize answer preference through direct preference
optimization (DPO).

Training runs only on the owner-approved local model. Before stage-two updates,
K.I.N.G.S. computes a frozen **post-supervised policy** reference from the
same loaded model; no outside AI agent, teacher API or second remote model
is used. The optimizer interleaves all seven specialist domains, clips
gradients, requires finite loss, and refuses to publish an adapter unless
both training stages genuinely update trainable weights.

The private JSON preference package uses `schemaVersion: "1"` and a `pairs`
array. Each pair contains precisely `id`, `domain`, `sourceGroupId`,
`prompt`, `chosenResponse`, `rejectedResponse`, and `rights`.
`rights` requires the same author/license/permission evidence as supervised
training, with `trainingAllowed: true`. The chosen and rejected answers
must be different; each domain requires at least **20 preference pairs**.
All preference IDs, source groups and prompts must be disjoint from the
supervised examples **and the benchmark manifest**. For the minimum dataset,
stage one consumes at least 140 distinct supervised examples, and stage two
consumes at least 140 **additional** preference pairs. These counts are
minimum preflight checks, not evidence of high model capability.

Run both-stage validation without loading weights or running a gradient:

```bash
python3 runtimes/powerhouse-training/sovereign_lora_trainer.py \
  --base-model /private/models/licensed-base \
  --training-package /private/kings/train-package.json \
  --preference-package /private/kings/preferences.json \
  --benchmark-manifest /private/kings/benchmark-manifest.json \
  --model-artifact /private/kings/output/kings-dual-stage.zip \
  --preference-epochs 1 --preference-beta 0.1 \
  --preference-learning-rate 0.00002 --validate-only
```

To perform real supervised + preference training, omit `--validate-only`
after the owner verifies the model license, dataset provenance, GPU capacity,
training budget and authorized runner. Both phases execute on the same
in-memory model; a final adapter contains both updates, a preference-package
SHA-256, supervised optimization evidence and separate DPO optimization
evidence. Preference training can be more computationally demanding than
supervised training because every pair requires reference and policy scores.

For the signed `npm run train:powerhouse` launcher, the owner-approved
`runner.args` must include `"--preference-package", "{preferencePackage}"`.
The launch manifest's `runner.preferencePackagePath` must be an absolute path
inside its authorized working directory and
`runner.preferencePackageSha256` must equal both the file's real SHA-256
and `job.hyperparameters.preferencePackageSha256`. Additionally,
`runner.preferenceTrainerArtifactPath` must identify
`sovereign_preference_stage.py` alongside the pinned supervised trainer,
and `runner.preferenceTrainerSha256` must match both the file's SHA-256
and `job.hyperparameters.preferenceTrainerSha256`. The launcher verifies
**both the dataset and the imported optimizer code** before and after the
run, rejects unbound preference paths or source-code substitution, and
incorporates both digests in the owner-signed training record.
Never commit training packages, evaluation prompts, model files or
owner secrets to Git.

**Status:** The two-stage training implementation and preflight tests exist.
That is not a completed GPU training run, proof of K.I.N.G.S. original
pretraining, or an independent held-out seven-office qualification. The
second stage can run only when genuine licensed weights and owner-attested
preference datasets are available. Real specialized evaluations remain a
separate release gate.

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
