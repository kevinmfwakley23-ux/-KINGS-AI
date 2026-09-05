# K.I.N.G.S. Mega Brain Mission Progress

**Mission:** Build K.I.N.G.S. into the governed super-router / cross-app intelligence brain for K.I.N.G.S. products.

**Current work branch:** `integration/mega-brain-router-v1`

**Canonical product base:** `kings-coding-machine-v1`

**Status:** V1 implementation in production verification. Do not label complete until the exact final PR head passes the production gate and is merged.

## Consolidation completed before this mission

- The 300+ commit production-hardening program was verified and promoted into `kings-coding-machine-v1` through PR #5.
- CP-004 parallel worktree lifecycle integrity passed exact-head production verification and was merged before the hardening program was promoted.
- Superseded App Brain PR #10 was closed after replacement PR #14 merged, establishing the rule that completed/superseded PRs must leave the active work queue.
- The older `main` lineage is not used as the architecture source when doing so would discard the stronger production-hardening implementation. Newer cross-app ideas are selectively integrated into the canonical coding-machine line.

## Mega Brain V1 implemented on PR #15

### 1. Governed cross-app model router

`core/workforce/app-mega-router.ts`

The child-app router now uses the existing production `ModelRouter` and `ResilientModelExecutionAuthority` rather than a simpler provider-order loop.

It preserves:

- required capability matching and minimum capability strength;
- verified/unverified capability policy;
- context-window hard limits using conservative request-capacity estimation;
- text modality, structured-output, and provider-native tool-calling compatibility;
- owner/provider allow and deny policy;
- preferred provider/model controls;
- economy, free-only, local-only, and quality cost modes;
- maximum estimated cost, minimum reliability, and maximum latency policy;
- transparent ranked-candidate evidence;
- route/model circuit breakers;
- provider quota/rate-limit cooldown;
- bounded failover attempts;
- actual executor identity and provider-reported usage/cost evidence.

Tool calls remain proposals. The app router does not execute side-effecting tools or bypass K.I.N.G.S. tool authorization.

### 2. Durable adaptive routing brain

`core/workforce/app-mega-router-runtime.ts`

The runtime:

- loads the real configured gateway fleet;
- synchronizes gateway models into the existing provider and capability registries;
- restores durable routing metrics before seeding new routes;
- records provider-reported token, cache, savings, and cost observations;
- adapts route reliability/latency/cost from actual execution results;
- persists learned route metrics atomically;
- restores those learned metrics after restart instead of resetting to static defaults.

This reuses the same `DurableModelRoutingMetricsStore`, `DurableGatewayUsageLedger`, `AdaptiveModelRoutingAuthority`, gateway adapters, and routing authorities already used by the production coding machine.

### 3. Provider fleet

The runtime reuses existing production gateway configuration for:

- OmniRoute;
- 9Router;
- OpenRouter;
- local OpenAI-compatible/self-hosted engines;
- Groq;
- Cerebras;
- Mistral;
- Chutes;
- Together AI;
- Fireworks AI;
- additional configured OpenAI-compatible gateways through `KINGS_AI_GATEWAYS_JSON`.

A catalog entry is not silently promoted to verified capability merely because a provider reports that a model exists. Capability trust remains evidence-driven.

### 4. Cross-app memory and research brain

`core/workforce/app-brain-gateway.ts`

The App Brain boundary:

- requires valid app/task/mission identity;
- validates memory type, timestamps, authority state, and provenance references;
- rejects duplicate memory IDs;
- ranks memory using the existing `MemoryRelevance` and `MemoryContextAuthority`;
- exposes routing reasons instead of opaque memory selection;
- performs research only through the governed `ExternalResearchAdapter` and `WebAccessAdapter`;
- enforces bounded source counts;
- preserves source content without inventing synthesized findings at the retrieval boundary;
- translates policy failures into explicit rejected requests.

### 5. Authenticated cross-app HTTP service

`core/workforce/app-mega-router-http.ts`

Endpoints:

- `GET /health`
- `GET /v1/models`
- `POST /v1/route`
- `POST /responses`
- `POST /v1/responses`
- `POST /v1/brain/memory/select`
- `POST /v1/brain/research/retrieve`

Security/operational controls:

- loopback bind by default;
- bearer token required when binding beyond loopback;
- timing-safe bearer comparison;
- bounded JSON request bodies;
- no-store, nosniff, deny-frame, and no-referrer response headers;
- research GET-only;
- research HTTPS-only;
- zero redirects;
- bounded research response sizes/timeouts;
- private-network research blocked;
- optional public-host allow-list;
- JSON audit events for routing, memory, research, startup, and errors.

### 6. Supported launcher

`runtimes/app-router/server.ts`

Package commands:

```text
npm run build:app-router
npm run start:app-router
npm run start:mega-brain
```

`npm run check` now compiles the app-router launcher before executing the workforce suite, so the supported service entrypoint cannot silently rot outside CI.

### 7. Deterministic acceptance added

- `app-mega-router-test.ts`
  - economy-first local route preference;
  - resilient local-to-cloud failover;
  - quality-first selection;
  - context-window exclusion;
  - tool-capability exclusion;
  - provider-policy fail closed.

- `app-mega-router-runtime-test.ts`
  - actual gateway-adapter synchronization;
  - actual adapter request/response path;
  - provider-reported token/cost evidence;
  - adaptive route learning;
  - durable metric persistence;
  - durable usage ledger;
  - restart restoration of learned routing evidence.

- `app-brain-gateway-test.ts`
  - provenance-aware memory ranking;
  - missing-provenance rejection;
  - bounded governed research;
  - no fabricated findings at retrieval;
  - source-limit rejection;
  - private-network rejection.

- `app-mega-router-http-test.ts`
  - real Node HTTP socket;
  - off-loopback token requirement;
  - health endpoint;
  - protected endpoint authentication;
  - authenticated routing;
  - hardened response headers;
  - Responses compatibility after capability verification;
  - cross-app memory endpoint;
  - cross-app governed research endpoint.

## Verification truth

The implementation above is **not yet a completed milestone merely because the files exist**. The exact final PR #15 head must pass the production verification workflow after all current changes.

Live provider/model tests remain a separate proof class. Deterministic CI may use controlled transports to prove protocol and authority behavior, but that must never be described as proving that a real external account/key is currently reachable.

## Next engineering gates after Mega Brain V1 merges

1. Promote provider/model capability trust only from real benchmark/live-acceptance evidence; do not disable verification to make `auto` look available.
2. Add durable capability-verification records if the existing capability-learning store does not yet preserve model verification strongly enough across restart.
3. Run a no-external-AI mission proving local intelligence + governed memory + repository tools + verification as one complete mission.
4. Run a real child-app proving-ground request from Author's Forge through the K.I.N.G.S. Mega Brain service.
5. Run a real Collector's Kingdom proving-ground request only after K.I.N.G.S. and Forge priorities are satisfied.
6. Continue benchmarking routing quality/cost/reliability against current coding-agent expectations without replacing K.I.N.G.S. governance with an external framework.

## PR cleanup rule

When a PR is merged or a replacement has safely superseded it:

- remove it from the active work queue immediately by merging/closing it;
- record what replaced it;
- delete obsolete branches only when an explicit safe branch-delete action is available and the work is already preserved;
- never re-open completed work as a new mission without evidence of a regression or new requirement.

## Governing principle

**WE ARE NOT BUILDING A DEMO. WE ARE BUILDING THE MACHINE THAT BUILDS THE DREAMS.**
