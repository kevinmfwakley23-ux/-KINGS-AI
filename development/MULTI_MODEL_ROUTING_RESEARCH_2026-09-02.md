# K.I.N.G.S. Multi-Model Routing Research — 2026-09-02

## Purpose

This research pass improves K.I.N.G.S. as a local-first, governed, multi-model engineering system. External projects are research evidence only. K.I.N.G.S. retains its own authority boundaries, state model, provider interfaces, memory system, evidence model, and execution contracts. No external router becomes a required control-plane dependency.

## Systems reviewed

1. **OmniRoute** — https://github.com/ourines/omniroute
   - Useful patterns: task-specific auto modes, multi-factor candidate scoring, quota/health/cost/latency awareness, last-known-good routing, bounded fallback chains, circuit breaking, command/tool-output compression.
   - K.I.N.G.S. adoption: adaptive routing modes, health/quota/cost/context scoring, deterministic fallback chain, runtime cooldown telemetry. K.I.N.G.S. does not copy OmniRoute's gateway identity.

2. **9Router** — https://github.com/decolua/9router
   - Useful patterns: maximize existing subscription quota, cost-aware tiering, automatic fallback, quota monitoring, tool-output token reduction.
   - K.I.N.G.S. adoption: subscription coverage signal, quota remaining signal, cheap/quota-first modes, governed fallback, token-aware context economy.

3. **LiteLLM** — https://github.com/BerriAI/litellm
   - Useful patterns: unified provider boundary, cost/latency/usage routing, local rule-based complexity routing with no extra model call.
   - K.I.N.G.S. adoption: zero-call deterministic task complexity classification feeding `auto` routing. Existing ProviderAdapterRegistry remains the provider boundary.

4. **RouteLLM** — https://github.com/lm-sys/RouteLLM
   - Useful patterns: route easy work to cheaper models and calibrate cost/quality thresholds rather than using the strongest model for every request.
   - K.I.N.G.S. adoption: task complexity tiers plus minimum capability thresholds and explainable routing evidence.

5. **OpenRouter** — https://openrouter.ai/
   - Useful patterns: provider selection by price, latency, throughput, reliability, feature support, fallback and health thresholds.
   - K.I.N.G.S. adoption: throughput/reliability/latency/cost metrics and hard capability/modality/structured-output gates.

6. **Portkey AI Gateway** — https://portkey.ai/
   - Useful patterns: retries, fallbacks, load balancing, circuit breakers, budgets, caching and observability as separate concerns.
   - K.I.N.G.S. adoption: routing is kept separate from provider execution and runtime health telemetry; retries/fallback are evidence-bearing execution behavior.

7. **Not Diamond** — https://www.notdiamond.ai/
   - Useful patterns: per-request quality/cost/latency tradeoffs and learning from evaluation data.
   - K.I.N.G.S. adoption: explicit routing modes and a future-compatible scoring surface for benchmark-derived capability strengths.

8. **LangGraph** — https://github.com/langchain-ai/langgraph
   - Useful patterns: durable execution, resumability, human-in-the-loop state, explicit graph/runtime boundaries.
   - K.I.N.G.S. decision: retain existing mission continuity/checkpoint authority and keep routing subordinate to durable mission state.

9. **Microsoft Agent Framework** — https://github.com/microsoft/agent-framework
   - Useful patterns: checkpointed workflows, resumable executor state, provider-independent workflow abstractions.
   - K.I.N.G.S. decision: runtime routing telemetry must remain replaceable and must not become mission truth.

10. **OpenAI Agents SDK** — https://github.com/openai/openai-agents-python
    - Useful patterns: traces around model calls, tools, handoffs and guardrails; lightweight primitives.
    - K.I.N.G.S. adoption direction: preserve routing candidates, attempts, failure codes and selected model as auditable execution evidence.

11. **Letta** — https://github.com/letta-ai/letta
    - Useful patterns: stateful model-agnostic agents, deliberate context management and long-term memory separation.
    - K.I.N.G.S. decision: token optimization acts only on an execution-context copy; durable Project Brain memory is never destructively compressed.

12. **Mem0** — https://github.com/mem0ai/mem0
    - Useful patterns: hybrid semantic/keyword/entity retrieval and memory ranking.
    - K.I.N.G.S. decision: authoritative/relevant memory is prioritized before optional long record bodies and evidence excerpts are trimmed.

13. **CrewAI** — https://github.com/crewAIInc/crewAI
    - Useful patterns: scoped agent roles, memory relevance/recency/importance, explicit task delegation.
    - K.I.N.G.S. decision: model choice remains capability- and task-scoped instead of global.

14. **OpenHands** — https://github.com/All-Hands-AI/OpenHands
    - Useful patterns: sandboxed engineering execution and verification around autonomous coding.
    - K.I.N.G.S. decision: model routing cannot bypass existing workspace/tool authorization or build/test gates.

15. **Aider** — https://github.com/Aider-AI/aider
    - Useful patterns: repository maps, selective context, automatic lint/test loops, broad model support.
    - K.I.N.G.S. decision: reduce prompt/context volume structurally instead of blindly sending the whole repository.

16. **Cline** — https://github.com/cline/cline
    - Useful patterns: provider flexibility, MCP tooling and project-scoped rules.
    - K.I.N.G.S. decision: provider diversity belongs behind governed provider adapters; tool authority stays separate.

