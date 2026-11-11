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

**Owner token budgets:** The maximum API-requested completion length is now
16,384 tokens (up from 8,192); the default stays conservative at 1,536.
Higher output limits are usable only when the actual locally deployed model
declares a large enough context window. The owner-chat service adds the
UTF-8 message byte budget, explicit message/framing reserves, and requested
output before routing. The general K.I.N.G.S. router then filters out models
whose declared context is smaller, even during permitted local failover.
Undersized requests fail with `INSUFFICIENT_LOCAL_CONTEXT` (422), not a
provider substitution. The byte-based check is conservative and **not** an
exact tokenizer, hardware, VRAM or throughput guarantee. Do not increase
`KINGS_SELF_HOSTED_CONTEXT_TOKENS` or `KINGS_OLLAMA_CONTEXT_TOKENS` past
what the loaded model and inference server can actually sustain.

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

## Strengthened training passes and seven-domain sampling

The offline supervised LoRA trainer now defaults to **three full supervised
epochs**. When the separately authorized DPO preference dataset is supplied,
the preference optimizer also defaults to **three full epochs**. Each stage
still uses real gradient updates and checks that the trainable weights changed.
This is the owner's triple-pass training schedule across **two different
gradient-training programs**, not three independently trained foundation models
or a third separate learning algorithm. The two-stage run performs up to six
epoch passes (three SFT and three DPO) on separate rights-cleared datasets,
**not** six times as many independent examples. The previous default was two
epochs per stage. More epochs can overfit small datasets and can reduce
held-out performance; compare held-out results against the previous checkpoint
and reduce `--epochs` or `--preference-epochs` if quality regresses.
The owner must still supply real licensed weights, data, compute, and evaluation
before claiming improved expertise.

Supervised examples are shuffled deterministically by the owner-approved seed
within each specialist domain, then interleaved round-robin without replacement.
This prevents the largest source domain from dominating consecutive training
steps, while preserving all seven domains and the exact example count.
The supervised package is bounded to 200,000 examples before any GPU work.

The `--validate-only` result now reports `supervisedEpochs`,
`preferenceEpochs`, and `domainSampling` so the owner can inspect the
effective plan without creating an adapter.

**Curriculum enforcement:** The supervised stage uses a deterministic,
seeded interleaving of all seven domains and an explicit sequential optimizer
sampler. Hugging Face's default random sampler would otherwise undo this
order. With unequal domain dataset sizes, later portions of an epoch can still
contain more examples from the larger domain; the scheduler does **not** fake
new examples or silently duplicate the smaller datasets.

**Long-form training:** Every approved supervised answer is now segmented into
response-only-loss records (up to 256 bounded segments per response, and
200,000 segments per run). Each segment includes real prompt/preceding-answer
context; target spans do not overlap or disappear. The training artifact records
`supervisedSegmentCount`, `supervisedTargetTokens`,
`supervisedExamplesByDomain`, and `targetResponseTruncations: 0` after
successful training. A run that exceeds segment budgets fails instead of
silently chopping off important book chapters or coding responses.

**Preference-stage long answers:** DPO likewise consumes full chosen/rejected
answers as bounded segments, up to 16 per answer. The preference optimizer
computes a true DPO margin and backpropagates each segment separately with
the exact scalar gradient coefficients, avoiding retention of all segment
activation graphs at once. It uses eval-mode deterministic forward passes
while still updating trainable adapter parameters, then verifies genuine
weight changes. This is slower than truncated training but protects long-form
content. Over-budget answers fail closed rather than being mislabeled trained.
Run the optional local PyTorch smoke check with
`python3 development/sovereign-preference-gradient-smoke.py`
to verify that the preference adapter changes while base weights stay frozen.

**Measured learning, not assumed learning:** After DPO optimization, K.I.N.G.S.
recomputes the chosen-versus-rejected log-probability margins against the
frozen post-SFT reference. Its adapter metadata includes
`trainingPairMeanMarginImprovement`,
`trainingPairImprovedFraction` and
`trainingPairMeanMarginImprovementByDomain` for the specialist offices.
These metrics explicitly carry
`outcomeEvidenceScope: in-sample-training-pairs-only-not-held-out-quality`.
They can detect ineffective or harmful updates on the examples actually
trained, but **cannot** establish generalization, accuracy, collecting
expertise or safety. Keep the independent held-out suite as a hard release
gate. The DPO micro-segment gradient is also compared numerically against
full-graph autograd in the CPU PyTorch smoke test; that same test verifies
response-only supervised loss decreases on a synthetic trainable adapter
while base weights remain frozen.

