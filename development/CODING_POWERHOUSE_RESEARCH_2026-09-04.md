# K.I.N.G.S. AI Coding Powerhouse Research — 2026-09-04

## Mission

Turn K.I.N.G.S. into a real, production-grade autonomous coding system capable of safely understanding, modifying, verifying, repairing, and publishing real software across repositories and toolchains.

This document is an engineering research ledger, not a completion claim. A capability is only complete when executable tests and/or live acceptance evidence prove it.

## Current verified direction

The active production-hardening branch already contains substantial foundations that should be extended rather than duplicated:

- governed model routing and resilient fallback;
- adaptive routing metrics from real execution results;
- OmniRoute, 9Router, and generic OpenAI-compatible gateway support;
- provider/model capability registry;
- real model-driven coding execution;
- governed model tool loop and authorized tool schemas;
- MCP client/provider boundaries;
- repository inspection and task-ranked coding context;
- GitHub managed repository workspaces and verified publication boundaries;
- build/test verification and repair loops;
- execution sandbox isolation;
- secret redaction and sensitive-file exclusion;
- durable mission continuity and learning state;
- production preflight and CI/live-gateway acceptance workflows.

These are architectural assets. New work must integrate with their existing authorities instead of creating parallel owners.

## Competitive patterns worth adopting

### 1. Symbol- and dependency-aware repository understanding

Aider-style repository maps, modern semantic code search, and IDE language-service navigation all improve repository-scale coding by surfacing definitions, references, signatures, and architectural relationships instead of relying only on file-name and keyword matching.

K.I.N.G.S. currently has safe repository inventory plus path/content ranking. The next context engine should add a local deterministic symbol graph and dependency/reference relationships, with optional semantic enrichment behind a provider-neutral interface. The local graph must remain useful when no paid embedding/search service is available.

### 2. Parallel specialists in isolated workspaces

Current leading coding agents increasingly use parallel subagents with isolated contexts and Git worktrees/remote workspaces. The useful pattern is not simply “more agents”; it is bounded specialization with independent context, explicit dependencies, isolated filesystem state, and controlled merge/review.

K.I.N.G.S. should add worktree-backed execution lanes for safe parallel tasks. Planner/explorer/implementer/tester/reviewer/security roles should be composed through existing K.I.N.G.S. workforce contracts rather than becoming independent authorities.

### 3. Task-aware model selection

Model choice should depend on the actual task: cheap/fast models for simple work, coding-specialized models for implementation, high-reasoning models for architecture/root-cause work, and large-context models only when the assembled request requires them.

The older adaptive-routing research branch already contains useful task-complexity and weighted-routing concepts, but it predates newer production-hardening safeguards. Those ideas should be selectively merged into the current router rather than replacing it wholesale.

### 4. Context capacity as a hard execution constraint

A coding system must account for prompt/context growth before model execution. Repository context, provider-visible tool schemas, requested completion space, and iterative repair history all consume the model window.

Implemented in this research pass:

- `ModelRoutingRequest.requiredContextTokens` is now a hard routing constraint.
- Route candidates preserve context-window evidence.
- `model-context-capacity.ts` estimates message/tool/output/safety envelope.
- Model-driven coding re-routes every repair iteration because verification feedback makes later prompts larger.
- New tests prove small-context selection, large-context escalation, fail-closed behavior, tool-schema accounting, and output/safety reserves.

Remaining metadata requirement: gateway-reported context limits must be evidence-based. Unknown or inconsistent model metadata must not be silently promoted to a fictional capacity.

### 5. Provider health, quota, cost, and route evidence

9Router/OmniRoute/LiteLLM-style routing demonstrates the value of health, cooldown, quota, cost, and fallback data. K.I.N.G.S. already has resilient routing, adaptive metrics, gateway health, and usage accounting; future routing improvements should merge live quota/cooldown telemetry into one explainable decision score without bypassing existing budget enforcement.

### 6. Automatic verification is part of generation

Strong coding agents do not treat tests as a final optional step. They run lint/build/test/acceptance loops, feed real failures back to the model, and only promote verified work.

K.I.N.G.S. already follows this direction. It should be expanded with project-specific verification planners, changed-surface test selection, security/static-analysis adapters, and evidence artifacts. Verification must never be weakened merely to make a build green.

### 7. Checkpoints, proof artifacts, and reversible autonomy

Checkpoint/restore and isolated branches reduce the cost of autonomous mistakes. For long-running missions, K.I.N.G.S. should persist the base commit, worktree/branch identity, patch, commands executed, test evidence, model route evidence, and promotion decision. This gives the owner a reproducible audit trail and makes recovery deterministic.

### 8. Warm execution environments