17. **Roo Code** — https://github.com/RooCodeInc/Roo-Code
    - Useful patterns: specialized modes and different model choices for different work modes.
    - K.I.N.G.S. adoption: `coding`, `fast`, `cheap`, `smart`, `offline`, and `quota-first` routing modes.

18. **Goose** — https://github.com/block/goose
    - Useful patterns: local/remote provider choice, MCP extensibility, subagents and permission controls.
    - K.I.N.G.S. decision: local providers remain first-class and external providers are additional horsepower, not a required dependency.

19. **Open WebUI** — https://github.com/open-webui/open-webui
    - Useful patterns: local/remote model access through a PWA usable on Android and desktop.
    - K.I.N.G.S. decision: preserve a provider-neutral runtime suitable for Chromebook/Android-facing owner controls.

20. **PocketPal AI** — https://github.com/a-ghorbani/pocketpal-ai
    - Useful patterns: hardware-aware local-model selection and fully offline mobile inference.
    - K.I.N.G.S. decision: `offline` mode must hard-filter external providers instead of merely preferring local models.

21. **ChatterUI** — https://github.com/Vali-98/ChatterUI
    - Useful patterns: mobile on-device llama.cpp plus optional remote APIs.
    - K.I.N.G.S. decision: local and remote intelligence use one governed capability/routing contract while remaining operationally distinct.

22. **Msty Studio** — https://msty.ai/
    - Useful patterns: local engine discovery, hardware-fit model selection, service health visibility, context trimming controls.
    - K.I.N.G.S. decision: health/context fit are explicit routing inputs and runtime facts are not treated as durable mission truth.

## Implemented K.I.N.G.S. architecture

### Tree 04 — Execution / intelligence routing

- `core/workforce/model-routing.ts`
  - Legacy behavior preserved as the default.
  - Adaptive modes: `balanced`, `auto`, `smart`, `coding`, `cheap`, `fast`, `quota-first`, `offline`.
  - Hard gates: capability evidence, input/output modality, structured output, context window, cost ceiling, latency ceiling, reliability floor, quota floor, paid-provider prohibition, health/cooldown state.
  - Multi-factor score: capability, reliability, cost, latency, throughput, quota, context fit, subscription coverage, recent health.
  - Explainable candidate evidence and bounded fallback chain.
  - Optional bounded deterministic exploration; no random hidden route changes.

- `core/workforce/model-task-complexity.ts`
  - Local deterministic classification; no model call and no routing-token spend.
  - Uses only user-request/task signals, required capabilities and output budget.
  - `auto` resolves simple work toward cheap routing, normal work toward balanced routing, coding/debugging complexity toward coding routing, and high reasoning load toward smart routing.

- `core/workforce/model-routing-runtime.ts`
  - Runtime EWMA latency/reliability/throughput learning.
  - Quota observations.
  - Retryable-failure streaks and exponential model cooldown.
  - Last-known-good success timestamp.
  - Runtime telemetry overlays base metrics without becoming durable project truth.

- `core/workforce/resilient-model-execution.ts`
  - Executes only candidates selected by the governed router.
  - Retryable failure advances through the bounded fallback chain.
  - Non-retryable failures stop by default unless the caller explicitly authorizes continuation.
  - Every attempt retains provider/model/failure/latency evidence.

- `core/workforce/adaptive-model-execution.ts`
  - Integrates capability registry + runtime telemetry + ModelRouter + ProviderAdapterRegistry.
  - Does not bypass provider adapters, budget authority, tool authorization, workspace authority or human approval boundaries.

### Tree 03 — Context / token economy

- `core/workforce/context-token-budget.ts`
  - Deterministic token estimation for routing/context budgeting.
  - Preserves authoritative summaries first.
  - Trims optional record bodies and evidence excerpts before dropping selected knowledge.
  - Rebuilds evidence/source provenance and prevents orphan references.
  - Never mutates durable Project Brain records/evidence.

- `core/workforce/execution/context-optimizer.ts`
  - Existing record/evidence caps retained.
  - Adds an 8,000-estimated-token default knowledge budget for normal execution contexts.
  - Estimation is intentionally labeled as an estimate; provider tokenizers remain authoritative for actual billed usage.

## Deliberate non-adoptions

- No router framework is made a K.I.N.G.S. control-plane dependency.
- No random routing is enabled by default; reproducibility wins over hidden exploration.
- No lossy compression may rewrite critical/state-changing/evidence-bearing source truth.
- No fallback may bypass capability, modality, context, cost, paid-provider or health gates.
- No provider error may silently alter mission state.
- No claim of external projects' advertised savings is treated as K.I.N.G.S. measured savings; K.I.N.G.S. must measure its own token/cost/quality outcomes through verification evidence.

## Next evidence loop

1. Compile all focused workforce tests under strict TypeScript.
2. Run legacy routing tests to prove backward compatibility.
3. Run adaptive routing, runtime telemetry, multi-provider fallback and context-token tests.
4. Record real model usage/cost/latency/token observations from Ollama and any authorized external providers.
5. Calibrate routing weights from K.I.N.G.S.-specific evaluation results rather than external benchmark claims.
