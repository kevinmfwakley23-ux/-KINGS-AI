# K.I.N.G.S. Token Economy + Affordable Intelligence Research — 2026-09-04

## Owner requirement

K.I.N.G.S. must remain useful to people who cannot afford premium per-token AI.

Cost is a first-class engineering constraint, not an afterthought. A user may deliberately choose a cheaper, free, or weaker model when that is what they can afford. K.I.N.G.S. may explain the quality tradeoff, but it must not silently force a premium model merely because one scores higher.

Verification remains mandatory. Affordable intelligence is made safer by real build/test/review evidence rather than by preventing the owner from choosing it.

## Non-negotiable economics rules

1. Prefer capability per dollar over prestige/model brand.
2. Zero-marginal-cost local inference is a first-class route, not an emergency fallback.
3. Documented free cloud routes are first-class when local capacity is insufficient or a stronger free route is available.
4. Never assume an entire provider is free just because it offers a free plan. Free quotas, account plans, model eligibility, and rate limits change.
5. Preserve route-level cost provenance: documented-free, provider-reported, configured estimate, or unknown.
6. Unknown price is not zero price.
7. Owners may explicitly select a weaker/cheap model below automatic quality thresholds when it still advertises the required capability and fits hard execution constraints.
8. Premium paid intelligence is an escalation choice, not the default economic assumption.
9. Build/test/security verification may not be weakened to make a weak model appear successful.
10. K.I.N.G.S. should show users what local/free inference and caching saved, not only what they spent.

## Implemented in this pass

### TE-001 — Real local token accounting

The Ollama execution adapter now preserves Ollama `prompt_eval_count` and `eval_count` as K.I.N.G.S. input/output token usage and reports zero per-token API cost. This makes local-token savings measurable instead of incorrectly recording local work as zero tokens.

### TE-002 — Owner-controlled cost policies

`ModelRoutingRequest.costPreference` now supports:

- `economy`: zero-marginal-cost routes first, then the cheapest known metered route;
- `free-only`: hard reject metered routes;
- `local-only`: hard reject cloud routes;
- `quality`: capability/reliability may outrank price when the owner intentionally chooses quality-first behavior.

Economy is the default at the router boundary.

### TE-003 — Explicit affordable-model override

An explicit owner-selected model may sit below an automatic capability-strength threshold. This does not waive required capability names, modality compatibility, context capacity, tool compatibility, provider policy, sandboxing, or post-execution verification.

### TE-004 — Direct provider supply expansion

First-class direct OpenAI-compatible connection presets now exist for:

- OpenRouter;
- Groq;
- Cerebras;
- Mistral;
- Chutes;
- Together AI;
- Fireworks AI.

These supplement, rather than replace, OmniRoute, 9Router, generic `KINGS_AI_GATEWAYS_JSON`, and local Ollama.

OpenRouter's documented `openrouter/free` route and `:free` variants are seeded as `verified-free` cost evidence. Arbitrary routes on providers that merely offer a free account tier remain `unknown` until K.I.N.G.S. has route/account-specific evidence.

## Current free/affordable supply research

Provider offerings change frequently. Treat the notes below as discovery inputs that must be refreshed by live metadata/account telemetry before making billing promises.

### Local — zero marginal API-token cost

K.I.N.G.S. should support multiple replaceable local inference engines:

- Ollama — already integrated;
- llama.cpp server — lightweight OpenAI-compatible local inference and useful on constrained hardware;
- LM Studio local server — OpenAI-compatible local model server, useful for desktop owner workflows;
- vLLM — high-throughput OpenAI-compatible self-hosted inference for stronger GPU hosts/servers.

Future option: multi-device/community local compute should be evaluated only behind the same K.I.N.G.S. trust and isolation boundaries.

### Free cloud pools

Strong current candidates include:

- OpenRouter Free Models Router / `:free` variants;
- Groq Free Plan limits across selected open models;
- Cerebras Free tier with published request/token limits;
- Mistral Free mode with included monthly usage;
- Cloudflare Workers AI daily free Neuron allocation;
- Gemini Free Tier where account/data-policy requirements are acceptable to the user.

A provider having a free tier does not prove every model/request is free. K.I.N.G.S. should inspect plan/route metadata and usage telemetry whenever the provider exposes it.

### Very low-cost cloud pools

Additional useful supply includes:

- Chutes;
- DeepInfra;
- Together AI;
- Fireworks AI;
- other OpenAI-compatible providers discovered through the generic gateway fabric.

DeepInfra uses an OpenAI-compatible base path ending in `/v1/openai`, which needs a small K.I.N.G.S. base-URL normalization extension before it should be promoted to a first-class preset.