Cloud coding systems increasingly cache or prebuild working environments to reduce repeated dependency/setup cost. K.I.N.G.S. should add governed build-environment fingerprints and reusable caches only after correctness/isolation is proven. Cache hits must never skip verification.

### 9. Agent interoperability without surrendering authority

MCP is useful for tools/context; ACP and A2A-style protocols are useful references for driving or delegating to external agents. Any adapter must remain subordinate to K.I.N.G.S. mission, tool, path, budget, verification, and publication authorities.

### 10. Evaluation must gate new intelligence

A coding powerhouse needs repeatable measurement, not anecdotal demos. K.I.N.G.S. should maintain a benchmark matrix covering:

- repository repair and feature implementation;
- multilingual software tasks, not Python only;
- build/test success and regression rate;
- tool-use and sandbox safety;
- token/cost efficiency;
- long-context correctness;
- recovery after failed iterations;
- generated-code security;
- multi-agent merge/conflict behavior;
- real Chromebook/ARM64 and mobile-facing runtime acceptance where applicable.

Useful benchmark families include SWE-bench/SWE-rebench style repository tasks, multilingual subsets, efficiency/cost measurements, terminal/tool-use tasks, and agent-safety evaluations. External benchmark licenses and harness constraints must be respected.

## Prioritized build sequence

### CP-001 — Context-capacity routing integrity — IMPLEMENTED IN THIS PASS

Acceptance evidence:

- context-window-aware model routing test;
- context-envelope estimator test;
- every coding/repair iteration re-routes against its current envelope;
- fail closed when no eligible model can fit.

### CP-002 — Gateway model-metadata integrity — NEXT

Build:

- parse context/output/capability metadata when a gateway supplies it;
- preserve metadata provenance;
- allow owner/configured verified overrides;
- never infer canonical upstream identity from a route alias;
- conservative handling when limits are unknown or contradictory;
- live acceptance against configured OmniRoute/9Router gateways.

### CP-003 — Repository symbol graph

Build:

- language-aware symbol extraction;
- definitions, imports, exports, references, inheritance/call/dependency edges where practical;
- incremental cache keyed by content hash/commit;
- objective-aware graph ranking;
- strict token budget integration;
- no secret-path leakage.

Start with TypeScript/JavaScript and Python, then expand through the engineering toolchain matrix.

### CP-004 — Task-complexity/adaptive route policy

Build:

- classify execution task complexity using deterministic signals plus observed outcomes;
- modes for cheap, fast, coding, reasoning, offline/local, and quota-first operation;
- preserve existing verification/cost/provider restrictions as hard constraints;
- use evaluation data to tune weights rather than hard-code marketing assumptions.

### CP-005 — Worktree-isolated parallel workforce

Build:

- one governed worktree/branch per parallel work unit;
- dependency-aware scheduling;
- explicit file/surface ownership when possible;
- merge-conflict detection and review gate;
- cleanup/recovery authority;
- prevent direct main/master publication.

### CP-006 — Specialist coding subagents

Build bounded roles through existing workforce contracts:

- repository explorer;
- architecture/planning specialist;
- implementation specialist;
- test/verification specialist;
- reviewer/debugger;
- security reviewer.

Each role gets only the tools, paths, budget, and context required for its work unit.

### CP-007 — Checkpoint and proof bundle

Persist a mission/work-unit proof bundle containing base SHA, branch/worktree, changed files, patch/diff hash, tool/command evidence, build/test evidence, route/model evidence, verification result, and promotion status.

### CP-008 — Coding benchmark and regression lab

Create a local/CI benchmark harness with stable internal fixtures plus optional external benchmark adapters. Every routing, tool, memory, agent, and context-engine change must prove that it improves or at least preserves quality/safety before promotion.

### CP-009 — Warm environment/cache authority

Fingerprint dependency/toolchain environments and reuse safe caches while retaining full project-aware verification.

### CP-010 — External-agent protocol adapters

Add ACP/A2A-style adapters only after isolation, verification, and proof bundles are mature. External agents remain workers beneath K.I.N.G.S. governance.

## Release-management finding

The repository's `main` branch is stale relative to the active production-hardening line and has diverged. Final production completion requires a deliberate promotion/reconciliation path so the real tested build becomes the canonical release branch. Do not treat stale `main` as the source of truth while active hardening continues elsewhere.

## Non-negotiable engineering rules

1. No fake implementations, success stubs, or tests that only prove mocks.
2. No duplicate architectural authority when an existing K.I.N.G.S. authority can be extended.
3. No silent downgrade of verification, security, budget, path, or publication controls.
4. Unknown provider/model facts stay unknown until observed, configured, or independently verified.
5. Every major new coding capability needs deterministic tests and, where applicable, live acceptance evidence.
6. K.I.N.G.S. remains the control plane. External models, gateways, MCP servers, agents, and frameworks are replaceable workers/adapters.
