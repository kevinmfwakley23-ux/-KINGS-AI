# Production / Cross-Platform Readiness

K.I.N.G.S. is configured for Node.js 22+ and Python 3.11+ on Windows, macOS, and Linux.

## Start

1. `npm ci`
2. Configure environment variables from `.env.example` in your shell/secret manager.
3. Run an owner-operated inference server serving a real model you are authorized to use: `KINGS_SELF_HOSTED_BASE_URL` plus `KINGS_SELF_HOSTED_MODEL` for a local OpenAI-compatible llama.cpp/vLLM server, or `KINGS_OLLAMA_BASE_URL` plus `KINGS_OLLAMA_MODEL` for local Ollama.
4. Keep `KINGS_INTELLIGENCE_MODE=sovereign` (default). This prevents external AI inference even if external gateway credentials exist. `hybrid` is an explicit alternative for deployments that permit outside models, **not** the independent K.I.N.G.S. model target.
5. `npm run verify`
6. `npm start`
7. Open `http://127.0.0.1:8787`.

The owner console intentionally defaults to loopback. A non-loopback bind
fails closed unless `KINGS_CODING_MACHINE_TOKEN` contains at least 24 characters.
**A configured owner token also enforces owner authentication on loopback**:
this prevents a public HTTPS reverse proxy forwarding requests to
`127.0.0.1:8787` from bypassing the owner boundary. A configured token shorter
than 24 characters fails startup on every interface. With no token configured,
local loopback development remains available; it must never be exposed through
an external reverse proxy, tunnel, or public ingress.

For phone/tablet access, run K.I.N.G.S. behind a trusted HTTPS reverse proxy
or tunnel and supply the owner token through your secret manager. You can keep
`KINGS_CODING_MACHINE_BIND=127.0.0.1` when the HTTPS proxy runs on the same
host, or use `KINGS_CODING_MACHINE_BIND=0.0.0.0` when your controlled network
requires it; both modes enforce authentication when the owner token is set.
Only the trusted HTTPS proxy should be exposed publicly, not the raw HTTP port.

New Android clients bootstrap once using an HTTPS form POST to
`/session/bootstrap` with the `access` form field. The reusable owner secret is
in the request body, not the URL, and the server accepts at most 4 KiB of form
data. The server checks the credential, returns a redirect to `/`, and issues
a `Secure`, `HttpOnly`, `SameSite=Strict` host cookie containing a
hash-derived session value rather than the reusable owner token. Invalid,
duplicate, or oversized credentials fail closed. The old root GET
`/?access=<token>` remains available temporarily for older clients; it is
not recommended because request URLs can enter access logs and browser history.
The owner API also accepts the original token as a Bearer credential for
non-browser clients. `/health` remains a minimal unauthenticated infrastructure
probe; owner UI and `/api/status` require authentication whenever the owner
token is configured, including when the server binds to loopback.

Do not expose the owner console through plain public HTTP. A firewall is useful
defense in depth but is not a substitute for K.I.N.G.S.' application-layer owner
authentication and HTTPS transport.

## Independent inference and honest capability evidence

Sovereign mode applies to both the owner mission executor and the app-facing Responses API. The default provider order is `kings-self-hosted,ollama-internal`; external models are not registered, and injected external adapters are rejected. No private local model configured means **no model inference**, not an undocumented cloud fallback. The first-party K.I.N.G.S. workforce controls tasks, context, memory, tools, code writes, evaluation, and recovery. Ollama is an owner-operated inference engine, not an outside agent; a downloaded third-party model weight still does **not** mean the model was trained by K.I.N.G.S. or matches frontier performance. Production independence of model **weights** requires a lawfully sourced, owner-controlled base and demonstrated internal fine-tuning or training, plus rights-cleared private benchmarks.

The existing HTTPS web research gateway can retrieve outside information only within the governed request and source rules; retrieving information does not authorize model-weight training, copyright infringement, or automatic permanent knowledge promotion. The owner can request research without delegating model inference to a remote AI agent.

The offline LoRA trainer and deployment boundary are documented in
[sovereign inference and training](docs/SOVEREIGN_INFERENCE_AND_TRAINING.md).
A fine-tuning script is not a trained or independently qualified model. The
runner requires a real licensed base model and rights-cleared private data.
The optional `KINGS_OLLAMA_CONTEXT_TOKENS` passes directly to the local
inference server and remains hardware/model-dependent.

## Autonomous coding recovery

Owner-created coding missions now perform a bounded validation-repair cycle.
When a governed proposal fails the repository's real build/test commands,
K.I.N.G.S. restores the original files, passes the captured failure through the
existing recovery authority, requests a complete corrected proposal, and runs
the repository validation again. Each repaired proposal remains subject to the
same task identity, path authorization, controlled-write, and test boundaries.
The worker stops after three total coding attempts and preserves rollback and
failure evidence instead of looping or marking unverified work complete.

Powerhouse model promotion is governed by
`PowerhouseQualificationAuthority`. A candidate remains unqualified until all
seven domains pass rights-cleared, held-out, training-disjoint evaluations with
at least 20 tasks, an 85% pass rate, zero critical failures, and evidence-backed
verified prerequisite capabilities. Production qualification is distinct from
top-tier proof. The latter additionally requires independent evidence for all
seven domains at or above the 90th percentile against at least five peer models.
The authority preserves every blocker and evidence reference; an internal pass
cannot silently become a competitive claim.