Owners can override the epoch counts with `--epochs` and
`--preference-epochs` after reviewing validation loss and held-out
regressions. No model weights or GPU were available to run
the new passes in GitHub CI; preflight verification must not be confused with
a completed training run.

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

## Triple-ability gradient training — supervised, preference, retention

The default owner-approved curriculum is now **three supervised LoRA epochs**,
**three preference DPO epochs**, then **one anchored retention-rehearsal epoch**
when a separate authorized preference dataset is provided. The three stages
have different objectives and execute sequentially on the same owner-held
local model; **they are not three independent new datasets or three
independently pretrained foundation models**.

1. **Supervised LoRA:** response-only learning from fully rights-cleared
   prompts and target answers, with seven-domain interleaving and complete
   long-form target token coverage.
2. **Preference DPO:** chosen-vs-rejected optimization from a separately
   attested, leakage-isolated dataset, using exact bounded gradients.
3. **Anchored retention rehearsal:** additional real gradient updates from the
   **already approved supervised examples**, after DPO. The response-only
   cross-entropy loss includes a bounded L2 penalty toward the *post-SFT*
   adapter parameter snapshot, with a lower learning rate to help retain
   earlier supervised skills. It uses no unlicensed third corpus or outside
   teacher. Like any rehearsal, it can still cause regressions: held-out
   expert evaluations and retention/forgetting tests remain mandatory.

The third stage is implemented as `train_retention_stage` inside the existing
**owner-hash-pinned** `sovereign_preference_stage.py` optimizer module.
The signed `npm run train:powerhouse` launcher validates the pinned preference
module before and after execution, so this stage cannot be silently
substituted through the signed path. The supervised trainer requires actual
changed parameters and non-finite loss checks before publishing weights.
The third stage records real optimization steps, loss and adapter-update
evidence in `retentionStage` of the model archive metadata. That training
loss is **in-sample evidence only**, not proof of generalization.

**Added specialty regression gate:** Post-rehearsal response-only loss is
measured independently for every supervised office and compared with the
loss from immediately before stage three. The scorer now aggregates
cross-entropy by **actual supervised target-token count**, not by treating
a short final segment as equal to a full chapter. If any office's in-sample
token-weighted mean loss exceeds its own baseline by more than the
**5% conservative budget**, the trainer fails and publishes no final adapter.
Missing, non-finite, invalid or unattributed target-token evidence also
fails closed. Successful archives record the target-token counts, weighted
global training losses, per-office before/after loss values and guard status
under `retentionStage.domainLossRegressionGuard`. The same guard is
subjected to positive tests and a deliberately deceptive long-form regression
in the real PyTorch smoke workflow. This only reduces the risk of hiding supervised regressions;
it does **not** establish that the preference stage was preserved or
that held-out expert capability improved. Owner approval still requires
independent preference, catastrophic-forgetting and seven-domain evaluations.

Owner-approved bounded overrides include `--epochs`,
`--preference-epochs`, `--retention-epochs` (0–5;
0 **explicitly disables** rehearsal), `--retention-learning-rate`,
and `--retention-anchor-strength`.

**Optional double-intensity training profile:** A separately authorized
`--training-profile double` runs **six SFT epochs, six DPO epochs, and two
anchored retention epochs**. This doubles the optimizer passes in each
existing stage; it does **not** double the independent training examples,
create new training algorithms, or prove new model capabilities. It requires
the separate rights-attested DPO package and **at least 20 evaluation-only,
disjoint held-out references for every specialty**, rejecting conflicts with
per-stage epoch overrides. Its preflight reports `trainingProfile: "double"`
and the expanded epoch counts, without creating any trained weights. The
normal `standard` profile remains three, three, one. Only the owner-signed
training launcher should execute actual high-intensity training on authorized
hardware; doubling passes can *worsen* held-out capability through overfitting.
Compare complete unseen evidence and specialist benchmarks before any release.

Example guarded preflight (append these flags to the training command above
along with a separately authorized `--preference-package`):

```bash
--training-profile double --validate-only
``` By default rehearsal is active only
when a valid preference package is supplied. `--validate-only` reports
the exact three-stage plan without loading training weights or writing
a fabricated adapter. Real activation of the third stage requires actual
licensed weights, owner-approved datasets and enough authorized compute.

