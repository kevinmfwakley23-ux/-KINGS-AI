# K.I.N.G.S. AI

**KNOWLEDGE • INVESTIGATION • NARRATIVE • GENERATION • SYSTEM**

K.I.N.G.S. AI is a governed AI workforce, software-engineering system, and reusable intelligence architecture designed to build, operate, improve, and verify real applications.

> **Canonical status:** This README contains the highest-level architectural invariants for K.I.N.G.S. AI and the K.I.N.G.S. application family. These rules are intentionally explicit so future engineering sessions do not re-decide settled architecture or drift back toward obsolete implementation assumptions.

---

# ARCHITECTURE GOSPEL — LOCKED

The rules in this section are **non-negotiable architectural invariants** unless the owner explicitly changes them.

If older documentation, an old acceptance test, a historical branch, a temporary implementation, or a future coding session conflicts with this section, **this section wins**.

## 1. K.I.N.G.S. AI is the master builder, not the mandatory remote brain for every K.I.N.G.S. app

K.I.N.G.S. AI is the general-purpose engineering and orchestration application. It must be capable of:

- understanding owner missions;
- planning and decomposing work;
- inspecting repositories and source code;
- selecting and coordinating AI/model resources;
- creating and modifying code through governed write boundaries;
- executing build and test tools;
- diagnosing failures;
- repairing and retesting;
- preserving evidence, memory, and mission state;
- recovering from interruption;
- building and improving other applications.

K.I.N.G.S. AI is therefore the **master software-building system** in the family.

However, Author's Forge and K.I.N.G.S. Collector's Kingdom are **not thin clients that must depend on the K.I.N.G.S. AI application for every AI request**.

## 2. Every major K.I.N.G.S. application gets its own full brain

The following applications are intended to be independently intelligent applications:

- **K.I.N.G.S. AI**
- **K.I.N.G.S. Author's Forge**
- **K.I.N.G.S. Collector's Kingdom**

Each application may contain its own complete instance of the K.I.N.G.S. brain architecture, including its own:

- model/provider registry;
- OmniRoute integration;
- 9Router integration;
- multi-provider routing and fallback;
- memory and project/domain context;
- governed research access;
- tool authorization;
- planning and agent/workforce behavior;
- verification and recovery policies;
- cost, quality, reliability, and latency policy;
- application-specific prompts, agents, tools, and workflows.

**Forge and Kingdom must be able to run their own AI workloads without requiring the K.I.N.G.S. AI application to be online.**

## 3. Shared brain DNA, independent application brains

The three applications should not become three unrelated copies of duplicated code that drift apart.

The intended long-term structure is a reusable **K.I.N.G.S. Brain Core** — shared libraries/modules/packages that implement common intelligence infrastructure — embedded or consumed independently by each application.

Conceptually:

```text
K.I.N.G.S. BRAIN CORE
│
├── provider/model registry
├── OmniRoute + 9Router + additional configured providers
├── routing/fallback policy
├── context + memory primitives
├── research + source provenance
├── tool governance
├── verification + evidence
└── recovery + continuity

        │
        ├── K.I.N.G.S. AI
        │   ├── coding workforce
        │   ├── repository engineering
        │   ├── application building
        │   └── autonomous engineering missions
        │
        ├── AUTHOR'S FORGE
        │   ├── writing/creative workforce
        │   ├── Editor's Office
        │   ├── canon/book memory
        │   ├── research
        │   └── publishing/creation workflows
        │
        └── COLLECTOR'S KINGDOM
            ├── Keeper
            ├── collection intelligence
            ├── identification/research
            ├── valuation/marketplace workflows
            └── image/voice interaction
```

A Brain Core improvement should be reusable across the family without forcing the applications to share one live process or one mandatory remote brain.

## 4. Provider policy: strong routed intelligence first, local fallback last

K.I.N.G.S. is a **multi-provider system**.

The normal intelligence path must favor the configured high-capability routing pipeline rather than hard-wire one small local model as the primary brain.

The intended default policy is:

```text
Mission / AI request
        ↓
K.I.N.G.S. routing + governance
        ↓
OmniRoute
        ↓
9Router
        ↓
other authorized/configured providers or direct models
        ↓
local/self-hosted fallback when appropriate
        ↓
Ollama/local small model as last-resort or offline fallback
```

Exact provider ordering may be changed by owner policy, cost constraints, capability requirements, availability, reliability, privacy requirements, or mission-specific routing rules.

### Ollama rule

**Ollama is not the architectural center of K.I.N.G.S.**

Ollama is a useful local/self-hosted execution option and resilience fallback. It may support offline work, zero-provider-cost work, privacy-sensitive work, development, testing, or emergency degradation.

An Ollama-only acceptance test may prove a local-fallback capability, but **failure of an Ollama-only path must not be treated as proof that the normal routed K.I.N.G.S. architecture is broken.**

