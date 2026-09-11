# K.I.N.G.S. AI Research-Backed Improvement Queue

**Status:** Locked engineering queue

**Updated:** 2026-09-11

**Authority:** Repository architecture gospel and owner direction remain above external research.

## Purpose

This record converts the September 2026 research brief into bounded repository work. It does not authorize a parallel planner, memory system, verifier, tool gateway, or recovery runtime. Every experiment must extend the existing owner, preserve human authority, and produce falsifiable evidence before it can be retained.

## High-confidence findings

These items come from primary papers or official releases. Preprint results remain provisional until independently replicated.

| Published | Finding | K.I.N.G.S. consequence | Primary source |
|---|---|---|---|
| 2026-04-28 | Harness changes are more reliable when each change carries a prediction and is retained or reverted by evaluation. Reported gains came mainly from tools, middleware, and long-term memory. | Treat the complete runtime as the optimization unit. Keep verifiers, evaluation budgets, and protected policy files outside autonomous modification. | [Agentic Harness Engineering](https://arxiv.org/abs/2604.25850) |
| 2026-06-08 | The same model can have sharply different success and token efficiency under different agent scaffolds; reported token cost per solved task varied by as much as 40×. | Evaluate model-plus-harness configurations, including tool, middleware, memory, policy, retry, and recovery versions. | [The Scaffold Effect](https://arxiv.org/abs/2607.22585) |
| 2026-06-04 | Agent-memory designs move cost and latency between construction and retrieval rather than eliminating them. | Measure ingestion, consolidation, freshness, retrieval latency, evidence use, and outcome deltas. | [Agent Memory](https://arxiv.org/abs/2606.06448) |
| 2026-01-13 | Correct recall does not guarantee correct tool choice or argument grounding. | Score retrieval, constraint recognition, tool selection, and parameter grounding separately. | [Mem2ActBench](https://arxiv.org/abs/2601.19935) |
| 2026-07-23 | Tool governance improves when declared intent, observed behavior, capabilities, effects, context, and multi-tool composition are evaluated by deterministic rules. | Authorize proposed action chains and cumulative information flow, not only isolated calls. | [ToolGuardian](https://arxiv.org/abs/2607.21835) |
| 2026-05-31 | Bounded, failure-class-specific recovery with post-repair verification outperformed generic retry in a controlled fault-injection benchmark. | Map each observable failure class to permitted recovery, budget, escalation, and verification rules. | [Self-Healing Agentic Orchestrators](https://arxiv.org/abs/2606.01416) |

## Architectural inference

The following are K.I.N.G.S.-specific conclusions, not direct claims made by the cited sources:

- The highest-value move is to connect the existing memory, ledger, evidence, verification, tool, and recovery authorities into measurable closed loops.
- Retrieved memory and action-influencing memory are different states and must be recorded separately.
- Self-improvement should initially recommend or stage changes; it must not silently deploy changes to protected governance surfaces.
- Durable recovery checkpoints ultimately need tool side effects, verifier state, leases, and idempotency identity in addition to conversational context.

## Ranked implementation queue

| Rank | Section | Value | Cost | Risk | Repository state |
|---:|---|---|---|---|---|
| 1 | Memory-to-action evaluation harness | Very high | Moderate | Low | Implemented on `research/memory-to-action-evaluation`; awaiting independent Chromebook review and merge decision |
| 2 | Failure-class recovery with fault injection | Very high | Moderate | Moderate | Locked; do not start until section 1 is reviewed and closed |
| 3 | Tool-chain composition authorization | High | Moderate-high | Low in simulation | Locked; do not start until the preceding section is reviewed and closed |

## Section 1 — memory-to-action evaluation

### Change contract

**Targeted failure class:** memory is retrieved into execution context but is ignored or misapplied when the agent selects a tool or constructs arguments.

**Expected outcome:** a scenario cannot pass unless all four stages pass independently:

1. required memory is selected by `GovernedMemoryExecutionPipeline`;
2. memory-backed constraints are recognized;
3. the expected `ModelToolCallProposal` tool is selected and attributable to required memory;
4. nested tool arguments match their memory-backed expectations.

**Protected regressions:** mission/task identity, retrieval-to-context consistency, evidence provenance, duplicate-run protection, unsafe object paths, persistent-record integrity, and existing repository verification gates.

### Implemented integration

- `MemoryToActionEvaluationAuthority` consumes the existing governed memory execution result and the observed model tool-call proposal.
- Each constraint, tool choice, and argument expectation identifies the memory that should have caused it.
- Evaluation records report selected, demonstrably used, and retrieved-but-unused memory IDs.
- `MemoryToActionEvaluationHarness` aggregates scenario and per-stage scores.
- `MemoryToActionEvaluationJournal` writes a versioned atomic record, reloads it after restart, isolates callers from mutation, and rejects inconsistent or tampered aggregates.
- The harness restores native completion evidence from the durable journal idempotently after restart and rejects evidence-ID collisions.
- `createMemoryToActionCompletionEvidence` emits the existing `CompletionEvidence` contract into `EvidenceStore` with deterministic verification provenance.

### Retain or revert rule

Retain only if the focused integration proof and repository-wide `npm run verify` gate pass. Revert or repair if the new evaluator can pass on retrieval alone, accepts inconsistent execution context, loses results on restart, accepts tampered persisted results, or regresses an existing test.

### Verification checkpoint — 2026-09-11

- Focused proof: `node build/core/workforce/memory-to-action-evaluation-test.js` passed nine integration and negative checks.
- Repository gate: `npm run verify` passed all 218 default workforce tests, owner-console authentication and execution checks, official-brand validation, Android native packaging checks, and Python knowledge-retrieval tests.
- The repository intentionally excludes eight live external-integration tests from the default gate when their provider prerequisites are unavailable; this section introduces no external provider dependency.

## Section 2 — queued recovery experiment

Inject timeout, malformed arguments, stale state, contradictory evidence, unauthorized action, verifier rejection, partial write, exhausted context, and restart faults. Each class must have a bounded permitted repair, retry budget, escalation rule, idempotency protection where side effects are possible, and a post-recovery verifier. Generic retry is not an acceptable substitute.

## Section 3 — queued tool-composition experiment

Simulate full proposed tool sequences before execution. Begin with deterministic rules for secrets, network egress, repository writes, external messaging, privilege boundaries, and destructive filesystem actions. The evaluator must consider cumulative effects and information flow across calls while continuing to use the existing tool-governance owner.

## Required handoff sequence

After a section reaches a green checkpoint, stop. Provide its branch, pull request, changed boundaries, verification evidence, residual risks, and reviewer instructions. Begin the next section only after the Chromebook review is complete and the owner closes the current section.
