# K.I.N.G.S. V1 MASTER CURRENT REFERENCE

**Status:** Canonical current build reference
**Updated:** 2026-08-13
**Base repository:** `main`

## Purpose

This document preserves the approved K.I.N.G.S. architecture and records verified implementation added after the original master build package. It exists specifically to prevent architectural drift, duplicate subsystem creation, and loss of corrections made during later development.

## Governing rule

> **Requirement → existing-code audit → correct integration point → build → integrate → unit test → integration test → end-to-end test → real-world proof → complete.**

A file existing, a successful TypeScript compile, or a printed `SUCCESS` line does not by itself make a requirement complete.

## Architectural hierarchy

1. Human direction and approval
2. Approved K.I.N.G.S. architecture
3. Eight-tree V1 build structure
4. Current repository and tested history
5. External research as architectural evidence
6. Implementation details

Preserve working historical components. Extend only real gaps. Rebuild only when an implementation conflicts with the approved architecture.

## V1 mission

K.I.N.G.S. is a controlled AI workforce operating system. It owns authority, task contracts, capabilities, workforce formation, context, knowledge, model/provider policy, tools, workflows, evidence, verification, completion, recovery, durable state, observability, and cost/quality history.

Models are replaceable reasoning/generation resources. Deterministic systems provide measurement and validation. Human authority remains above the system.

## Eight-tree navigation system

### Tree 01 — Authority
Mission authority, task contracts, capability authority, tool authority, resource/path authority, budget authority, human approval, completion authority.

### Tree 02 — Workforce
Worker definitions, capability matching, workforce formation, work-unit assignment, worker operating loop, worker budgets/limits, failure/escalation, independent reviewer.

### Tree 03 — Context
Context builder, capability loading, knowledge selection, task-state selection, tool-output classification, safe compression, context checkpointing, context budget.

### Tree 04 — Execution
Model interface, provider adapters, model capability registry, cost/quality routing, budget/quota enforcement, tool gateway, controlled web/external knowledge access, governed coding terminal/sandbox.

### Tree 05 — Knowledge
Knowledge registry, knowledge retrieval, Project Brain, mission continuity, memory, source inspection, external research, knowledge promotion.

### Tree 06 — Builder
Repository inspection, build planning, work breakdown, controlled editing, build/test execution, failure diagnosis, artifact management, artifact promotion.

### Tree 07 — Evidence
Observations, measurements, artifacts, provenance, verification, independent review, completion gates, evidence history.

### Tree 08 — Runtime
Mission runtime, workflow runtime, worker runtime, persistent state, resume/recovery, observability, cost telemetry, operational health.

## Locked economic and intelligence principles

### Internal intelligence
Internal/local intelligence is a first-class provider category. External AI is additional horsepower, not life support.

K.I.N.G.S. must be able to continue meaningful work when paid external AI is unavailable, subject to local hardware and network reality.

### Owner access
The owner must be able to operate K.I.N.G.S. directly without paying external AI tokens merely to access K.I.N.G.S. itself. External providers are optional governed workforce resources with attributable cost.

### Self-development
K.I.N.G.S. remains the head AI for its own construction and for legacy applications. It plans, controls, verifies, recovers, preserves state, and accepts work. Workers, external models, and local intelligence are bounded execution resources behind the same governance boundary.

## Verified post-package implementation carried forward

The following work was completed and pushed to `main` after the earlier master package and must remain part of the canonical build history.

### Tree 08 — Programming/toolchain intelligence

**Dynamic toolchain registration — commit `61e6b11`**
- Verified toolchain registration through the existing engineering toolchain registry.
- Verified rejection of unverified toolchains.

**Extensible engineering language identity — commit `3788816`**
- Added a dedicated engineering language registry.
- Supports language aliases and extension detection.
- Supports dynamic registration without redesigning the core.
- Includes deterministic listing and duplicate protection.

These additions directly address the locked requirement for extensible programming-language/toolchain intelligence without replacing the existing toolchain architecture.

### Tree 04 — Internal intelligence

**Governed internal intelligence adapter — commit `1c8f289`**
- Internal-local and internal-self-hosted models are accepted by an existing provider adapter boundary.
- Model registration is governed and capability-aware.
- Unavailable, missing, and capability-mismatched models are blocked deterministically.