GitHub CPU PyTorch smoke tests execute genuine gradient updates on a tiny
randomly initialized local test model, including the third retention optimizer
and frozen-base assertions. They do not train the production foundation model.

**Scalable DPO inputs:** Preference responses are now tokenized one pair at a
time for both frozen-reference scoring and gradient updates. The trainer does
not eagerly retain token tensors for every preference pair in RAM. Each answer
is still limited to 16 bounded contextual segments and each example must carry
training-rights evidence. The optimizer's per-pair reference and gradients are
real PyTorch calculations, not simulated scores.

**Retention preference-drift evidence:** After stage-two DPO and before
stage-three rehearsal, K.I.N.G.S. measures a deterministic sample of at most
20 chosen/rejected pairs per specialist domain. It scores the same sample again
after stage three, recording per-domain response-token-normalized preference
margins, their changes and any domains whose in-sample margin fell, under
`retentionStage.preferenceDrift`. This makes potential DPO preference
regressions visible even when supervised rehearsal loss improves. It is
explicitly **training-pair evidence**, not an independent evaluation, proof of
accuracy or a guarantee that earlier abilities were retained. Stage-three
supervised domain-loss regression guards remain separate.

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

## Rights-checked held-out scoring for the three-stage trainer

A benchmark manifest may optionally supply **evaluation-only** reference
answers for each of the seven specialty domains. For every such entry use
`split: "held-out"`, a unique `id`, `sourceGroupId`, `prompt`,
`domain`, non-empty `targetResponse`, and a rights attestation containing
`evaluationAllowed: true`, `trainingAllowed: false`, `licenseId`,
`sourceReference`, `permissionReference`, `permissionEvidenceSha256`
(a 64-character lowercase hexadecimal SHA-256), and `attestedBy`.
The existing benchmark/source-group/prompt isolation checks remain mandatory.
If any reference answers are included, all seven domains must be represented;
an invalid or unauthorized reference fails before loading model weights.

The production trainer evaluates the **same held-out references** before the
first gradient update and after supervised LoRA, DPO, and retention. It scores
response-only **teacher-forced negative log-likelihood per target token**,
without using any held-out response in training, gradient computation, a
model judge, or prompts used for model training. To bound compute without silently discarding difficult later examples,
scoring now uses **all authorized held-out references**, up to **200 per
specialty**; more than 200 triggers an explicit validation error rather than
truncation. It records the exact scored sample and target-token counts and
refuses to compare runs with different counts. This still measures a proxy,
not independent generated-answer quality. It serializes
`heldOutReferenceEvaluation` into the signed adapter metadata: initial/final
losses, reductions by specialty, which domains improved, and whether each
specialty had 20 evaluated references. The complete benchmark file is hashed;
the metadata does not contain private reference answers.

**Offline candidate-review gate (November 10, 2026):** The trainer now records
\`heldOutProxyReviewGate\` in every generated adapter's metadata. Its status
is \`blocked\` unless the *same* isolated held-out references include at least
20 examples in each of all seven specialties, overall reference-token loss
improves, at least one specialty improves, and **no specialty's reference loss
increases more than 5%**. This specifically prevents a favorable aggregate
metric from hiding serious deterioration in coding, cards, books, or any other
specialty. Add \`--require-proxy-review-gate\` to the direct offline Python
trainer invocation when the owner wants fail-closed export: after all training
and scoring, a blocked gate raises an error **before writing the adapter ZIP**.
Without that flag the trainer still saves the adapter and the blocked evidence
for diagnosis; it must not be treated as release-qualified. This is a proxy
review gate, not an independent specialist evaluation or production-deployment
authorization; even status \`review-eligible\` never sets
\`independentExpertQualification\` or \`productionQualified\` to true.
Tests use synthetic data and random local weights; they do not measure the
quality of an actual production model.

**Interpretation:** lower unseen reference loss can be useful independent
evidence for one *surrogate metric*, but it cannot verify reliable generated
code, collectible grading, sports facts, books, narrative quality, refusal
quality, or autonomous task success. The evaluator sets
`independentExpertQualification: false` even if all seven losses improve.
A real product release still requires independently scored generation tasks,
specialty rubrics, executable coding benchmarks, safety and security tests,
licensed production model weights, owner-operated deployment, and physical
Android/Mac/Windows device acceptance. Benchmarks without reference answers
remain supported and produce `heldOutReferenceEvaluation: null`; that is
**unverified**, never a pass. Tests and CI use synthetic reference answers and
random local weights, not actual owner-licensed production training.
