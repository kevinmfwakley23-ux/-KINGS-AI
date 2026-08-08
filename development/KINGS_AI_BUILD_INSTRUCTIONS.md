# K.I.N.G.S. AI BUILD INSTRUCTIONS

## Operational Instructions for the AI Coding System

**Status:** LOCKED  
**Companion Specification:** `KINGS_BUILD_SPEC.md`

---

# 1. YOUR ROLE

You are the primary AI software architect and implementation engineer for the K.I.N.G.S. system.

Your job is to transform the architecture defined in:

`KINGS_BUILD_SPEC.md`

into a working, tested, maintainable software system.

You are not permitted to redesign the K.I.N.G.S. architecture casually.

You may improve implementation details when doing so preserves the locked architectural intent.

If an implementation decision would materially change the architecture, stop and request human approval.

---

# 2. FIRST COMMANDMENT

Before writing code:

READ THE SPECIFICATION.

You must first read:

`KINGS_BUILD_SPEC.md`

Then inspect the existing workspace and repositories.

Do not begin implementation based solely on this instruction file.

The Build Specification defines WHAT K.I.N.G.S. is.

This document defines HOW you must construct it.

---

# 3. CORE DEVELOPMENT PHILOSOPHY

Build:

SMALL → WORKING → TESTED → VERIFIED → COMMITTED → EXPANDED

Never build:

LARGE → UNTESTED → INTERDEPENDENT → DIFFICULT TO RECOVER

Every development milestone must produce something demonstrably functional.

---

# 4. INSPECT BEFORE IMPLEMENTING

Before creating new architecture:

1. Inspect the existing K.I.N.G.S. workspace.
2. Inspect the existing `kings-collectibles-1` repository.
3. Identify reusable code.
4. Identify existing interfaces.
5. Identify existing service patterns.
6. Identify existing storage abstractions.
7. Identify existing API patterns.
8. Identify existing authentication patterns.
9. Identify existing tests.
10. Identify existing TypeScript configuration.
11. Identify existing project conventions.

Do not rebuild functionality that already exists unless there is a demonstrated architectural reason.

---

# 5. DO NOT DESTROY WORKING CODE

Existing working software is an asset.

Never delete or replace existing working functionality merely because another implementation appears cleaner.

Before modifying an existing subsystem:

- understand it
- identify dependencies
- determine whether it is part of K.I.N.G.S. core
- determine whether it belongs to a project-specific domain
- test it before modification

If uncertain, preserve the existing implementation and create an adapter or abstraction instead.

---

# 6. KINGS COLLECTIBLES IS A PROJECT, NOT THE ENGINE

The existing repository:

`kings-collectibles-1`

contains valuable working code.

Treat it as an existing application/project.

Do not turn the entire Collectibles application into the K.I.N.G.S. AI engine.

Separate:

K.I.N.G.S. CORE

from:

PROJECT-SPECIFIC DOMAIN CODE

Conceptually:

K.I.N.G.S. CORE
- orchestration
- agents
- knowledge
- memory
- research
- tools
- workflows
- evaluation
- observability

PROJECT DOMAINS
- Collectibles
- Books
- Research
- Future projects

Reuse compatible Collectibles infrastructure where appropriate.

Do not contaminate generic K.I.N.G.S. services with Collectibles-specific business rules.

---

# 7. OPEN-SOURCE PROJECTS ARE REFERENCES

The following projects were investigated during architecture research:

- AgentMemory
- Inkeep Agents
- Vercel Knowledge Agent Template
- Memanto
- Letta
- CrewAI
- BeeAI

They are NOT automatically dependencies.

Use them as architectural references.

Adopt ideas only when they solve a defined K.I.N.G.S. requirement.

Do not install or clone a project simply because it is popular.

---

# 8. ARCHITECTURAL SOURCE MAP

## AgentMemory

Use as primary architectural inspiration for:

- persistent memory
- working memory
- episodic memory
- semantic memory
- procedural memory
- hybrid retrieval
- BM25
- vector retrieval
- graph retrieval
- provenance
- memory lifecycle
- snapshots
- agent coordination
- auditability

Do not blindly import the entire repository.

---

## Inkeep Agents

Use as architectural inspiration for:

- agents
- sub-agents
- orchestration
- tool permissions
- MCP
- declarative agent configuration
- agent workflows
- observability concepts

Do not make Inkeep a mandatory runtime dependency.

---

## Vercel Knowledge Agent Template

Use as inspiration for:

- filesystem-first knowledge
- source ingestion
- document retrieval
- knowledge agents
- human-readable project state

Do not automatically adopt its entire web/application stack.

---

## Memanto

Use as reference for:

- memory management
- memory extraction
- memory consolidation
- typed memory
- recall
- provenance

Do not introduce Memanto if another implementation already satisfies the requirement.

---

## Letta

Use as reference for:

- persistent agents
- long-running agents
- agent state
- memory-aware agents
- context management

Do not introduce Letta functionality merely because Letta exists in the environment.

---

# 9. DEPENDENCY DISCIPLINE

Every dependency must justify its existence.

Before adding a dependency, determine:

1. What problem does it solve?
2. Does K.I.N.G.S. actually require that capability?
3. Can existing code solve it?
4. Can a small internal abstraction solve it?
5. Does another installed dependency already provide it?
6. What is its storage cost?
7. What is its runtime cost?
8. Does it support ARM64/Linux?
9. Does it increase maintenance complexity?
10. Does it lock K.I.N.G.S. to a vendor?

If the answer is unclear:

DO NOT INSTALL IT YET.

---

# 10. CHROMEBOOK RESOURCE CONSTRAINT

The current development environment has approximately:

- 12 GB Linux storage
- ARM64 architecture
- Python 3.13.x
- Node.js 24.x
- uv
- npm/pnpm
- Git
- GitHub CLI

Storage and computational efficiency are architectural requirements.

Avoid unnecessary:

- Docker stacks
- large model packages
- duplicate Python environments
- duplicate Node installations
- vector databases
- databases
- caches
- build artifacts
- cloned repositories
- development dependencies

Prefer:

- lightweight libraries
- local files
- SQLite where appropriate
- modular services
- lazy loading
- replaceable providers
- filesystem-first storage

---

# 11. NEVER INSTALL EVERYTHING

K.I.N.G.S. must NOT become a collection of every AI framework available.

Do not install:

CrewAI + BeeAI + Letta + Memanto + AgentMemory + Inkeep + every vector DB + every MCP framework

unless testing demonstrates a real need.

Prefer:

ONE IMPLEMENTATION

per capability.

For example:

ONE primary orchestration layer.

ONE primary memory implementation.

ONE primary knowledge storage strategy.

ONE tool interface.

Alternative projects remain research references until proven superior.

---

# 12. BUILD THE INTERFACES FIRST

Major subsystems must communicate through explicit interfaces.

Examples:

```text
Agent
AgentRegistry
Task
TaskResult
KnowledgeSource
KnowledgeRecord
Evidence
Memory
MemoryQuery
MemoryResult
ResearchReport
Workflow
Tool
ToolResult
Project
CanonRecord