**Internal intelligence routing — commit `1c8f289`**
- Existing ProviderAdapterRegistry, ModelCapabilityRegistry, and ModelRouter now have a proven internal-local routing path.
- Internal preference is honored through existing routing policy.

**Internal model → worker execution bridge — commit `6a1283a`**
- A governed execution port bridges model execution results into the existing workforce execution port contract.
- Execution remains attributable to internal intelligence.
- Zero external-provider cost is demonstrated in the local test path.

**Provider-neutral local process transport — commit `dfff9e9`**
- Local intelligence can execute through a bounded local process transport.
- Timeout, process failure, malformed response, and capability mismatch are governed.
- The architecture does not hard-code one local inference engine into the core.

**Ollama provider discovery — commit `1fbd021`**
- Running Ollama is discoverable through the governed internal provider architecture.
- Model identities are produced as internal-local model identities.
- Provider unavailability degrades without creating phantom models.

**Ollama execution transport — current local work after `1fbd021`**
- Governed `/api/generate` request/response adaptation is implemented locally and tested.
- Transport error and malformed response protection are tested.
- This work is not yet committed until the real model integration checkpoint passes.

**Real local model availability — local runtime proof**
- Ollama `0.32.6` is installed and running on the Chromebook.
- `qwen2.5-coder:0.5b` was pulled successfully.
- Model size is approximately 397 MB.
- Real local inference returned `KINGS_LOCAL_INFERENCE_GREEN`.
- The model reports a 494.03M parameter Q4_K_M configuration with completion/tool/insert capabilities.
- The Chromebook has approximately 2.7 GiB RAM, no swap, and roughly 3.4–3.7 GiB free disk during this work. Treat this as a constrained local runtime.

## Important status interpretation

The real local model proves **resource availability and genuine local inference**, but it does **not** yet prove professional software-engineering capability, autonomous mission completion, or full V1 readiness.

The following are still incomplete unless independently demonstrated through integration and acceptance tests:

- real coding quality and repository repair with internal intelligence
- complete multi-language/toolchain intelligence
- full worker loop driven by an actual model through the complete governance stack
- memory → mission → execution integration
- durable learned-knowledge retention and reuse
- no-external-AI acceptance mission
- synthetic workforce acceptance mission
- KINGS Collectibles proving-ground mission
- Collector's Kingdom proving-ground mission
- AuthorsForge proving-ground mission
- final UI
- generalized multi-device/runtime behavior
- complete cost-aware provider strategy
- end-to-end durable mission lifecycle

## Drift-prevention rules

1. Do not create another subsystem when an existing owner can be extended.
2. Do not treat isolated green tests as complete system capability.
3. Search the repository directly before asking for manual archaeology.
4. Use external repositories only as research evidence; extract patterns, do not copy framework identity or make external projects dependencies.
5. Keep one requirement active at a time: identify the gap, attach it to the correct existing tree, implement, integrate, test, prove, checkpoint.
6. Terminal instructions must be complete copy/paste blocks. The operator should never be required to manually edit individual lines.
7. Keep the master reference updated whenever verified implementation changes the current architectural state.
8. Commit green checkpoints to `main` before starting the next meaningful integration layer.

## Current next-build direction

The immediate Tree 04 objective is to replace synthetic internal intelligence test models with the real locally installed Ollama-backed model through the existing provider → capability registry → router → worker execution path, then demonstrate bounded real coding work with verification.

After that, the next highest-value gaps must be selected from the master audit against the current repository, not invented sequentially.

## Final V1 proof

K.I.N.G.S. V1 is complete only when it can truthfully demonstrate that it can understand a real software project, plan it, select/acquire required capabilities, write and modify code across required languages, operate the appropriate environment, use local or external intelligence intelligently, control cost, test/debug/verify work, preserve project knowledge, remember missions across interruptions, recover unfinished work, produce usable artifacts, and continue until mission completion without critical dependence on ChatGPT or a single paid provider.

## Governing principle

> **WE ARE NOT BUILDING A DEMO. WE ARE BUILDING THE MACHINE THAT BUILDS THE DREAMS.**