The qualification gate now has an executable evidence producer.
`PowerhouseBenchmarkRunner` validates rights attestations and their SHA-256
evidence, rejects normalized prompt duplication and source-group leakage across
training/validation/held-out splits, requires at least 20 held-out tasks per
domain, and counts omitted answers as failures. Deterministic tests and
evidence-attested rubric review produce task, domain, manifest, and run hashes.
The `evaluate:powerhouse` CLI writes the resulting qualification-ready artifact
atomically. No production corpus or passing model result is fabricated in the
repository; owner-approved rights-cleared data and real model responses remain
a deployment prerequisite.

Provider-connected benchmark execution is now available through
`evaluate:powerhouse:live`. It reuses the production `AppAiRouter`, locks one
configured provider and exact model for the entire run, applies every
server-owned domain policy, disables tool proposals, bounds retryable failures,
and records terminal failures as missing benchmark answers. Atomic owner-only
checkpoints resume only unfinished tasks and reject altered evidence; completed
failures cannot be selectively rerun. A process lock prevents concurrent runs
from corrupting the same checkpoint. Live execution fails closed unless the
existing owner token is configured and the target declares all seven-domain
capabilities. Actual private corpus execution and independent rubric review
remain required before production or top-tier promotion.

Subjective evaluation now has an owner-authorized review path.
`review:powerhouse` locks the execution checkpoint, binds each rubric review to
the exact model-output hash and immutable run identity, and authorizes it with
an HMAC derived from the existing owner token. Wrong tokens, altered outputs,
changed scores/evidence, duplicate reviews, model self-review, and attempts to
override deterministic tasks fail closed. Missing and below-threshold reviews
remain failures. Review produces owner-only signed-review and refreshed
evidence artifacts without another model request. Held-out prompts and review
answers remain prohibited from corrective training; improvements require new,
rights-cleared, split-disjoint examples and a new model/run identity.

Corrective training now has an executable owner-controlled boundary.
`train:powerhouse` validates at least 20 rights-cleared, evaluation-disjoint
examples in every domain, binds an immutable base model and trainer artifact,
and runs only the owner-approved absolute executable through the existing
no-shell, no-network `ExecutionSandbox`. It records `trained` only after a zero
exit and a nonempty model artifact, hashes the artifact bytes, derives a fresh
benchmark run identity, and HMAC-authorizes the immutable build record with the
owner token. The deterministic suite includes a real subprocess that creates
artifact bytes; failed and missing-artifact trainers cannot produce a trained
claim. Owner data, a production trainer/base model, compute, and fresh private
benchmark results remain external requirements.

## Powerhouse service-domain routing

The authenticated Responses API supports seven explicit service contracts:
general chat, software engineering, collectibles, sports/trading cards, book
editing, publishing, and storytelling. Each contract injects server-owned
behavioral and honesty requirements, selects a capability set, and clamps
temperature before provider selection. Unknown domains fail closed. The API
returns the applied domain policy as evidence and never treats policy selection
alone as proof that a model has achieved expert quality.

## AI connectors

`core/workforce/openai-compatible-gateway.ts` provides a provider-neutral
OpenAI-compatible adapter. OmniRoute and 9Router factories preserve the virtual
model id sent to each router, allowing their own provider selection, fallback,
quota, caching, and token-efficiency features to remain in control.

OmniRoute defaults to `auto/coding,auto/cheap`. 9Router defaults to `auto`.
Override model aliases with `KINGS_OMNIROUTE_MODELS` and
`KINGS_9ROUTER_MODELS`.

Ollama remains the local/offline provider. Its execution adapter now records
`prompt_eval_count` and `eval_count` and forwards the request output-token cap
as Ollama `num_predict`, so token budgeting is no longer reported as zero.

## Token efficiency

Existing context-budget and memory-context-budget authorities are unchanged.
The new gateway transport also:
- forwards `maxOutputTokens` to OpenAI-compatible `max_tokens`;
- records prompt/completion/total usage returned by the router;
- leaves router-side caching and fallback enabled by default;
- does not set OmniRoute's no-cache header unless explicitly requested.

## Cross-platform CI

`.github/workflows/cross-platform.yml` runs install, platform checks and the
deterministic test suite on Ubuntu, Windows and macOS. The deterministic suite
also starts real owner-console processes to verify that non-loopback mode fails
closed without a token, anonymous owner requests are rejected, browser bootstrap
creates only the secure digest session cookie, and Bearer access remains valid.

## External verification still required

A repository test can verify connector contracts but cannot prove your local or
cloud provider accounts are live. Run `npm run test:live` on a machine with
CrewAI/Ollama and any required external services configured. Use the owner
console `/api/status` page to verify local reachability of Ollama, OmniRoute
and 9Router.

## Android client

The Tauri Android workflow builds an installable debug APK with pinned tooling,
verifies it with `apksigner`, publishes SHA-256 checksums and install directions,
and retains the GitHub Actions artifact for 90 days. The APK is a secure native
owner client for the HTTPS runtime; it intentionally does not embed provider
keys, the owner token, or model-training infrastructure. See
`docs/ANDROID_INSTALL.md`.

Never commit API keys or owner access tokens. `.env` files are ignored.