### Do not add stale supply

GitHub Models was retired in July 2026 and should not be added as a new K.I.N.G.S. provider path.

## Token-reduction engineering priorities

### TE-005 — Stable-prefix prompt caching

Coding-agent loops repeatedly send system policy, tool schemas, repository instructions, and acceptance criteria. K.I.N.G.S. should deliberately keep reusable content in a stable prefix and append volatile diagnostics/history afterward so provider prompt caches can hit.

Track provider-reported `cachedTokens` and `savedTokens` and use sticky provider/session routing only when doing so does not violate cost, health, or user policy.

### TE-006 — Repository symbol map + delta context

Do not pay to resend full files repeatedly. Build deterministic symbol/dependency maps, select only relevant definitions/references, and send changed deltas plus required neighboring code. Preserve full-source verification outside the model context.

### TE-007 — Cheap-first verification cascade

For suitable work:

1. try local/free/cheapest capable model;
2. execute real verification;
3. feed bounded diagnostics back to the same cheap route when reasonable;
4. escalate to a stronger model only when policy allows and the lower-cost route cannot complete the verified task.

The user must be able to disable paid escalation entirely.

### TE-008 — Local context compressor

Use a small local model or deterministic compressor to summarize older diagnostics, repository history, and repetitive evidence before any metered call. Never summarize away authoritative acceptance criteria, security policy, active code dependencies, or failure evidence required for correctness.

### TE-009 — Hard budget controls

Add owner-visible mission policies such as:

- never use paid AI;
- local only;
- free cloud + local only;
- maximum dollars per mission/day/month;
- maximum paid tokens;
- ask before paid escalation;
- quality-first when explicitly selected.

Budget enforcement must happen before a paid request, not merely report spending afterward.

### TE-010 — Savings dashboard

Report separately:

- local input/output tokens processed;
- free-cloud tokens processed;
- fresh paid input/output tokens;
- cached input tokens;
- tokens saved by compression;
- provider-reported cost;
- estimated avoided cost versus a configurable comparison route;
- number of tasks completed without paid AI;
- paid escalations and their reason.

Do not invent avoided-cost numbers without an explicit comparison price source.

## Provider configuration added in this pass

Set only the providers the owner wants to use. Secrets remain environment-side and must never be committed.

- `KINGS_OPENROUTER_KEY`, optional `KINGS_OPENROUTER_URL`, `KINGS_OPENROUTER_MODELS`
- `KINGS_GROQ_KEY`, optional `KINGS_GROQ_URL`, `KINGS_GROQ_MODELS`
- `KINGS_CEREBRAS_KEY`, optional `KINGS_CEREBRAS_URL`, `KINGS_CEREBRAS_MODELS`
- `KINGS_MISTRAL_KEY`, optional `KINGS_MISTRAL_URL`, `KINGS_MISTRAL_MODELS`
- `KINGS_CHUTES_KEY`, optional `KINGS_CHUTES_URL`, `KINGS_CHUTES_MODELS`
- `KINGS_TOGETHER_KEY`, optional `KINGS_TOGETHER_URL`, `KINGS_TOGETHER_MODELS`
- `KINGS_FIREWORKS_KEY`, optional `KINGS_FIREWORKS_URL`, `KINGS_FIREWORKS_MODELS`

Existing sources remain:

- OmniRoute via `KINGS_OMNIROUTE_*`;
- 9Router via `KINGS_9ROUTER_*`;
- arbitrary compatible gateways via `KINGS_AI_GATEWAYS_JSON`;
- local Ollama via the owner runtime's local-model configuration.

## Next implementation order

1. Finish CI verification of TE-001 through TE-004.
2. Expose `economy`, `free-only`, `local-only`, and `quality` clearly in the Project Owner UI/API rather than relying only on the router default/manual exact-model picker.
3. Add provider quota/rate-limit telemetry and route-level economics provenance so K.I.N.G.S. knows when a free allocation is exhausted before choosing it again.
4. Implement stable-prefix/cache-aware agent requests and savings telemetry.
5. Implement symbol-map + delta-context repository selection.
6. Implement cheap-first verified escalation with `never-paid` and `ask-before-paid` owner policies.
7. Add DeepInfra first-class support after custom compatible base-path normalization is proven.
8. Add local llama.cpp/LM Studio adapters, followed by vLLM for stronger hosts.
9. Build the savings dashboard and hard spend-cap authority.

## Release rule

No provider is considered production-ready merely because its endpoint is configured. It must pass live health/model discovery plus an actual K.I.N.G.S. coding/verification acceptance before it is promoted as a trusted automatic route.
