# K.I.N.G.S. AI

**Knowledge • Investigation • Narrative • Generation • System**

K.I.N.G.S. is a governed AI workforce, coding machine, and cross-app intelligence router. It is designed to remain the authority over missions, tools, memory, verification, cost, provider selection, recovery, and durable project state while treating individual AI models as replaceable execution resources.

The engineering rule is simple: **real working code, explicit authority boundaries, executable verification, and no capability claims stronger than the evidence.**

## Current canonical product line

The production coding-machine lineage is `kings-coding-machine-v1`.

The current Mega Brain work is developed through PRs against that line. `main` must not be treated as more authoritative merely because it is the repository default when doing so would discard newer verified production-hardening work.

## What K.I.N.G.S. already contains

- governed mission/task/work-unit execution;
- durable mission interruption and resume;
- Project Brain, memory, knowledge, provenance, relevance, context budgeting, and promotion gates;
- local/self-hosted intelligence support including Ollama integration;
- OpenAI-compatible gateway infrastructure;
- OmniRoute and 9Router integration;
- OpenRouter, Groq, Cerebras, Mistral, Chutes, Together AI, and Fireworks configuration;
- custom OpenAI-compatible gateway registration;
- capability-aware and context-window-aware model routing;
- economy, free-only, local-only, and quality routing policy;
- adaptive reliability/latency/cost learning;
- route circuit breakers and provider quota cooldown;
- durable routing metrics and provider usage/cost ledger;
- governed provider-native tool-call proposals;
- controlled repository inspection and editing;
- sandbox/process isolation boundaries;
- parallel Git worktree isolation for coding agents;
- specialist coding workforce and model-driven coding execution;
- executable benchmark and production-verification infrastructure;
- owner coding-machine UI/runtime;
- cross-app Mega Brain routing, memory, and research service under active verification.

## Install and deterministic verification

K.I.N.G.S. uses Node.js 24.

```bash
npm ci
npm run check
```

`npm run check` builds the owner runtime, builds the cross-app router service, and runs the deterministic focused workforce test suite.

Live provider/model verification is intentionally separate:

```bash
npm run check:live
```

A deterministic transport test proves protocol/governance behavior; it does **not** prove that a real third-party account or key is currently reachable.

## Owner coding machine

```bash
npm run start:owner-ui
```

The owner runtime contains the broader governed coding-machine workflow, durable continuity, gateway-first routing, repository execution, and project-owner controls.

## K.I.N.G.S. Mega Brain service

Build:

```bash
npm run build:app-router
```

Start:

```bash
npm run start:mega-brain
```

Default local endpoint:

```text
http://127.0.0.1:8790
```

The service binds to loopback by default. If `KINGS_APP_ROUTER_BIND` is changed to a non-loopback interface, `KINGS_APP_ROUTER_TOKEN` is mandatory.

### Mega Brain endpoints

```text
GET  /health
GET  /v1/models
POST /v1/route
POST /responses
POST /v1/responses
POST /v1/brain/memory/select
POST /v1/brain/research/retrieve
```

`/health` is intentionally available without credentials for service health checks. The other Mega Brain endpoints are protected whenever an access token is configured.

### Routing behavior

The Mega Brain route boundary is built on the production `ModelRouter` and `ResilientModelExecutionAuthority`. It can enforce:

- capability requirements and minimum strength;
- verified-capability policy;
- context-window capacity;
- modality, structured-output, and tool-call compatibility;
- provider allow/deny rules;
- preferred provider/model;
- cost mode and cost ceiling;
- reliability and latency thresholds;
- local/internal preference;
- failover attempts;
- route/provider cooldown after failures or quota exhaustion.

Successful results preserve the actual provider/model identity, routing reason, candidate evidence, attempt history, and provider-reported token/cost data when available.

Unknown provider cost is not silently treated as free. A model appearing in a remote catalog is not silently treated as verified capability.

### Tool safety

The Mega Brain may return provider-native tool-call **proposals** when explicitly allowed. It does not automatically execute side-effecting tools. K.I.N.G.S. tool authorization remains the execution boundary.

## Cross-app brain

Author's Forge, Collector's Kingdom, and future K.I.N.G.S. products can use the same service for model routing, memory selection, and governed research instead of implementing separate AI brains.

Memory selection requires provenance-bearing candidates and uses existing K.I.N.G.S. relevance/context authorities.

Research is routed through K.I.N.G.S. WebAccess/ExternalResearch governance. The Mega Brain HTTP service configures research as HTTPS-only, GET-only, redirect-free, size/time bounded, and private-network blocked. An optional public-host allow-list can restrict it further.

## Provider configuration

Start from `.env.example`. Never commit real provider credentials.

Major configuration families include:

```text
KINGS_OMNIROUTE_*
KINGS_9ROUTER_*
KINGS_LOCAL_OPENAI_*
KINGS_OPENROUTER_*
KINGS_GROQ_*
KINGS_CEREBRAS_*
KINGS_MISTRAL_*
KINGS_CHUTES_*
KINGS_TOGETHER_*
KINGS_FIREWORKS_*
KINGS_AI_GATEWAYS_JSON
```

Routing lessons and usage evidence default to:

```text
.kings/routing-metrics.json
.kings/gateway-usage.jsonl
```

These are local runtime state and are ignored by Git.

## Evidence and mission progress

Current Mega Brain implementation and verification truth are recorded in:

```text
development/MEGA_BRAIN_MISSION_PROGRESS.md
```

The longer architectural reference is:

```text
KINGS-V1-MASTER-CURRENT-REFERENCE.md
```

Repository rule: before starting a new subsystem, audit existing code and open PRs first. When a PR is merged or safely superseded, remove it from the active queue immediately so completed work is not rebuilt.

## Governing principle

> **WE ARE NOT BUILDING A DEMO. WE ARE BUILDING THE MACHINE THAT BUILDS THE DREAMS.**