No production architecture should be redesigned around a small Ollama model merely because an old test directly instantiated `OllamaIntelligenceModel`.

## 5. K.I.N.G.S. AI may build Forge and Kingdom without becoming their runtime dependency

K.I.N.G.S. AI should be able to inspect, modify, build, test, harden, and improve Author's Forge and Collector's Kingdom.

That engineering relationship is distinct from runtime intelligence.

```text
K.I.N.G.S. AI ──builds/improves──> Author's Forge
K.I.N.G.S. AI ──builds/improves──> Collector's Kingdom

Author's Forge ──runs──> its own K.I.N.G.S. Brain Core instance
Collector's Kingdom ──runs──> its own K.I.N.G.S. Brain Core instance
K.I.N.G.S. AI ──runs──> its own K.I.N.G.S. Brain Core instance
```

Optional inter-application calls are allowed. For example, Forge or Kingdom may explicitly delegate an application-engineering mission back to K.I.N.G.S. AI. That must remain an **optional collaboration path**, not a hidden hard dependency for normal operation.

## 6. Hosted deployment and native clients do not change the brain ownership model

Hosted/private deployments such as Render may run separate services for:

- K.I.N.G.S. AI;
- OmniRoute;
- Author's Forge;
- Collector's Kingdom;
- other approved infrastructure.

Private service networking is preferred where appropriate for model routing and internal application communication.

Android, iOS, desktop, browser, or console-facing clients may connect to hosted/private application services, but a client packaging decision must not silently collapse the independent-brain architecture into one mandatory central brain.

## 7. No architectural drift by convenience

Before adding a new router, model abstraction, memory system, worker system, task system, or app-to-app dependency, engineering work must first inspect the existing implementation and determine whether the capability belongs in the shared Brain Core or an application-specific layer.

Do **not** create parallel subsystems simply because they are easier to code in the current session.

Do **not** reinterpret a fallback implementation as the product architecture.

Do **not** make Forge or Kingdom dependent on K.I.N.G.S. AI merely because K.I.N.G.S. already has equivalent code.

Do **not** duplicate shared brain infrastructure independently in all three applications when a reusable shared module/package is the correct integration point.

## 8. Definition of real completion

The governing engineering rule remains:

> **Requirement → existing-code audit → correct integration point → build → integrate → unit test → integration test → end-to-end test → real-world proof → complete.**

A file existing, TypeScript compiling, a mock passing, a UI turning green, or a console printing `SUCCESS` is not sufficient by itself.

For autonomous software-engineering capability, real proof means K.I.N.G.S. must be able to take an owner mission through the actual chain:

```text
owner direction / Build From This Vision
        ↓
persistent mission + approved plan
        ↓
provider/model routing
        ↓
repository inspection
        ↓
workforce/task execution
        ↓
governed code changes
        ↓
real build + tests
        ↓
failure diagnosis
        ↓
repair + retest when necessary
        ↓
evidence + verification
        ↓
durable mission completion
```

---

# Current family responsibilities

## K.I.N.G.S. AI

General-purpose governed AI workforce and software-engineering application. It is responsible for autonomous application-building capability, repository engineering, workforce orchestration, provider/model routing, verification, recovery, evidence, and mission continuity.

## Author's Forge

Standalone creative-production application with its own K.I.N.G.S.-derived brain. It specializes the shared intelligence architecture for writing, editing, canon continuity, research, books, covers, publishing workflows, and other approved creative offices.

## K.I.N.G.S. Collector's Kingdom

Standalone collector application with its own K.I.N.G.S.-derived brain. It specializes the shared intelligence architecture for collection management, the Keeper, identification, research, valuation, marketplace intelligence, imagery, voice, and collector workflows.

---

# Canonical engineering references

- [`KINGS-V1-MASTER-CURRENT-REFERENCE.md`](./KINGS-V1-MASTER-CURRENT-REFERENCE.md) — detailed V1 architecture, verified historical implementation, and governing build structure.
- [`APP_ROUTER.md`](./APP_ROUTER.md) — current app-facing AI router/runtime documentation.
- [`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md) — production-readiness evidence and remaining gates.
- [`PRODUCTION_HARDENING_REPORT.md`](./PRODUCTION_HARDENING_REPORT.md) — hardening findings and validated corrections.
- [`.env.example`](./.env.example) — runtime/provider configuration surface. Never commit real credentials.

When these documents contain older implementation details that conflict with the **Architecture Gospel** above, preserve the history but follow the Architecture Gospel.

---

# Core development commands

```bash
npm ci
npm run build
npm test
npm run verify
npm start
npm run start:router
```

Specialized acceptance tests may exist for individual fallback modes or subsystems. They are evidence for the capability they actually test; they do not redefine the architecture.

---

# Owner rule

The owner may explicitly change any locked architectural rule. Until that happens, engineering work must preserve these invariants and treat proposed conflicting changes as architectural drift rather than silently implementing them.
